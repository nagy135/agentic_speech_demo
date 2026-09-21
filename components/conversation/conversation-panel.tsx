import { AudioLines, Globe2, Headphones, Volume2 } from "lucide-react";
import type { LiveController } from "@/hooks/use-live";
import { getConversationTitle } from "@/lib/live/presentation";
import { SoundOrb } from "./sound-orb";
import { ConversationControls } from "./conversation-controls";
export function ConversationPanel({ voice }: { voice: LiveController }) {
  const live = voice.status === "connected";
  const connecting = voice.status === "connecting";
  const choice = voice.selection.choice;
  const captions = (["user", "assistant"] as const)
    .map((role) =>
      voice.transcript.filter((entry) => entry.role === role).at(-1),
    )
    .filter((entry) => !!entry);
  return (
    <section
      className={`conversation-panel ${live ? "is-live" : ""}`}
      aria-label="Voice conversation with Melody"
    >
      <div className="guide-intro">
        <div className="guide-avatar">
          <AudioLines size={24} />
        </div>
        <div>
          <h2>
            Meet Melody <span>YOUR MUSIC GUIDE</span>
          </h2>
          <p>A good listener. With a pretty good ear.</p>
        </div>
        <div className={`session-status ${live ? "online" : ""}`}>
          <span />
          {live
            ? "Connected"
            : voice.status === "closing"
              ? "Ending chat"
              : connecting
                ? "Connecting"
                : "Ready when you are"}
        </div>
      </div>
      <div className="conversation-body">
        <SoundOrb live={live} activity={voice.activity} />
        <div className="conversation-content">
          <p className="conversation-kicker">
            {choice
              ? "YOUR NEXT CHAPTER"
              : live
                ? "LET’S FIND YOUR FIRST NOTE"
                : "A LITTLE CHAT. A NEW POSSIBILITY."}
          </p>
          <h3>{getConversationTitle(voice)}</h3>
          <p className="conversation-description">
            {connecting
              ? "Allow your microphone and we’ll take it from there."
              : live
                ? "Talk naturally, interrupt anytime, and switch languages whenever you like. GPT-Live can listen while speaking."
                : "Tell me what you love listening to, and a little about yourself. I’ll help you discover an instrument that fits."}
          </p>
          <ConversationControls voice={voice} />
          {voice.status === "idle" && (
            <p className="microphone-note">
              Just your voice. No musical experience needed.
            </p>
          )}
          {voice.audioBlocked && (
            <button
              className="audio-resume"
              onClick={() => void voice.resumeAudio()}
            >
              <Volume2 size={16} /> Tap to hear Melody
            </button>
          )}
        </div>
      </div>
      {voice.error && (
        <div className="error-message" role="alert">
          {voice.error}
        </div>
      )}
      {live &&
        captions.map((caption) => (
          <div className="live-caption" key={caption.role}>
            <span>{caption.role === "assistant" ? "MELODY" : "YOU"}</span>
            <p>{caption.text}</p>
          </div>
        ))}
      <div className="panel-footer">
        <span>
          <Globe2 size={15} />
          Start in English. Continue in your language.
        </span>
        <span>
          <Headphones size={15} />
          Headphones welcome
        </span>
      </div>
    </section>
  );
}
