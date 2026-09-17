import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { instruments } from "../lib/catalogue";
import { emptyChoiceState, executeTool } from "../lib/tools";

const suggestion = {
  instrumentId: "classical-guitar",
  reason: "Gentle strings for your favourite songs.",
};
const suggest = (
  entries = [suggestion],
  state = emptyChoiceState(),
  sequence = 1,
) =>
  executeTool(
    "suggest_instrument",
    JSON.stringify({ suggestions: entries }),
    state,
    { sequence, text: "I like folk music" },
  );
const finalize = (
  overrides = {},
  sequence = 2,
  text = "Yes, I choose the classical guitar.",
) =>
  executeTool(
    "finalize_choice",
    JSON.stringify({
      ...suggestion,
      explicitlyConfirmed: true,
      confirmationQuote: text,
      ...overrides,
    }),
    suggest().state,
    { sequence, text },
  );

test("catalogue contains at least 50 distinct instruments with local images", () => {
  assert.ok(instruments.length >= 50);
  assert.equal(new Set(instruments.map((i) => i.id)).size, instruments.length);
  for (const item of instruments) {
    assert.ok(item.description && item.genres.length && item.practiceVolume);
    assert.ok(existsSync(`public${item.image}`));
  }
});
test("suggestions replace the previous shortlist and never finalize", () => {
  const first = suggest([
    suggestion,
    { ...suggestion, instrumentId: "violin" },
  ]);
  const second = suggest(
    [{ ...suggestion, instrumentId: "kalimba" }],
    first.state,
  );
  assert.deepEqual(
    second.state.suggestions.map((s) => s.instrumentId),
    ["kalimba"],
  );
  assert.equal(second.state.choice, null);
});
test("invalid IDs, duplicates, empty and oversized suggestions do not change state", () => {
  for (const input of [
    [],
    [suggestion, suggestion],
    [{ ...suggestion, instrumentId: "imaginary" }],
    Array(4).fill(suggestion),
  ]) {
    const result = suggest(input);
    assert.equal(result.output.ok, false);
    assert.deepEqual(result.state, emptyChoiceState());
  }
});
test("malformed tool arguments and unknown tools fail safely", () => {
  for (const [name, args] of [
    ["suggest_instrument", "not json"],
    ["unknown", "{}"],
    ["finalize_choice", "null"],
  ]) {
    assert.equal(
      executeTool(name, args, emptyChoiceState(), { sequence: 1, text: "" })
        .output.ok,
      false,
    );
  }
});
test("finalize requires an earlier suggestion and a fresh user turn", () => {
  assert.equal(finalize({}, 1).output.ok, false);
  assert.equal(finalize({ instrumentId: "violin" }).output.ok, false);
});
test("finalize requires explicit confirmation with a grounded quote", () => {
  assert.equal(finalize({ explicitlyConfirmed: false }).output.ok, false);
  assert.equal(
    finalize({ confirmationQuote: "I choose a trumpet" }).output.ok,
    false,
  );
  assert.equal(finalize({ confirmationQuote: "" }).output.ok, false);
  assert.equal(finalize({}, 2, "").output.ok, false);
});
test("confirmed choices clear the shortlist and preserve one instrument", () => {
  const result = finalize();
  assert.equal(result.output.ok, true);
  assert.equal(result.state.choice?.instrumentId, suggestion.instrumentId);
  assert.deepEqual(result.state.suggestions, []);
  assert.equal(suggest([suggestion], result.state).output.ok, false);
});
test("confirmation grounding works across languages and punctuation", () => {
  for (const quote of [
    "Sì, scelgo la chitarra classica!",
    "Ja, ich wähle die klassische Gitarre.",
    "はい、クラシックギターにします。",
    "نعم، أختار الغيتار الكلاسيكي.",
  ]) {
    assert.equal(
      finalize({ confirmationQuote: quote }, 2, quote).output.ok,
      true,
    );
  }
});
