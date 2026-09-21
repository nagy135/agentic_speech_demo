import { AudioLines, Globe2, Headphones, Volume2 } from "lucide-react";
import type { RealtimeController } from "@/hooks/use-realtime";
import { getConversationTitle } from "@/lib/realtime/presentation";
import { SoundOrb } from "./sound-orb";
import { ConversationControls } from "./conversation-controls";
export function ConversationPanel({ voice }: { voice: RealtimeController }) {
  const live = voice.status === "connected";
  const connecting = voice.status === "connecting";
  const choice = voice.selection.choice;
  const latestCaption = voice.transcript.at(-1);
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
                ? `Talk naturally${voice.activeSettings.interruptResponse ? ", interrupt anytime" : ""}, and switch languages whenever you like.${voice.activeSettings.createResponse ? "" : " Click Reply now after speaking."}`
                : "Tell me what you love listening to, and a little about yourself. I’ll help you discover an instrument that fits."}
          </p>
          <ConversationControls voice={voice} />
          {!live && !connecting && (
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
      {live && latestCaption && (
        <div className="live-caption">
          <span>{latestCaption.role === "assistant" ? "MELODY" : "YOU"}</span>
          <p>{latestCaption.text}</p>
        </div>
      )}
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
