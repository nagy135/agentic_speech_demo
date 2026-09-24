import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { serverDebug } from "@/lib/openai/debug";
import { attachSideband } from "@/lib/openai/sideband";
import { createSessionConfig } from "@/lib/session";
import { isSameOrigin } from "@/lib/http/is-same-origin";
import { readSessionError } from "@/lib/openai/session-error";
import { parseVoiceSettings, settingsHeader } from "@/lib/live/settings";

export const runtime = "nodejs";
export const maxDuration = 40;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestId = randomUUID();
  const started = Date.now();
  serverDebug({ requestId }, "http.session.received", {
    method: request.method,
  });
  const response = await createSession(request, requestId);
  serverDebug({ requestId }, "http.session.completed", {
    status: response.status,
    durationMs: Date.now() - started,
  });
  return response;
}

async function createSession(request: Request, requestId: string) {
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
  let settings;
  try {
    settings = parseVoiceSettings(request.headers.get(settingsHeader));
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof Error ? cause.message : "Invalid voice settings.",
      },
      { status: 400, headers },
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
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
    });
    const session = createSessionConfig(settings);
    serverDebug({ requestId }, "connection.initializing", {
      session,
      transport: { type: "webrtc", sdp },
    });
    const result = await client.live.create(
      {
        session,
        transport: { type: "webrtc", sdp },
      },
      {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      },
    );
    if (
      typeof result.session?.id !== "string" ||
      typeof result.transport?.sdp !== "string"
    )
      throw new Error("Invalid session response");
    serverDebug(
      { requestId, sessionId: result.session.id },
      "connection.initialized",
      result,
    );
    const sideband = await attachSideband(client, result.session.id, requestId);
    return Response.json(
      {
        debug: { sideband, requestId },
        session: { id: result.session.id },
        transport: { type: "webrtc", sdp: result.transport.sdp },
      },
      { headers },
    );
  } catch (cause) {
    serverDebug(
      { requestId },
      "connection.error",
      cause instanceof OpenAI.APIError
        ? {
            message: cause.message,
            status: cause.status,
            error: cause.error,
            requestId: cause.requestID,
          }
        : cause,
    );
    if (cause instanceof OpenAI.APIError && cause.status !== undefined) {
      const failure = readSessionError(cause);
      console.error("GPT-Live session rejected", {
        status: cause.status,
        code: failure.code,
        type: failure.type,
        requestId: failure.requestId,
      });
      return Response.json(
        { error: failure.message, code: failure.code },
        {
          status: cause.status === 429 ? 429 : 502,
          headers: {
            ...headers,
            ...(cause.status === 429 && failure.retryAfter
              ? { "Retry-After": failure.retryAfter }
              : {}),
          },
        },
      );
    }
    return Response.json(
      {
        error:
          "The voice connection timed out or was interrupted. Please try again.",
      },
      { status: 504, headers },
    );
  }
}
