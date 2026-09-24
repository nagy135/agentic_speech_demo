export const defaultNudgeMessage = "tell me current time";

export function parseNudgeMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Enter a message to send every 30 seconds.");
  const message = value.trim();
  // Stay below the API's 500-token append limit, including time context.
  if (new TextEncoder().encode(message).byteLength > 400)
    throw new Error("The message is too long. Please shorten it.");
  return message;
}
