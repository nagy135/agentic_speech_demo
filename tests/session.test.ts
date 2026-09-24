import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { POST } from "../app/api/session/route";
import { createSessionConfig } from "../lib/session";

const request = (
  body = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost:3000/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/sdp", ...headers },
    body,
  });

test("session has exactly the requested tools, audio, and language/confirmation instructions", () => {
  const config = createSessionConfig();
  assert.deepEqual(
    config.delegation.responses.tools.map((t) => t.name),
    ["suggest_instrument", "finalize_choice"],
  );
  assert.equal(config.model, "gpt-live-1");
  assert.match(config.delegation.responses.instructions, /original language/i);
  assert.match(
    config.delegation.responses.instructions,
    /specifically confirm/,
  );
});
test("session route validates configuration, input, and proxies SDP without exposing credentials", async (t) => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(typeof address === "object" && address);
  const previousBaseURL = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  const sockets: Promise<unknown>[] = [];
  server.on("connection", (socket) => sockets.push(once(socket, "close")));
  t.after(async () => {
    for (const socket of server.clients) {
      socket.send(JSON.stringify({ type: "session.closed" }));
    }
    await Promise.all(sockets);
    server.close();
    if (previousBaseURL === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBaseURL;
  });
  const previousKey = process.env.OPENAI_API_KEY;
  const previousDebug = process.env.DEBUG_MODE;
  process.env.DEBUG_MODE = "false";
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    if (previousDebug === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = previousDebug;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  process.env.OPENAI_API_KEY = "test-server-only-key";
  assert.equal(
    (await POST(request(undefined, { origin: "http://evil.example" }))).status,
    403,
  );
  assert.equal(
    (await POST(request(undefined, { "Content-Type": "text/plain" }))).status,
    415,
  );
  assert.equal((await POST(request("invalid"))).status, 400);
  assert.equal((await POST(request("x".repeat(33_000)))).status, 413);
  assert.equal(
    (await POST(request(undefined, { "X-Voice-Settings": '{"threshold":2}' })))
      .status,
    400,
  );
  global.fetch = async (input, init) => {
    assert.equal(input, `${process.env.OPENAI_BASE_URL}/live/sessions`);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-server-only-key",
    );
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.session.model, "gpt-live-1");
    assert.equal(payload.session.delegation.responses.tools.length, 2);
    assert.equal(payload.transport.type, "webrtc");
    assert.match(payload.transport.sdp, /^v=0/);
    return Response.json(
      {
        session: { id: "live_test", private: "do-not-forward" },
        transport: { type: "webrtc", sdp: "v=0\r\nmock-answer" },
      },
      { status: 201 },
    );
  };
  const dockerRequest = new Request("http://0.0.0.0:3000/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
    body: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
  });
  assert.equal((await POST(dockerRequest)).status, 200);
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.debug.sideband, "connected");
  assert.equal(body.nudge.message, "tell me current time");
  assert.match(body.nudge.token, /^[a-f0-9-]{36}$/);
  assert.match(body.debug.requestId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(body, {
    debug: body.debug,
    nudge: body.nudge,
    session: { id: "live_test" },
    transport: { type: "webrtc", sdp: "v=0\r\nmock-answer" },
  });
  global.fetch = async () =>
    new Response("sensitive upstream detail", { status: 401 });
  const rejected = await POST(request());
  assert.equal(rejected.status, 502);
  assert.doesNotMatch(await rejected.text(), /sensitive|test-server-only-key/);
  let attempts = 0;
  global.fetch = async () => {
    attempts++;
    return Response.json(
      { error: { code: "rate_limit_exceeded", type: "rate_limit_error" } },
      { status: 429, headers: { "retry-after": "15" } },
    );
  };
  const limited = await POST(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "15");
  const limitedBody = await limited.json();
  assert.equal(limitedBody.code, "rate_limit_exceeded");
  assert.match(limitedBody.error, /Wait 15 seconds/);
  assert.equal(attempts, 1, "session creation must not automatically retry");

  attempts = 0;
  global.fetch = async () => {
    attempts++;
    throw new TypeError("sensitive network detail");
  };
  const interrupted = await POST(request());
  assert.equal(interrupted.status, 504);
  assert.equal(attempts, 1);
  assert.doesNotMatch(
    await interrupted.text(),
    /sensitive|test-server-only-key/,
  );

  global.fetch = async () => {
    assert.fail("an aborted request must not reach OpenAI");
  };
  const controller = new AbortController();
  const aborted = new Request(request(), { signal: controller.signal });
  controller.abort();
  assert.equal((await POST(aborted)).status, 504);
});
