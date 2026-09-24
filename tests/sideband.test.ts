import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import OpenAI from "openai";
import { WebSocketServer } from "ws";
import { attachDebugSideband } from "../lib/openai/sideband";

function capture(t: TestContext) {
  const previous = process.env.DEBUG_MODE;
  process.env.DEBUG_MODE = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = previous;
  });
  const logs: Array<{ type: string; payload: unknown; sessionId: string }> = [];
  t.mock.method(console, "log", (message: string) =>
    logs.push(JSON.parse(message)),
  );
  return logs;
}

test("sideband attaches with server auth, observes events without sending commands, and closes with session", async (t) => {
  const logs = capture(t);
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  t.after(() => {
    server.clients.forEach((socket) => socket.terminate());
    server.close();
  });
  const address = server.address();
  assert.ok(typeof address === "object" && address);
  const client = new OpenAI({
    apiKey: "test-server-key",
    baseURL: `http://127.0.0.1:${address.port}/v1`,
  });
  const connection = once(server, "connection");
  const attaching = attachDebugSideband(client, "live_test", "req-test");
  const [socket, request] = await connection;
  assert.equal(
    request.url,
    "/v1/live/sessions/live_test/attach?graceful_close=true",
  );
  assert.equal(request.headers.authorization, "Bearer test-server-key");
  const commands: unknown[] = [];
  socket.on("message", (message: unknown) => commands.push(message));
  assert.equal(await attaching, "connected");
  socket.send(
    JSON.stringify({
      type: "session.input_transcript.delta",
      delta: "Hello",
      event_id: "e1",
    }),
  );
  socket.send(
    JSON.stringify({ type: "session.input_audio.append", audio: "AAAA" }),
  );
  socket.send(JSON.stringify({ type: "future.event", value: 12 }));
  socket.send("malformed");
  socket.send(
    JSON.stringify({ type: "session.closed", reason: "close_requested" }),
  );
  await once(socket, "close");
  assert.ok(
    logs.some((event) => event.type === "sideband.connection.initialized"),
  );
  assert.ok(
    logs.some((event) => event.type === "session.input_transcript.delta"),
  );
  assert.ok(logs.some((event) => event.type === "session.input_audio.append"));
  assert.ok(logs.some((event) => event.type === "future.event"));
  assert.ok(logs.some((event) => event.type === "sideband.invalid_message"));
  assert.ok(logs.some((event) => event.type === "session.closed"));
  assert.deepEqual(commands, []);
  assert.ok(logs.every((event) => event.sessionId === "live_test"));
});

test("disabled debug does not try to attach", async (t) => {
  const logs = capture(t);
  process.env.DEBUG_MODE = "false";
  assert.equal(
    await attachDebugSideband(
      new OpenAI({ apiKey: "test", baseURL: "http://127.0.0.1:1" }),
      "live_test",
      "req-test",
    ),
    "disabled",
  );
  assert.deepEqual(logs, []);
});

test("attachment rejection is logged without breaking the voice setup", async (t) => {
  const logs = capture(t);
  const server = new WebSocketServer({
    port: 0,
    host: "127.0.0.1",
    verifyClient: () => false,
  });
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(typeof address === "object" && address);
  const result = await attachDebugSideband(
    new OpenAI({
      apiKey: "test",
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    }),
    "live_test",
    "req-test",
  );
  assert.equal(result, "failed");
  assert.ok(logs.some((event) => event.type === "sideband.connection.failed"));
});

test(
  "an interrupted sideband reconnects and keeps observing",
  { timeout: 5000 },
  async (t) => {
    const logs = capture(t);
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await once(server, "listening");
    t.after(() => {
      server.clients.forEach((socket) => socket.terminate());
      server.close();
    });
    const address = server.address();
    assert.ok(typeof address === "object" && address);
    const first = once(server, "connection");
    const attaching = attachDebugSideband(
      new OpenAI({
        apiKey: "test",
        baseURL: `http://127.0.0.1:${address.port}/v1`,
      }),
      "live_reconnect",
      "req-test",
    );
    const [socket] = await first;
    assert.equal(await attaching, "connected");
    const reconnecting = once(server, "connection");
    socket.terminate();
    const [replacement] = await reconnecting;
    replacement.send(
      JSON.stringify({
        type: "session.output_transcript.delta",
        delta: "Still here",
      }),
    );
    replacement.send(JSON.stringify({ type: "session.closed" }));
    await once(replacement, "close");
    assert.ok(
      logs.some((event) => event.type === "sideband.connection.reconnecting"),
    );
    assert.ok(
      logs.some((event) => event.type === "sideband.connection.reconnected"),
    );
    assert.ok(
      logs.some((event) => event.type === "session.output_transcript.delta"),
    );
  },
);
