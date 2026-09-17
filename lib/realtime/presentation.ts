import type { RealtimeSnapshot } from "./types";

export function getConversationTitle(voice: RealtimeSnapshot): string {
  if (voice.status === "connecting") return "Getting in tune…";
  if (voice.selection.choice) return "Sounds like a beautiful beginning.";
  if (voice.status !== "connected")
    return "You don’t need to know music.\nJust know what moves you.";
  if (voice.muted) return "Take your time. I’m here.";
  if (voice.activity === "speaking")
    return "A little inspiration, coming your way.";
  if (voice.activity === "thinking") return "Finding your kind of sound…";
  return "I’m listening. What moves you?";
}
