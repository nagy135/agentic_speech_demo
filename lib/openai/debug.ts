import { eventCategory, redactDebugPayload } from "../live/debug";

export function debugEnabled() {
  return process.env.DEBUG_MODE?.trim().toLowerCase() === "true";
}

export function serverDebug(
  context: Record<string, unknown>,
  type: string,
  payload: unknown = null,
) {
  if (!debugEnabled()) return;
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      source: "server",
      ...context,
      category: eventCategory(type, payload),
      type,
      payload: redactDebugPayload(payload),
    }),
  );
}
