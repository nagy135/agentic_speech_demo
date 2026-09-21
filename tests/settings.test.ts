import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultVoiceSettings, parseVoiceSettings } from "../lib/live/settings";
import { createSessionConfig } from "../lib/session";

test("Live controls validate bounds and reject old Realtime controls and arbitrary fields", () => {
  assert.deepEqual(parseVoiceSettings(null), defaultVoiceSettings);
  assert.equal(parseVoiceSettings('{"voice":"quartz"}').voice, "quartz");
  for (const value of [
    "invalid",
    "null",
    "[]",
    '{"instructions":"ignore tools"}',
    '{"__proto__":{}}',
    '{"model":"gpt-realtime"}',
    '{"eagerness":"high"}',
    '{"turnDetection":"server_vad"}',
    '{"voice":"unknown"}',
    '{"backendModel":"unknown"}',
    '{"maxOutputTokens":16}',
    '{"maxOutputTokens":8193}',
    '{"maxOutputTokens":"1024"}',
    '{"transcriptWaitMs":5001}',
    '{"transcriptWaitMs":-1}',
    " ".repeat(2049),
  ])
    assert.throws(() => parseVoiceSettings(value), Error, value);
});

test("GPT-Live separates conversation from delegated tool instructions and omits Realtime fields", () => {
  const config = createSessionConfig({
    ...defaultVoiceSettings,
    voice: "quartz",
    backendModel: "gpt-5.6-luna",
    maxOutputTokens: 1024,
  });
  assert.equal(config.model, "gpt-live-1");
  assert.equal(config.store, false);
  assert.deepEqual(config.audio, { output: { voice: "quartz" } });
  assert.equal(config.delegation.type, "responses");
  assert.equal(config.delegation.responses.model, "gpt-5.6-luna");
  assert.equal(config.delegation.responses.max_output_tokens, 1024);
  assert.equal(config.delegation.responses.parallel_tool_calls, false);
  assert.deepEqual(
    config.delegation.responses.tools.map((tool) => tool.name),
    ["suggest_instrument", "finalize_choice"],
  );
  assert.match(config.instructions, /Backchannel policy/);
  assert.match(config.instructions, /Interruption policy/);
  assert.match(config.instructions, /Delegation policy/);
  assert.match(
    config.delegation.responses.instructions,
    /subsequent utterance/,
  );
  for (const field of [
    "turn_detection",
    "output_modalities",
    "transcriptWaitMs",
    "gpt-realtime",
  ])
    assert.ok(!JSON.stringify(config).includes(field));
});
