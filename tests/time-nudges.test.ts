import { test } from "node:test";
import assert from "node:assert/strict";
import type { CommentaryAppendEvent } from "openai/resources/live/live";
import { createTimeNudges } from "../lib/openai/time-nudges";

test("nudges send fresh Berlin time every 30 seconds without debug, skip outages, and stop permanently", (t) => {
  const previous = process.env.DEBUG_MODE;
  process.env.DEBUG_MODE = "false";
  t.after(() => {
    if (previous === undefined) delete process.env.DEBUG_MODE;
    else process.env.DEBUG_MODE = previous;
  });
  const log = t.mock.method(console, "log");
  t.mock.timers.enable({
    apis: ["setInterval", "Date"],
    now: new Date("2026-09-24T12:00:00Z"),
  });
  const events: CommentaryAppendEvent[] = [];
  const connection = {
    socket: { readyState: 1 },
    send: (event: CommentaryAppendEvent) => events.push(event),
  };
  const nudges = createTimeNudges(connection, {});
  t.after(() => nudges.stop());
  t.mock.timers.tick(30_000);
  assert.equal(events.length, 0, "wait for session startup");
  nudges.start();
  nudges.start();
  t.mock.timers.tick(29_999);
  assert.equal(events.length, 0);
  t.mock.timers.tick(1);
  assert.equal(events.length, 1, "duplicate startup must not duplicate timers");
  assert.equal(events[0].type, "session.commentary.append");
  assert.equal(events[0].delegation_id, null);
  assert.match(events[0].content, /14:01:00/);
  assert.match(events[0].content, /Briefly tell the user/);
  assert.match(events[0].event_id!, /^time-nudge-/);
  t.mock.timers.tick(30_000);
  assert.equal(events.length, 2);
  assert.match(events[1].content, /14:01:30/);
  assert.notEqual(events[0].event_id, events[1].event_id);
  connection.socket = { readyState: 0 };
  t.mock.timers.tick(30_000);
  assert.equal(events.length, 2);
  connection.socket = { readyState: 1 };
  nudges.start();
  t.mock.timers.tick(30_000);
  assert.equal(events.length, 3, "reconnect must not replay missed ticks");
  assert.match(events[2].content, /14:02:30/);
  nudges.stop();
  nudges.stop();
  nudges.start();
  t.mock.timers.tick(60_000);
  assert.equal(events.length, 3);
  assert.equal(log.mock.callCount(), 0);
});

test("clock follows Berlin winter time and a send failure does not kill the timer", (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "Date"],
    now: new Date("2026-12-01T12:00:00Z"),
  });
  let attempts = 0;
  let last: CommentaryAppendEvent | undefined;
  const nudges = createTimeNudges(
    {
      socket: { readyState: 1 },
      send(event) {
        attempts++;
        if (attempts === 1) throw new Error("socket closed");
        last = event;
      },
    },
    {},
  );
  t.after(() => nudges.stop());
  nudges.start();
  assert.doesNotThrow(() => t.mock.timers.tick(30_000));
  t.mock.timers.tick(30_000);
  assert.equal(attempts, 2);
  assert.match(last!.content, /13:01:00/);
});
