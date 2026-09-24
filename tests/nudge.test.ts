import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/session/nudge/route";
import { registerNudgeSession } from "../lib/openai/nudge-sessions";
import { createTimeNudges } from "../lib/openai/time-nudges";

const request = (
  message: unknown,
  sessionId = "session-a",
  token = "token-a",
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/session/nudge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      origin,
    },
    body: JSON.stringify({ message, sessionId }),
  });

test("saving changes only the authorized session on its next tick, without resetting timers", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const eventsA: string[] = [];
  const eventsB: string[] = [];
  const a = createTimeNudges(
    { socket: { readyState: 1 }, send: (event) => eventsA.push(event.content) },
    {},
  );
  const b = createTimeNudges(
    { socket: { readyState: 1 }, send: (event) => eventsB.push(event.content) },
    {},
  );
  const removeA = registerNudgeSession("session-a", {
    token: "token-a",
    setMessage: a.setMessage,
  });
  const removeB = registerNudgeSession("session-b", {
    token: "token-b",
    setMessage: b.setMessage,
  });
  t.after(() => {
    removeA();
    removeB();
    a.stop();
    b.stop();
  });
  a.start();
  b.start();
  t.mock.timers.tick(20_000);
  const response = await POST(request("Ask about my day"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Ask about my day" });
  assert.equal(eventsA.length, 0);
  assert.equal((await POST(request("Hijack", "session-b"))).status, 404);
  assert.equal(
    (await POST(request("Hijack", "session-a", "wrong"))).status,
    404,
  );
  assert.equal(
    (
      await POST(
        request("Hijack", "session-a", "token-a", "http://evil.example"),
      )
    ).status,
    403,
  );
  t.mock.timers.tick(10_000);
  assert.deepEqual(eventsA, ["Ask about my day"]);
  assert.match(eventsB[0], /current time in Berlin/);
  await POST(request("tell me current time"));
  t.mock.timers.tick(30_000);
  assert.match(eventsA[1], /current time in Berlin/);
  a.stop();
  removeA();
  assert.equal((await POST(request("After close"))).status, 404);
});

test("nudge endpoint rejects missing, oversized, malformed and invalid messages", async () => {
  for (const value of ["", "  ", null, 42, "x".repeat(401), "😀".repeat(101)])
    assert.equal((await POST(request(value))).status, 400);
  assert.equal((await POST(request("x".repeat(5000)))).status, 413);
  const malformed = new Request("http://localhost:3000/api/session/nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal((await POST(malformed)).status, 400);
});
