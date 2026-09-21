import { ArrowRight, Mic, MicOff, PhoneOff, X } from "lucide-react";
import type { RealtimeController } from "@/hooks/use-realtime";
export function ConversationControls({ voice }: { voice: RealtimeController }) {
  const live = voice.status === "connected";
  const connecting = voice.status === "connecting";
  return (
    <div className="conversation-actions">
      {!live && !connecting && (
        <button className="primary-button" onClick={() => void voice.start()}>
          <Mic size={18} />
          {voice.transcript.length
            ? "Start a new conversation"
            : "Let’s find my instrument"}
          <ArrowRight size={17} />
        </button>
      )}
      {connecting && (
        <button className="secondary-button" onClick={voice.stop}>
          <X size={17} />
          Cancel connection
        </button>
      )}
      {live && (
        <>
          <button
            className={`primary-button mute-button ${voice.muted ? "is-muted" : ""}`}
            onClick={voice.toggleMute}
            aria-pressed={voice.muted}
          >
            {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
            {voice.muted ? "Unmute microphone" : "Mute microphone"}
          </button>
          <button className="end-button" onClick={voice.stop}>
            <PhoneOff size={17} /> End chat
          </button>
          {!voice.activeSettings.createResponse && (
            <button
              className="secondary-button"
              disabled={!voice.canRespond || voice.settingsApplying}
              onClick={voice.requestResponse}
            >
              <ArrowRight size={17} /> Reply now
            </button>
          )}
        </>
      )}
    </div>
  );
}
