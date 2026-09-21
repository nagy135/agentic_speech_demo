import { instrumentsById } from "./catalogue";

export type Suggestion = { instrumentId: string; reason: string };
export type ChoiceState = {
  suggestions: Suggestion[];
  choice: Suggestion | null;
  suggestedAtTurn: Record<string, number>;
};
export type UserTurn = { sequence: number; text: string };
export const emptyChoiceState = (): ChoiceState => ({
  suggestions: [],
  choice: null,
  suggestedAtTurn: {},
});

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSuggestion(
  value: unknown,
): value is Suggestion & Record<string, unknown> {
  return (
    object(value) &&
    typeof value.instrumentId === "string" &&
    instrumentsById.has(value.instrumentId) &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0 &&
    value.reason.length <= 600
  );
}
export function normalizeTranscript(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, "");
}

// Pure reducer shared by the live session and tests. Invalid calls never mutate the UI.
export function executeTool(
  name: string,
  raw: string,
  state: ChoiceState,
  turn: UserTurn,
): {
  state: ChoiceState;
  output: Record<string, unknown>;
} {
  const reject = (error: string) => ({ state, output: { ok: false, error } });
  let args: unknown;
  try {
    args = JSON.parse(raw);
  } catch {
    return reject("Invalid JSON arguments. Retry with valid JSON.");
  }
  if (!object(args)) return reject("Arguments must be an object.");
  if (name === "suggest_instrument") {
    if (state.choice)
      return reject(
        "A choice is already confirmed. Start a new conversation to explore again.",
      );
    if (
      !Array.isArray(args.suggestions) ||
      args.suggestions.length < 1 ||
      args.suggestions.length > 3 ||
      !args.suggestions.every(isSuggestion)
    ) {
      return reject(
        "Supply 1–3 catalogue instruments, each with a short nonempty reason.",
      );
    }
    const suggestions = args.suggestions;
    if (
      new Set(suggestions.map((s) => s.instrumentId)).size !==
      suggestions.length
    )
      return reject("Suggestions must be distinct.");
    const suggestedAtTurn = { ...state.suggestedAtTurn };
    for (const s of suggestions)
      suggestedAtTurn[s.instrumentId] ??= turn.sequence;
    return {
      state: { ...state, suggestions, suggestedAtTurn },
      output: { ok: true, displayed: suggestions.map((s) => s.instrumentId) },
    };
  }
  if (name === "finalize_choice") {
    if (state.choice) return reject("A choice is already confirmed.");
    if (!isSuggestion(args))
      return reject("Use a valid catalogue ID and a short reason.");
    const firstSuggested = state.suggestedAtTurn[args.instrumentId];
    if (firstSuggested === undefined || turn.sequence <= firstSuggested)
      return reject(
        "First suggest this instrument, then wait for explicit confirmation in a new user turn.",
      );
    if (
      args.explicitlyConfirmed !== true ||
      typeof args.confirmationQuote !== "string" ||
      !normalizeTranscript(args.confirmationQuote) ||
      !normalizeTranscript(turn.text).includes(
        normalizeTranscript(args.confirmationQuote),
      )
    ) {
      return reject(
        "Confirmation was not grounded in the latest user transcript. Ask the user to explicitly confirm this instrument, then retry with their original words.",
      );
    }
    const choice = { instrumentId: args.instrumentId, reason: args.reason };
    return {
      state: { ...state, suggestions: [], choice },
      output: { ok: true, chosen: args.instrumentId },
    };
  }
  return reject("Unknown tool.");
}
