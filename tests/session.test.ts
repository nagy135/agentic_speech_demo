import { test } from "node:test";
import assert from "node:assert/strict";
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
    config.tools.map((t) => t.name),
    ["suggest_instrument", "finalize_choice"],
  );
  assert.deepEqual(config.output_modalities, ["audio"]);
  assert.match(config.instructions, /original language/i);
  assert.match(config.instructions, /specifically confirm/);
});
test("session route validates configuration, input, and proxies SDP without exposing credentials", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
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
  global.fetch = async (input, init) => {
    assert.equal(input, "https://api.openai.com/v1/realtime/calls");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-server-only-key",
    );
    assert.ok(init?.body instanceof FormData);
    const config = JSON.parse(init.body.get("session") as string);
    assert.equal(config.tools.length, 2);
    return new Response("v=0\r\nmock-answer", { status: 201 });
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
  assert.equal(await response.text(), "v=0\r\nmock-answer");
  global.fetch = async () =>
    new Response("sensitive upstream detail", { status: 401 });
  const rejected = await POST(request());
  assert.equal(rejected.status, 502);
  assert.doesNotMatch(await rejected.text(), /sensitive|test-server-only-key/);
  global.fetch = async () =>
    Response.json(
      { error: { code: "rate_limit_exceeded", type: "rate_limit_error" } },
      { status: 429, headers: { "retry-after": "15" } },
    );
  const limited = await POST(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "15");
  const limitedBody = await limited.json();
  assert.equal(limitedBody.code, "rate_limit_exceeded");
  assert.match(limitedBody.error, /Wait 15 seconds/);
});
