import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LiveDebug,
  eventCategory,
  redactDebugPayload,
} from "../lib/live/debug";
import { serverDebug } from "../lib/openai/debug";

test("categorizes nested tools and errors without losing unknown events", () => {
  assert.equal(
    eventCategory("response.event", {
      event: {
        type: "response.output_item.done",
        item: { type: "function_call" },
      },
    }),
    "tools",
  );
  assert.equal(
    eventCategory("response.event", { event: { type: "response.failed" } }),
    "error",
  );
  assert.equal(eventCategory("session.input_transcript.delta"), "transcript");
  assert.equal(eventCategory("session.usage.updated"), "usage");
  const debug = new LiveDebug();
  debug.record("webrtc", "received", "new.future.event", {
    type: "new.future.event",
    value: 42,
  });
  assert.equal(debug.getSnapshot().entries[0].category, "other");
  assert.deepEqual(debug.getSnapshot().entries[0].payload, {
    type: "new.future.event",
    value: 42,
  });
});

test("capture is immutable, bounded, and preserves speaking state when cleared", () => {
  const debug = new LiveDebug();
  const first = debug.getSnapshot();
  debug.speaking(true, true);
  for (let i = 0; i < 1600; i++)
    debug.record("webrtc", "received", "session.updated", { i });
  assert.equal(first.entries.length, 0);
  assert.equal(debug.getSnapshot().entries.length, 1500);
  assert.equal(debug.getSnapshot().dropped, 101);
  assert.equal(debug.getSnapshot().counts.session, 1600);
  debug.clear();
  assert.equal(debug.getSnapshot().total, 0);
  assert.equal(debug.getSnapshot().userSpeaking, true);
  assert.equal(debug.getSnapshot().botSpeaking, true);
  debug.speaking(false, false);
  assert.equal(debug.getSnapshot().botSpeaking, false);
});

test("large payloads also evict history and keep the latest event intact", () => {
  const debug = new LiveDebug();
  const payload = { data: "x".repeat(3 * 1024 * 1024) };
  debug.record("webrtc", "received", "large", payload);
  debug.record("webrtc", "received", "large", payload);
  assert.equal(debug.getSnapshot().entries.length, 1);
  assert.equal(debug.getSnapshot().dropped, 1);
  assert.deepEqual(debug.getSnapshot().entries[0].payload, payload);
});

test("credentials are redacted recursively while conversation payloads remain visible", () => {
  assert.deepEqual(
    redactDebugPayload({
      authorization: "Bearer secret",
      session: {
        client_secret: { value: "secret" },
        instructions: "Talk",
        api_key: "secret",
      },
    }),
    {
      authorization: "[redacted]",
      session: {
        client_secret: "[redacted]",
        instructions: "Talk",
        api_key: "[redacted]",
      },
    },
  );
});

test("server event logging is gated by DEBUG_MODE", (t) => {
  const previous = process.env.DEBUG_MODE;
  t.after(() => {
    if (previous === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = previous;
  });
  const messages: string[] = [];
  t.mock.method(console, "log", (message: string) => messages.push(message));
  process.env.DEBUG_MODE = "false";
  serverDebug({ sessionId: "live_test" }, "session.started", {
    secret: "hidden",
  });
  assert.equal(messages.length, 0);
  process.env.DEBUG_MODE = "true";
  serverDebug({ sessionId: "live_test" }, "session.started", {
    secret: "hidden",
  });
  const entry = JSON.parse(messages[0]);
  assert.equal(entry.sessionId, "live_test");
  assert.equal(entry.payload.secret, "[redacted]");
});
