import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../lib/http/is-same-origin";

function request(headers: Record<string, string>) {
  return new Request("http://0.0.0.0:3000/api/session", { headers });
}

test("Docker accepts the browser's host, including externally mapped ports", () => {
  for (const host of [
    "localhost:3000",
    "127.0.0.1:3000",
    "localhost:8080",
    "[::1]:3000",
  ]) {
    assert.equal(
      isSameOrigin(request({ host, origin: `http://${host}` })),
      true,
    );
  }
});

test("HTTPS proxies work when they preserve Host and forward the scheme", () => {
  assert.equal(
    isSameOrigin(
      request({
        host: "music.example.com",
        origin: "https://music.example.com",
        "x-forwarded-proto": "https",
      }),
    ),
    true,
  );
});

test("foreign hosts, wrong ports/schemes and invalid origins are rejected", () => {
  for (const origin of [
    "http://evil.example",
    "http://localhost:3001",
    "https://localhost:3000",
    "http://0.0.0.0:3000",
    "null",
    "",
    "not a URL",
  ]) {
    assert.equal(
      isSameOrigin(request({ host: "localhost:3000", origin })),
      false,
      origin,
    );
  }
  assert.equal(
    isSameOrigin(
      request({
        host: "localhost:3000",
        origin: "http://evil.example",
        "x-forwarded-host": "evil.example",
      }),
    ),
    false,
  );
});

test("requests without Origin remain supported, and URL authority is a fallback", () => {
  assert.equal(isSameOrigin(request({ host: "localhost:3000" })), true);
  assert.equal(isSameOrigin(request({ origin: "http://0.0.0.0:3000" })), true);
});
