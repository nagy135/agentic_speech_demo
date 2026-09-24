import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import OpenAI from "openai";
import { WebSocketServer } from "ws";
import { attachSideband } from "../lib/openai/sideband";

function capture(t: TestContext, onEvent?: (type: string) => void) {
  const previous = process.env.DEBUG_MODE;
  process.env.DEBUG_MODE = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = previous;
  });
  const logs: Array<{ type: string; payload: unknown; sessionId: string }> = [];
  t.mock.method(console, "log", (message: string) => {
    const event = JSON.parse(message);
    logs.push(event);
    onEvent?.(event.type);
  });
  return logs;
}

test("sideband authenticates, observes events, sends time nudges, and stops with session", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let started!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const logs = capture(t, (type) => {
    if (type === "sideband.time_nudge.started") started();
  });
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
  const attaching = attachSideband(client, "live_test", "req-test");
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
  socket.send(JSON.stringify({ type: "session.started" }));
  await starting;
  const sent = once(socket, "message");
  t.mock.timers.tick(30_000);
  const [message] = await sent;
  const command = JSON.parse(message.toString());
  assert.equal(command.type, "session.commentary.append");
  assert.equal(command.delegation_id, null);
  assert.match(command.content, /current time in Berlin/);
  assert.match(command.event_id, /^time-nudge-/);
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
  assert.equal(commands.length, 1);
  const sentCount = () =>
    logs.filter((event) => event.type === "session.commentary.append").length;
  assert.equal(sentCount(), 1);
  assert.ok(logs.some((event) => event.type === "sideband.time_nudge.stopped"));
  t.mock.timers.tick(60_000);
  assert.equal(sentCount(), 1, "session closure must cancel its timer");
  assert.ok(logs.every((event) => event.sessionId === "live_test"));
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
  const result = await attachSideband(
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
    const attaching = attachSideband(
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
