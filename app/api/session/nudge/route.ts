import { isSameOrigin } from "@/lib/http/is-same-origin";
import { parseNudgeMessage } from "@/lib/live/nudge";
import { updateNudgeSession } from "@/lib/openai/nudge-sessions";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "This endpoint only accepts requests from this app." },
      { status: 403, headers },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Expected JSON." }, { status: 415, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing message.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return Response.json(
          { error: "The message is too long. Please shorten it." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const message = parseNudgeMessage(body?.message);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (
      typeof body?.sessionId !== "string" ||
      !token ||
      !updateNudgeSession(body.sessionId, token, message)
    )
      return Response.json(
        {
          error:
            "This conversation's sideband is unavailable. Start a new chat and try again.",
        },
        { status: 404, headers },
      );
    return Response.json({ message }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "Invalid JSON."
            : error instanceof Error
              ? error.message
              : "Invalid message.",
      },
      { status: 400, headers },
    );
  }
}
