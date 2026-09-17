import { emptyChoiceState, executeTool, type UserTurn } from "../tools";
import { RealtimeTransport } from "./transport";
import {
  isFunctionCall,
  type RealtimeSnapshot,
  type ServerEvent,
  type Transcript,
} from "./types";

function initialSnapshot(): RealtimeSnapshot {
  return {
    status: "idle",
    activity: "listening",
    muted: false,
    error: null,
    audioBlocked: false,
    transcript: [],
    selection: emptyChoiceState(),
  };
}

/** Protocol/session state, independent of React. Snapshots are immutable. */
export class RealtimeClient {
  private snapshot = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  private transport: RealtimeTransport | null = null;
  private latestTurn: UserTurn & { id: string } = {
    sequence: 0,
    text: "",
    id: "",
  };
  private readonly handledCalls = new Set<string>();
  private responseActive = false;
  private continuationPending = false;

  getSnapshot = (): RealtimeSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async start(audio: HTMLAudioElement): Promise<void> {
    if (this.transport) return;
    this.latestTurn = { sequence: 0, text: "", id: "" };
    this.handledCalls.clear();
    this.responseActive = false;
    this.continuationPending = false;
    this.update({ ...initialSnapshot(), status: "connecting" });
    const transport = new RealtimeTransport(audio, {
      onOpen: () => {
        this.update({ status: "connected" });
        this.responseActive = true;
        transport.send({
          type: "response.create",
          response: {
            instructions:
              "Start the conversation in English. Briefly introduce yourself as Melody and ask what kind of music the user would love to play. Do not suggest any instruments yet.",
          },
        });
      },
      onEvent: (event) => this.handleEvent(event),
      onError: (error) => {
        this.stop();
        this.update({ error });
      },
      onAudioBlocked: () => this.update({ audioBlocked: true }),
    });
    this.transport = transport;
    await transport.connect();
  }

  stop = (): void => {
    this.dispose();
    this.update({
      status: "idle",
      activity: "listening",
      muted: false,
      audioBlocked: false,
    });
  };

  dispose = (): void => {
    this.transport?.close();
    this.transport = null;
  };

  toggleMute = (): void => {
    if (this.snapshot.status !== "connected") return;
    const muted = !this.snapshot.muted;
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
      if (transport === this.transport)
        this.update({
          error:
            "Audio playback is blocked. Check your browser's sound permissions.",
        });
    }
  };

  private update(patch: Partial<RealtimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private updateTranscript(
    id: string,
    role: Transcript["role"],
    text: string,
    append = false,
  ): void {
    const entries = this.snapshot.transcript;
    const found = entries.find((entry) => entry.id === id);
    const updated = {
      id,
      role,
      text: append ? (found?.text || "") + text : text,
    };
    this.update({
      transcript: (found
        ? entries.map((entry) => (entry.id === id ? updated : entry))
        : [...entries, updated]
      ).slice(-100),
    });
  }

  private handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.update({ activity: "listening" });
        break;
      case "input_audio_buffer.speech_stopped":
        this.update({ activity: "thinking" });
        break;
      case "input_audio_buffer.committed":
        this.latestTurn = {
          id: event.item_id || "",
          sequence: this.latestTurn.sequence + 1,
          text: "",
        };
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.item_id === this.latestTurn.id)
          this.latestTurn.text = event.transcript || "";
        if (event.item_id && event.transcript)
          this.updateTranscript(event.item_id, "user", event.transcript);
        break;
      case "conversation.item.input_audio_transcription.failed":
        this.update({
          error:
            "A caption could not be transcribed. You can keep talking; please repeat your choice if confirmation fails.",
        });
        break;
      case "response.output_audio_transcript.delta":
        if (event.item_id && event.delta)
          this.updateTranscript(event.item_id, "assistant", event.delta, true);
        break;
      case "response.output_audio_transcript.done":
        if (event.item_id && event.transcript)
          this.updateTranscript(event.item_id, "assistant", event.transcript);
        break;
      case "response.created":
        this.responseActive = true;
        this.update({ activity: "thinking" });
        break;
      case "output_audio_buffer.started":
        this.update({ activity: "speaking" });
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.update({ activity: "listening" });
        break;
      case "response.done":
        void this.handleResponse(event);
        break;
      case "error":
        if (event.error?.code !== "response_cancel_not_active")
          this.update({
            error:
              event.error?.message ||
              "A voice session error occurred. Please try again.",
          });
        break;
    }
  }

  private async handleResponse(event: ServerEvent): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    this.responseActive = false;
    if (event.response?.status === "failed")
      this.update({
        error:
          event.response.status_details?.error?.message ||
          "The assistant could not respond. Try speaking again.",
      });
    const calls = (event.response?.output || [])
      .filter(isFunctionCall)
      .filter((call) => !this.handledCalls.has(call.call_id));
    const turnSequence = this.latestTurn.sequence;
    for (const call of calls) {
      this.handledCalls.add(call.call_id);
      // Transcription may arrive after the audio response. Missing evidence fails closed.
      if (call.name === "finalize_choice" && !this.latestTurn.text)
        await this.waitForTranscript(transport);
      if (transport !== this.transport) return;
      const result =
        turnSequence === this.latestTurn.sequence
          ? executeTool(
              call.name,
              call.arguments,
              this.snapshot.selection,
              this.latestTurn,
            )
          : {
              state: this.snapshot.selection,
              output: {
                ok: false,
                error:
                  "The user has started a new turn. Listen to their latest request before trying again.",
              },
            };
      this.update({ selection: result.state });
      transport.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result.output),
        },
      });
    }
    if (calls.length) this.continuationPending = true;
    if (this.continuationPending && !this.responseActive) {
      this.continuationPending = false;
      this.responseActive = true;
      transport.send({ type: "response.create" });
    }
  }

  private async waitForTranscript(transport: RealtimeTransport): Promise<void> {
    const deadline = Date.now() + 2500;
    while (
      transport === this.transport &&
      !this.latestTurn.text &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
