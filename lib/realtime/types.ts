import type { ChoiceState } from "../tools";
import type { VoiceSettings } from "./settings";

export type ConnectionStatus = "idle" | "connecting" | "connected";
export type Activity = "listening" | "thinking" | "speaking";
export interface Transcript {
  id: string;
  role: "user" | "assistant";
  text: string;
}
export interface RealtimeSnapshot {
  status: ConnectionStatus;
  activity: Activity;
  muted: boolean;
  error: string | null;
  audioBlocked: boolean;
  canRespond: boolean;
  activeSettings: VoiceSettings;
  settingsApplying: boolean;
  transcript: Transcript[];
  selection: ChoiceState;
}
export interface FunctionCall {
  type: "function_call";
  status: "completed";
  name: string;
  call_id: string;
  arguments: string;
}
export interface ServerEvent {
  type: string;
  item_id?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string; code?: string; event_id?: string };
  response?: {
    status?: string;
    output?: Array<Partial<FunctionCall>>;
    status_details?: { error?: { message?: string } };
  };
}
export function isFunctionCall(
  item: Partial<FunctionCall>,
): item is FunctionCall {
  return (
    item.type === "function_call" &&
    item.status === "completed" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}
