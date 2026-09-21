import { ArrowRight, Mic, MicOff, PhoneOff, X } from "lucide-react";
import type { LiveController } from "@/hooks/use-live";
export function ConversationControls({ voice }: { voice: LiveController }) {
  return (
    <div className="conversation-actions">
      {voice.status === "idle" && (
        <button className="primary-button" onClick={() => void voice.start()}>
          <Mic size={18} />
          {voice.transcript.length
            ? "Start a new conversation"
            : "Let’s find my instrument"}
          <ArrowRight size={17} />
        </button>
      )}
      {voice.status === "connecting" && (
        <button className="secondary-button" onClick={() => void voice.stop()}>
          <X size={17} />
          Cancel connection
        </button>
      )}
      {voice.status === "closing" && (
        <button className="secondary-button" disabled>
          Ending conversation…
        </button>
      )}
      {voice.status === "connected" && (
        <>
          <button
            className={`primary-button mute-button ${voice.muted ? "is-muted" : ""}`}
            onClick={voice.toggleMute}
            aria-pressed={voice.muted}
          >
            {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}
            {voice.muted ? "Unmute microphone" : "Mute microphone"}
          </button>
          <button className="end-button" onClick={() => void voice.stop()}>
            <PhoneOff size={17} /> End chat
          </button>
        </>
      )}
    </div>
  );
}
