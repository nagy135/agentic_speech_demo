import { test } from "node:test";
import assert from "node:assert/strict";
import { readSessionError } from "../lib/openai/session-error";

const failure = (code: string, headers: Record<string, string> = {}) =>
  Response.json(
    { error: { code, type: code, message: "private upstream message" } },
    { status: 429, headers },
  );

test("quota exhaustion gives billing/limits guidance instead of suggesting a retry", async () => {
  const result = await readSessionError(failure("insufficient_quota"));
  assert.match(result.message, /credit balance/);
  assert.match(result.message, /Waiting and retrying will not resolve/);
  assert.equal(result.code, "insufficient_quota");
  assert.doesNotMatch(result.message, /private upstream/);
});

test("temporary rate limits preserve retry timing and request ID", async () => {
  const result = await readSessionError(
    failure("rate_limit_exceeded", {
      "retry-after": "15",
      "x-request-id": "req-test",
    }),
  );
  assert.match(result.message, /Wait 15 seconds/);
  assert.equal(result.retryAfter, "15");
  assert.equal(result.requestId, "req-test");
});

test("an unrecognized 429 does not claim to know which limit was reached", async () => {
  const result = await readSessionError(
    new Response("not JSON", { status: 429 }),
  );
  assert.match(result.message, /did not identify/);
  assert.equal(result.code, null);
});

test("credit and spending limits are distinguished from request throttling", async () => {
  for (const [code, wording] of [
    ["credit_balance_exhausted", "credit balance is exhausted"],
    [
      "organization_spend_limit_exceeded",
      "organization has reached its monthly spend limit",
    ],
    [
      "project_spend_limit_exceeded",
      "project has reached its monthly spend limit",
    ],
    ["organization_usage_limit_exceeded", "approved monthly usage limit"],
    ["slow_down", "rate limit was reached"],
  ]) {
    const result = await readSessionError(failure(code));
    assert.ok(result.message.includes(wording), code);
  }
});

test("invalid metadata and raw upstream text are not exposed", async () => {
  const result = await readSessionError(
    failure("sk-should-never-leak", { "retry-after": "not-a-duration" }),
  );
  assert.equal(result.code, null);
  assert.equal(result.type, null);
  assert.equal(result.retryAfter, null);
  assert.doesNotMatch(result.message, /sk-|private upstream/);
});
