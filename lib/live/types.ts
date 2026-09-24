import type { ChoiceState } from "../tools";
import type { VoiceSettings } from "./settings";
export type ConnectionStatus = "idle" | "connecting" | "connected" | "closing";
export type Activity = "listening" | "thinking" | "speaking";
export interface Transcript {
  id: string;
  role: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
}
export interface LiveSnapshot {
  status: ConnectionStatus;
  activity: Activity;
  backendWorking: boolean;
  muted: boolean;
  error: string | null;
  audioBlocked: boolean;
  activeSettings: VoiceSettings;
  settingsApplying: boolean;
  nudgeMessage: string;
  nudgeSaving: boolean;
  sessionId: string | null;
  usageSeconds: number;
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
export interface BackendEvent {
  type: string;
  item?: Partial<FunctionCall>;
  response?: { id: string; status?: string; error?: { message?: string } };
}
export interface ServerEvent {
  type: string;
  event_id?: string;
  client_event_id?: string;
  session?: { id: string };
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  offset_ms?: number;
  delegation?: { id: string; target: string; response_id?: string };
  delegation_id?: string | null;
  event?: BackendEvent;
  usage?: { seconds: number };
  reason?: string;
  error?: { message?: string; code?: string; client_event_id?: string };
}
export function isFunctionCall(
  item?: Partial<FunctionCall>,
): item is FunctionCall {
  return (
    !!item &&
    item.type === "function_call" &&
    item.status === "completed" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}
