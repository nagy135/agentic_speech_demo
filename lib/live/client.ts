import { emptyChoiceState, executeTool, normalizeTranscript } from "../tools";
import { LiveDebug } from "./debug";
import { LiveTransport } from "./transport";
import { LiveTranscripts } from "./transcripts";
import { greetingCue, greetingInstructions } from "./greeting";
import {
  backendSettings,
  defaultVoiceSettings,
  parseVoiceSettings,
  type VoiceSettings,
} from "./settings";
import {
  isFunctionCall,
  type FunctionCall,
  type LiveSnapshot,
  type ServerEvent,
} from "./types";

type Batch = {
  delegationId: string;
  cutoffMs: number;
  calls: FunctionCall[];
  handled: boolean;
};
function initialSnapshot(): LiveSnapshot {
  return {
    status: "idle",
    activity: "listening",
    backendWorking: false,
    muted: false,
    error: null,
    audioBlocked: false,
    activeSettings: { ...defaultVoiceSettings },
    settingsApplying: false,
    sessionId: null,
    usageSeconds: 0,
    transcript: [],
    selection: emptyChoiceState(),
  };
}

export class LiveClient {
  readonly debug = new LiveDebug();
  private snapshot = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  private transport: LiveTransport | null = null;
  private transcripts = new LiveTranscripts();
  private readonly handledCalls = new Set<string>();
  private readonly batches = new Map<string, Batch>();
  private readonly activeResponses = new Map<string, string>();
  private readonly delegations = new Map<string, number>();
  private readonly working = new Set<string>();
  private speaking = false;
  private commandSequence = 0;
  private pendingGreeting: string | null = null;
  private pendingSettings: { settings: VoiceSettings; eventId: string } | null =
    null;
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private closing: Promise<void> | null = null;
  private finishClosing: (() => void) | null = null;

  getSnapshot = (): LiveSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<LiveSnapshot>): void {
    const backendWorking = this.working.size > 0;
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      backendWorking,
      activity: this.speaking
        ? "speaking"
        : backendWorking
          ? "thinking"
          : "listening",
    };
    this.listeners.forEach((listener) => listener());
  }
  private eventId(prefix: string): string {
    return `${prefix}-${++this.commandSequence}`;
  }

  async start(
    audio: HTMLAudioElement,
    settings: VoiceSettings = defaultVoiceSettings,
  ): Promise<void> {
    if (this.transport) return;
    this.transcripts = new LiveTranscripts();
    this.handledCalls.clear();
    this.batches.clear();
    this.activeResponses.clear();
    this.delegations.clear();
    this.working.clear();
    this.speaking = false;
    this.pendingGreeting = null;
    this.update({
      ...initialSnapshot(),
      status: "connecting",
      activeSettings: { ...settings },
    });
    const transport = new LiveTransport(
      audio,
      {
        onEvent: (event) => {
          if (transport === this.transport) this.handleEvent(event);
        },
        onError: (error) => {
          if (transport === this.transport) this.finishSession(error);
        },
        onAudioBlocked: () => {
          if (transport === this.transport) this.update({ audioBlocked: true });
        },
        onSpeaking: (speaking) => {
          if (transport === this.transport) {
            this.speaking = speaking;
            this.update({});
          }
        },
      },
      this.debug,
    );
    this.transport = transport;
    await transport.connect(settings);
  }

  stop = (): Promise<void> => {
    if (this.closing) return this.closing;
    if (this.snapshot.status !== "connected" || !this.transport) {
      this.finishSession();
      return Promise.resolve();
    }
    this.clearSettingsUpdate();
    this.transport.silence();
    this.update({ status: "closing", muted: true, settingsApplying: false });
    const closing = new Promise<void>((resolve) => {
      this.finishClosing = resolve;
    });
    this.closing = closing;
    this.closeTimer = setTimeout(
      () =>
        this.finishSession(
          "The connection closed without final usage confirmation.",
        ),
      15_000,
    );
    this.transport.send({
      type: "session.close",
      event_id: this.eventId("close"),
    });
    return closing;
  };
  dispose = (): void => {
    void this.stop();
  };

  private finishSession(error?: string): void {
    this.pendingGreeting = null;
    this.clearSettingsUpdate();
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.transport?.close();
    this.transport = null;
    this.working.clear();
    this.speaking = false;
    this.update({
      status: "idle",
      muted: false,
      audioBlocked: false,
      settingsApplying: false,
      ...(error ? { error } : {}),
    });
    const finish = this.finishClosing;
    this.finishClosing = null;
    this.closing = null;
    finish?.();
  }

  toggleMute = (): void => {
    if (this.snapshot.status !== "connected") return;
    const muted = !this.snapshot.muted;
    // Disabling the browser track sends silence while preserving the continuous session.
    this.transport?.setMuted(muted);
    this.update({ muted });
  };
  resumeAudio = async (): Promise<void> => {
    const transport = this.transport;
    if (!transport) return;
    try {
      await transport.resumeAudio();
      if (transport === this.transport) this.update({ audioBlocked: false });
    } catch {
      this.update({
        error:
          "Audio playback is blocked. Check your browser's sound permissions.",
      });
    }
  };

  applySettings = (settings: VoiceSettings): void => {
    if (this.snapshot.status !== "connected" || this.pendingSettings) return;
    const next = parseVoiceSettings(JSON.stringify(settings));
    if (next.voice !== this.snapshot.activeSettings.voice) {
      this.update({ error: "Restart the chat to change the voice." });
      return;
    }
    if (
      JSON.stringify(backendSettings(next)) ===
      JSON.stringify(backendSettings(this.snapshot.activeSettings))
    ) {
      this.update({ activeSettings: next });
      return;
    }
    const eventId = this.eventId("settings");
    this.pendingSettings = { settings: next, eventId };
    this.update({ settingsApplying: true, error: null });
    this.settingsTimer = setTimeout(() => {
      void this.stop();
      this.update({
        error:
          "Settings were not confirmed. Start a new chat to apply your settings.",
      });
    }, 10_000);
    this.transport?.send({
      type: "session.update",
      event_id: eventId,
      session: {
        delegation: { type: "responses", responses: backendSettings(next) },
      },
    });
  };
  private clearSettingsUpdate(): void {
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = null;
    this.pendingSettings = null;
  }

  private handleEvent(event: ServerEvent): void {
    if (event.usage && Number.isFinite(event.usage.seconds))
      this.update({
        usageSeconds: Math.max(this.snapshot.usageSeconds, event.usage.seconds),
      });
    if (event.type === "session.closed") {
      this.finishSession(
        event.reason && !["close_requested", "completed"].includes(event.reason)
          ? `The voice session ended (${event.reason}). You can start a new chat.`
          : undefined,
      );
      return;
    }
    if (this.snapshot.status === "closing") return;
    switch (event.type) {
      case "session.started":
        if (this.snapshot.status !== "connecting") break;
        this.update({
          status: "connected",
          sessionId: event.session?.id || null,
        });
        this.pendingGreeting = this.eventId("greeting");
        this.transport?.send({
          type: "session.instructions.append",
          event_id: this.pendingGreeting,
          delegation_id: null,
          content: greetingInstructions,
        });
        break;
      case "session.instructions.appended":
        if (
          this.pendingGreeting &&
          event.client_event_id === this.pendingGreeting
        ) {
          this.pendingGreeting = null;
          // Instructions steer behavior; commentary cues speech on silent startup.
          // Do not restart the opening if either speaker has already begun.
          if (!this.snapshot.transcript.length && !this.speaking)
            this.transport?.send({
              type: "session.commentary.append",
              event_id: this.eventId("greeting-cue"),
              delegation_id: null,
              content: greetingCue,
            });
        }
        break;
      case "session.updated":
        if (
          this.pendingSettings &&
          event.client_event_id === this.pendingSettings.eventId
        ) {
          const settings = this.pendingSettings.settings;
          this.clearSettingsUpdate();
          this.update({ activeSettings: settings, settingsApplying: false });
        }
        break;
      case "session.input_transcript.delta":
      case "session.output_transcript.delta":
        this.transcripts.append(event);
        this.update({ transcript: this.transcripts.entries });
        break;
      case "session.delegation.created":
        if (event.delegation?.target === "responses") {
          this.delegations.set(
            event.delegation.id,
            event.offset_ms ?? this.transcripts.latestUser().endMs,
          );
          this.working.add(event.delegation.id);
          this.update({});
        }
        break;
      case "response.event":
        this.handleBackendEvent(event);
        break;
      case "error":
        if (event.error?.client_event_id === this.pendingGreeting)
          this.pendingGreeting = null;
        if (
          this.pendingSettings &&
          event.error?.client_event_id === this.pendingSettings.eventId
        ) {
          this.clearSettingsUpdate();
          this.update({ settingsApplying: false });
        }
        this.update({
          error:
            event.error?.message ||
            "A GPT-Live command failed. Try again or reconnect.",
        });
        break;
    }
  }

  private handleBackendEvent(envelope: ServerEvent): void {
    const event = envelope.event;
    if (!event) return;
    const delegationId = envelope.delegation_id || "application";
    if (event.type === "response.created" && event.response?.id) {
      this.activeResponses.set(delegationId, event.response.id);
      this.batches.set(event.response.id, {
        delegationId,
        cutoffMs:
          this.delegations.get(delegationId) ??
          this.transcripts.latestUser().endMs,
        calls: [],
        handled: false,
      });
      this.working.add(delegationId);
      this.update({});
    } else if (
      event.type === "response.output_item.done" &&
      isFunctionCall(event.item)
    ) {
      const id = this.activeResponses.get(delegationId);
      const batch = id ? this.batches.get(id) : undefined;
      if (
        batch &&
        !batch.calls.some((call) => call.call_id === event.item!.call_id)
      )
        batch.calls.push(event.item);
    } else if (event.type === "response.completed" && event.response?.id) {
      const batch = this.batches.get(event.response.id);
      if (batch && !batch.handled) {
        batch.handled = true;
        void this.completeBatch(batch, this.transport);
      }
    } else if (
      ["response.failed", "response.incomplete", "response.cancelled"].includes(
        event.type,
      )
    ) {
      if (event.response?.id) {
        const batch = this.batches.get(event.response.id);
        if (batch) batch.handled = true;
      }
      this.working.delete(delegationId);
      this.update({
        error:
          event.response?.error?.message ||
          "The instrument assistant could not finish. Please repeat your request.",
      });
    }
  }

  private async completeBatch(
    batch: Batch,
    transport: LiveTransport | null,
  ): Promise<void> {
    if (!transport) return;
    const active = () =>
      transport === this.transport && this.snapshot.status === "connected";
    let submitted = false;
    for (const call of batch.calls) {
      if (!active() || this.handledCalls.has(call.call_id)) continue;
      this.handledCalls.add(call.call_id);
      if (call.name === "finalize_choice") {
        let quote = "";
        try {
          quote = JSON.parse(call.arguments).confirmationQuote;
        } catch {
          /* executeTool rejects malformed arguments. */
        }
        if (typeof quote === "string" && normalizeTranscript(quote)) {
          const deadline =
            Date.now() + this.snapshot.activeSettings.transcriptWaitMs;
          while (
            active() &&
            Date.now() < deadline &&
            !normalizeTranscript(this.transcripts.latestUser().text).includes(
              normalizeTranscript(quote),
            )
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(50, deadline - Date.now())),
            );
          }
        }
      }
      if (!active()) return;
      const turn = this.transcripts.latestUser();
      const result =
        !turn.text.trim() || turn.endMs > batch.cutoffMs
          ? {
              state: this.snapshot.selection,
              output: {
                ok: false,
                error: !turn.text.trim()
                  ? "The user transcript is not available yet. Wait for the user to finish speaking before trying again."
                  : "The user spoke after this request began. Ask about their latest request before trying again.",
              },
            }
          : executeTool(
              call.name,
              call.arguments,
              this.snapshot.selection,
              turn,
            );
      this.update({ selection: result.state });
      transport.send({
        type: "response.item.create",
        event_id: this.eventId("tool"),
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result.output),
        },
      });
      submitted = true;
    }
    if (!active()) return;
    if (submitted)
      transport.send({
        type: "response.create",
        event_id: this.eventId("continue"),
      });
    else {
      this.working.delete(batch.delegationId);
      this.update({});
    }
  }
}
