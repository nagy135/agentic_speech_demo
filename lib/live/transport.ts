import { LiveDebug } from "./debug";
import type { ServerEvent } from "./types";
import {
  defaultVoiceSettings,
  settingsHeader,
  type VoiceSettings,
} from "./settings";

interface TransportCallbacks {
  onEvent: (event: ServerEvent) => void;
  onError: (message: string) => void;
  onAudioBlocked: () => void;
  onSpeaking: (speaking: boolean) => void;
}

/** Owns one WebRTC connection and every browser resource it acquires. */
export class LiveTransport {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private readonly abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private audioTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAudio: { energy: number; duration: number } | null = null;
  private speaking = false;
  private observingAudio = false;
  private lastStatsAt = 0;
  private lastInputAudio: { energy: number; duration: number } | null = null;
  private warnedStats = false;

  constructor(
    private readonly audio: HTMLAudioElement,
    private readonly callbacks: TransportCallbacks,
    private readonly debug = new LiveDebug(),
  ) {}

  async connect(settings: VoiceSettings = defaultVoiceSettings): Promise<void> {
    this.debug.record("client", "local", "connection.initializing", {
      settings,
    });
    this.timer = setTimeout(
      () =>
        this.fail(
          "Connection timed out. Check microphone permission and your internet connection, then try again.",
        ),
      45_000,
    );
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access requires localhost or HTTPS and a browser with WebRTC support.",
        );
      }
      this.debug.record("media", "local", "microphone.requested");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Permission can resolve after the user cancels or the component unmounts.
      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.debug.record(
        "media",
        "local",
        "microphone.acquired",
        stream
          .getAudioTracks()
          .map((track) => ({ id: track.id, settings: track.getSettings?.() })),
      );
      const peer = new RTCPeerConnection();
      this.peer = peer;
      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
        track.onended = () =>
          this.fail("Microphone access ended. Reconnect to continue.");
      });
      peer.ontrack = ({ streams, track }) => {
        if (this.closed) return;
        this.debug.record("webrtc", "received", "audio.track", {
          id: track.id,
          kind: track.kind,
          readyState: track.readyState,
        });
        this.audio.srcObject = streams[0] || new MediaStream([track]);
        void this.audio.play().catch(() => {
          if (!this.closed) {
            this.debug.record("media", "local", "playback.blocked");
            this.callbacks.onAudioBlocked();
          }
        });
      };
      peer.oniceconnectionstatechange = () =>
        this.debug.record("webrtc", "local", "ice.connection", {
          state: peer.iceConnectionState,
        });
      peer.onicegatheringstatechange = () =>
        this.debug.record("webrtc", "local", "ice.gathering", {
          state: peer.iceGatheringState,
        });
      peer.onsignalingstatechange = () =>
        this.debug.record("webrtc", "local", "signaling.state", {
          state: peer.signalingState,
        });
      peer.onicecandidateerror = (event) =>
        this.debug.record("webrtc", "local", "ice.error", {
          code: event.errorCode,
          message: event.errorText,
          url: event.url,
        });
      peer.onconnectionstatechange = () => {
        this.debug.record("webrtc", "local", "connection.state", {
          state: peer.connectionState,
        });
        if (
          ["failed", "disconnected", "closed"].includes(peer.connectionState)
        ) {
          this.fail(
            "The voice connection was interrupted. Reconnect to start a new conversation.",
          );
        }
      };
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onopen = () =>
        this.debug.record("webrtc", "local", "channel.open", {
          label: channel.label,
        });
      channel.onmessage = (message) => {
        if (this.closed) return;
        try {
          const event = JSON.parse(message.data) as ServerEvent;
          this.debug.record(
            "webrtc",
            "received",
            typeof event?.type === "string" ? event.type : "unknown",
            event,
          );
          if (!event || typeof event.type !== "string")
            throw new Error("Missing event type");
          if (event.type === "session.started") {
            this.clearTimer();
            if (!this.observingAudio) {
              this.observingAudio = true;
              void this.observeAudio();
            }
          }
          this.callbacks.onEvent(event);
        } catch (error) {
          this.debug.record("webrtc", "received", "channel.invalid_message", {
            raw: message.data,
            error,
          });
          this.fail(
            "An unexpected voice event was received. Please reconnect.",
          );
        }
      };
      channel.onclose = () =>
        this.fail("The voice session ended. You can start a new conversation.");
      channel.onerror = () =>
        this.fail(
          "The voice connection encountered a problem. Please try again.",
        );
      const offer = await peer.createOffer();
      if (this.closed) return;
      await peer.setLocalDescription(offer);
      await this.waitForIce(peer);
      if (this.closed) return;
      const sdpOffer = peer.localDescription?.sdp;
      if (!sdpOffer)
        throw new Error(
          "The browser did not create an audio connection offer.",
        );
      this.debug.record("http", "sent", "http.session.request", {
        sdp: sdpOffer,
        settings,
      });
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          [settingsHeader]: JSON.stringify(settings),
        },
        body: sdpOffer,
        signal: this.abort.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        this.debug.record("http", "received", "http.session.error", {
          status: response.status,
          body,
        });
        throw new Error(
          body.error || "Could not connect to the voice assistant.",
        );
      }
      const result = await response.json();
      this.debug.record("http", "received", "http.session.response", {
        status: response.status,
        body: result,
      });
      const sdp = result.transport?.sdp;
      if (typeof sdp !== "string")
        throw new Error(
          "The voice service returned an invalid connection answer.",
        );
      if (!this.closed) {
        await peer.setRemoteDescription({ type: "answer", sdp });
        this.debug.record("webrtc", "local", "sdp.answer.applied");
      }
    } catch (cause) {
      this.fail(connectionError(cause));
    }
  }

  send(event: object): void {
    const type = (event as { type?: string }).type || "unknown";
    if (!this.closed && this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify(event));
      this.debug.record("webrtc", "sent", type, event);
    } else {
      this.debug.record("webrtc", "local", "channel.send.failed", {
        event,
        state: this.channel?.readyState,
      });
    }
  }

  setMuted(muted: boolean): void {
    this.debug.record("media", "local", "microphone.muted", { muted });
    if (muted) {
      this.debug.speaking(false, this.speaking);
    }
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  async resumeAudio(): Promise<void> {
    await this.audio.play();
    this.debug.record("media", "local", "playback.resumed");
  }

  silence(): void {
    this.setMuted(true);
    this.audio.pause();
    this.speaking = false;
    this.debug.speaking(false, false);
    this.callbacks.onSpeaking(false);
  }

  private waitForIce(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", changed);
        this.abort.signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (peer.iceGatheringState === "complete") finish();
      };
      const aborted = () => finish(new Error("Connection cancelled."));
      const timer = setTimeout(
        () =>
          finish(
            new Error("Audio network discovery timed out. Try reconnecting."),
          ),
        10_000,
      );
      peer.addEventListener("icegatheringstatechange", changed);
      this.abort.signal.addEventListener("abort", aborted, { once: true });
      if (this.abort.signal.aborted) aborted();
      else changed();
    });
  }

  /** Independent input/output levels reflect overlap, silence, mute and playback. */
  private async observeAudio(): Promise<void> {
    if (this.closed || !this.peer) return;
    let speaking = false;
    let userSpeaking = false;
    try {
      const stats = await this.peer.getStats();
      const reports: object[] = [];
      stats.forEach((report) => {
        reports.push(report);
        if (report.kind !== "audio" && report.mediaType !== "audio") return;
        const input =
          report.type === "media-source" ||
          (report.type === "track" && !report.remoteSource);
        if (!input && report.type !== "inbound-rtp") return;
        const previous = input ? this.lastInputAudio : this.lastAudio;
        const sample = {
          energy: report.totalAudioEnergy,
          duration: report.totalSamplesDuration,
        };
        let level =
          typeof report.audioLevel === "number" ? report.audioLevel : 0;
        if (previous && sample.duration > previous.duration) {
          level = Math.sqrt(
            Math.max(0, sample.energy - previous.energy) /
              (sample.duration - previous.duration),
          );
        }
        if (
          Number.isFinite(sample.energy) &&
          Number.isFinite(sample.duration)
        ) {
          if (input) this.lastInputAudio = sample;
          else this.lastAudio = sample;
        }
        if (input)
          userSpeaking ||=
            level > 0.008 &&
            !!this.stream?.getAudioTracks().some((track) => track.enabled);
        else
          speaking ||=
            level > 0.008 &&
            !this.audio.paused &&
            !this.audio.muted &&
            this.audio.volume !== 0;
      });
      if (!this.closed && Date.now() - this.lastStatsAt >= 1000) {
        this.lastStatsAt = Date.now();
        this.debug.record("webrtc", "local", "audio.rtc_stats", reports);
      }
    } catch (error) {
      if (!this.warnedStats) {
        this.warnedStats = true;
        this.debug.record("webrtc", "local", "audio.stats.error", error);
      }
    }
    if (this.closed) return;
    this.debug.speaking(userSpeaking, speaking);
    if (speaking !== this.speaking) {
      this.speaking = speaking;
      this.callbacks.onSpeaking(speaking);
    }
    this.audioTimer = setTimeout(() => void this.observeAudio(), 150);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.debug.speaking(false, false);
    this.debug.record("client", "local", "connection.closed");
    if (this.audioTimer) clearTimeout(this.audioTimer);
    this.clearTimer();
    this.abort.abort();
    if (this.channel) {
      this.channel.onclose = null;
      this.channel.onerror = null;
      this.channel.onmessage = null;
      this.channel.onopen = null;
      this.channel.close();
      this.channel = null;
    }
    if (this.peer) {
      this.peer.oniceconnectionstatechange = null;
      this.peer.onicegatheringstatechange = null;
      this.peer.onsignalingstatechange = null;
      this.peer.onicecandidateerror = null;
      this.peer.onconnectionstatechange = null;
      this.peer.ontrack = null;
      this.peer.close();
      this.peer = null;
    }
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.audio.pause();
    this.audio.srcObject = null;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private fail(message: string): void {
    if (this.closed) return;
    this.debug.record("client", "local", "connection.error", { message });
    this.close();
    this.callbacks.onError(message);
  }
}

function connectionError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError")
    return "Microphone access was denied. Allow microphone access in your browser, then try again.";
  if (cause instanceof DOMException && cause.name === "NotFoundError")
    return "No microphone was found. Connect a microphone and try again.";
  return cause instanceof Error
    ? cause.message
    : "Could not start the voice conversation.";
}
