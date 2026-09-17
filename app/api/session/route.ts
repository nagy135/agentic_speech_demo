import { createSessionConfig } from "@/lib/session";
import { isSameOrigin } from "@/lib/http/is-same-origin";
import { readSessionError } from "@/lib/openai/session-error";

export const runtime = "nodejs";
export const maxDuration = 40;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: "This endpoint only accepts requests from this app." },
      { status: 403, headers },
    );
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      {
        error:
          "Add OPENAI_API_KEY to your .env file, then restart the development server.",
      },
      { status: 503, headers },
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/sdp")) {
    return Response.json(
      { error: "Expected a WebRTC SDP offer." },
      { status: 415, headers },
    );
  }
  // Read incrementally so a chunked request cannot bypass the body limit.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "Missing SDP offer." },
      { status: 400, headers },
    );
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 32_768) {
      await reader.cancel();
      return Response.json(
        { error: "SDP offer is too large." },
        { status: 413, headers },
      );
    }
    chunks.push(value);
  }
  const sdp = Buffer.concat(chunks).toString("utf8");
  if (!sdp.startsWith("v=0") || !sdp.includes("m=audio")) {
    return Response.json(
      { error: "Invalid audio SDP offer." },
      { status: 400, headers },
    );
  }
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(createSessionConfig()));
  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    });
    if (!upstream.ok) {
      const failure = await readSessionError(upstream);
      console.error("Realtime session rejected", {
        status: upstream.status,
        code: failure.code,
        type: failure.type,
        requestId: failure.requestId,
      });
      return Response.json(
        { error: failure.message, code: failure.code },
        {
          status: upstream.status === 429 ? 429 : 502,
          headers: {
            ...headers,
            ...(upstream.status === 429 && failure.retryAfter
              ? { "Retry-After": failure.retryAfter }
              : {}),
          },
        },
      );
    }
    return new Response(await upstream.text(), {
      headers: { ...headers, "Content-Type": "application/sdp" },
    });
  } catch {
    return Response.json(
      {
        error:
          "The voice connection timed out or was interrupted. Please try again.",
      },
      { status: 504, headers },
    );
  }
}
