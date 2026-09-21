import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { LiveClient } from "../lib/live/client";
import { LiveTranscripts } from "../lib/live/transcripts";
import type { ServerEvent } from "../lib/live/types";
import { defaultVoiceSettings, settingsHeader } from "../lib/live/settings";

function browserFixture(
  t: TestContext,
  delayedMicrophone = false,
  autoStart = true,
) {
  const sent: Array<{
    type: string;
    event_id?: string;
    delegation_id?: string | null;
    session?: object;
    item?: { output: string };
  }> = [];
  const requests: RequestInit[] = [];
  const track = {
    enabled: true,
    stopped: false,
    onended: null,
    stop() {
      this.stopped = true;
    },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let releaseMicrophone = () => {};
  const microphone = delayedMicrophone
    ? new Promise<typeof stream>((resolve) => {
        releaseMicrophone = () => resolve(stream);
      })
    : Promise.resolve(stream);
  const channel = {
    readyState: "open",
    onopen: null as (() => void) | null,
    onmessage: null as ((message: { data: string }) => void) | null,
    onclose: null,
    onerror: null,
    send(data: string) {
      sent.push(JSON.parse(data));
    },
    close() {
      this.readyState = "closed";
    },
  };
  const emit = (event: ServerEvent) =>
    channel.onmessage?.({ data: JSON.stringify(event) });
  class Peer extends EventTarget {
    connectionState = "new";
    iceGatheringState = "complete";
    localDescription: { sdp: string } | null = null;
    onconnectionstatechange = null;
    ontrack = null;
    addTrack() {}
    createDataChannel() {
      channel.readyState = "open";
      return channel;
    }
    async createOffer() {
      return { sdp: "v=0\r\nm=audio mock" };
    }
    async setLocalDescription(offer: { sdp: string }) {
      this.localDescription = offer;
    }
    async setRemoteDescription() {
      this.connectionState = "connected";
      channel.onopen?.();
      if (autoStart)
        emit({ type: "session.started", session: { id: "live_test" } });
    }
    async getStats() {
      return new Map();
    }
    close() {
      this.connectionState = "closed";
    }
  }
  for (const [key, value] of Object.entries({
    window: { isSecureContext: true },
    navigator: { mediaDevices: { getUserMedia: () => microphone } },
    RTCPeerConnection: Peer,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      requests.push(init!);
      return Response.json({
        session: { id: "live_test" },
        transport: { type: "webrtc", sdp: "v=0\r\nanswer" },
      });
    },
  );
  const mockAudio = {
    srcObject: null,
    paused: false,
    pause() {
      this.paused = true;
    },
    async play() {
      this.paused = false;
    },
  };
  const audio = mockAudio as unknown as HTMLAudioElement;
  const client = new LiveClient();
  t.after(() => {
    client.dispose();
    emit({
      type: "session.closed",
      reason: "close_requested",
      usage: { seconds: 1 },
    });
  });
  const user = (text: string, start: number, end: number) =>
    emit({
      type: "session.input_transcript.delta",
      delta: text,
      start_ms: start,
      end_ms: end,
    });
  const begin = (id: string, cutoff: number) => {
    emit({
      type: "session.delegation.created",
      offset_ms: cutoff,
      delegation: { id, target: "responses", response_id: `r-${id}` },
    });
    emit({
      type: "response.event",
      delegation_id: id,
      event: { type: "response.created", response: { id: `r-${id}` } },
    });
  };
  const tool = (id: string, callId: string, name: string, args: object) =>
    emit({
      type: "response.event",
      delegation_id: id,
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          call_id: callId,
          name,
          arguments: JSON.stringify(args),
        },
      },
    });
  const complete = (id: string) =>
    emit({
      type: "response.event",
      delegation_id: id,
      event: {
        type: "response.completed",
        response: { id: `r-${id}`, status: "completed" },
      },
    });
  return {
    client,
    audio,
    track,
    sent,
    requests,
    emit,
    user,
    begin,
    tool,
    complete,
    releaseMicrophone,
  };
}

const suggestion = { instrumentId: "kalimba", reason: "Quiet melodies." };

test("tools wait for a user transcript before recording a suggestion turn", async (t) => {
  const { client, audio, sent, begin, tool, complete } = browserFixture(t);
  await client.start(audio);
  begin("d1", 600);
  tool("d1", "c1", "suggest_instrument", { suggestions: [suggestion] });
  complete("d1");
  assert.equal(client.getSnapshot().selection.suggestions.length, 0);
  const output = sent.find((e) => e.type === "response.item.create")!.item!
    .output;
  assert.match(JSON.parse(output).error, /transcript is not available/);
});

test("waits for session.started and greets through Live instructions, not response.create", async (t) => {
  const { client, audio, sent, requests, emit } = browserFixture(
    t,
    false,
    false,
  );
  await client.start(audio, { ...defaultVoiceSettings, voice: "quartz" });
  assert.equal(client.getSnapshot().status, "connecting");
  assert.equal(sent.length, 0);
  assert.equal(
    JSON.parse(new Headers(requests[0].headers).get(settingsHeader)!).voice,
    "quartz",
  );
  emit({ type: "session.started", session: { id: "live_ready" } });
  emit({ type: "session.started", session: { id: "live_ready" } });
  assert.equal(client.getSnapshot().status, "connected");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "session.instructions.append");
  assert.equal(sent[0].delegation_id, null);
});

test("nested output-item tools work with empty completion output, duplicate events and multilingual confirmation", async (t) => {
  const { client, audio, sent, user, begin, tool, complete } =
    browserFixture(t);
  await client.start(audio);
  user("I like quiet music.", 100, 500);
  begin("d1", 600);
  tool("d1", "c1", "suggest_instrument", { suggestions: [suggestion] });
  assert.equal(client.getSnapshot().selection.suggestions.length, 0);
  complete("d1");
  complete("d1");
  assert.equal(client.getSnapshot().selection.suggestions.length, 1);
  assert.equal(sent.filter((e) => e.type === "response.item.create").length, 1);
  user("Sì, scelgo la kalimba.", 2500, 3000);
  begin("d2", 3100);
  tool("d2", "c2", "finalize_choice", {
    ...suggestion,
    explicitlyConfirmed: true,
    confirmationQuote: "Sì, scelgo la kalimba.",
  });
  complete("d2");
  assert.equal(client.getSnapshot().selection.choice?.instrumentId, "kalimba");
  assert.deepEqual(client.getSnapshot().selection.suggestions, []);
  assert.equal(sent.filter((e) => e.type === "response.create").length, 2);
});

test("a correction after delegation prevents stale tools from changing the UI", async (t) => {
  const { client, audio, sent, user, begin, tool, complete } =
    browserFixture(t);
  await client.start(audio);
  user("Quiet music.", 100, 500);
  begin("d1", 600);
  user(" Actually, I want loud drums.", 700, 1000);
  tool("d1", "c1", "suggest_instrument", { suggestions: [suggestion] });
  complete("d1");
  assert.equal(client.getSnapshot().selection.suggestions.length, 0);
  const output = sent.find((e) => e.type === "response.item.create")!.item!
    .output;
  assert.equal(JSON.parse(output).ok, false);
});

test("live settings require matching acknowledgements; voice changes require restart", async (t) => {
  const { client, audio, sent, emit, requests } = browserFixture(t);
  await client.start(audio);
  const settings = {
    ...defaultVoiceSettings,
    backendModel: "gpt-5.6-luna" as const,
  };
  client.applySettings(settings);
  const update = sent.at(-1)!;
  assert.deepEqual(update.session, {
    delegation: {
      type: "responses",
      responses: { model: "gpt-5.6-luna", max_output_tokens: 2048 },
    },
  });
  emit({ type: "session.updated", client_event_id: "unrelated" });
  assert.equal(client.getSnapshot().settingsApplying, true);
  emit({ type: "session.updated", client_event_id: update.event_id });
  assert.equal(
    client.getSnapshot().activeSettings.backendModel,
    "gpt-5.6-luna",
  );
  assert.equal(client.getSnapshot().settingsApplying, false);
  assert.equal(requests.length, 1);
  const count = sent.length;
  client.applySettings({ ...settings, transcriptWaitMs: 0 });
  assert.equal(sent.length, count);
  client.applySettings({ ...settings, voice: "quartz" });
  assert.match(client.getSnapshot().error!, /Restart/);
});

test("rejected settings keep active values and clear the pending update", async (t) => {
  const { client, audio, sent, emit } = browserFixture(t);
  await client.start(audio);
  client.applySettings({ ...defaultVoiceSettings, maxOutputTokens: 1024 });
  emit({
    type: "error",
    error: { client_event_id: sent.at(-1)!.event_id, message: "Rejected" },
  });
  assert.equal(client.getSnapshot().settingsApplying, false);
  assert.equal(client.getSnapshot().activeSettings.maxOutputTokens, 2048);
});

test("close silences input immediately, waits for final usage, then permits restart", async (t) => {
  const { client, audio, track, sent, emit } = browserFixture(t);
  await client.start(audio);
  const closing = client.stop();
  assert.equal(client.getSnapshot().status, "closing");
  assert.equal(track.enabled, false);
  assert.equal(track.stopped, false);
  assert.equal(sent.at(-1)!.type, "session.close");
  emit({
    type: "session.closed",
    reason: "close_requested",
    usage: { seconds: 12.5 },
  });
  await closing;
  assert.equal(track.stopped, true);
  assert.equal(client.getSnapshot().usageSeconds, 12.5);
  assert.equal(client.getSnapshot().status, "idle");
  await client.start(audio, { ...defaultVoiceSettings, voice: "quartz" });
  assert.equal(client.getSnapshot().activeSettings.voice, "quartz");
});

test("cancelled microphone requests release a stream that arrives late", async (t) => {
  const { client, audio, track, releaseMicrophone } = browserFixture(t, true);
  const starting = client.start(audio);
  await client.stop();
  releaseMicrophone();
  await starting;
  assert.equal(track.stopped, true);
  assert.equal(client.getSnapshot().status, "idle");
});

test("missing transcript evidence fails closed at zero wait", async (t) => {
  const { client, audio, user, begin, tool, complete, sent } =
    browserFixture(t);
  await client.start(audio, { ...defaultVoiceSettings, transcriptWaitMs: 0 });
  user("Quiet music.", 100, 500);
  begin("d1", 600);
  tool("d1", "c1", "suggest_instrument", { suggestions: [suggestion] });
  complete("d1");
  begin("d2", 3100);
  tool("d2", "c2", "finalize_choice", {
    ...suggestion,
    explicitlyConfirmed: true,
    confirmationQuote: "Yes, kalimba",
  });
  complete("d2");
  assert.equal(client.getSnapshot().selection.choice, null);
  assert.equal(
    JSON.parse(
      sent.filter((e) => e.type === "response.item.create").at(-1)!.item!
        .output,
    ).ok,
    false,
  );
});

test("timestamped captions preserve overlap, late fragments, spacing and repeated words", () => {
  const captions = new LiveTranscripts();
  const part = (
    type: string,
    delta: string,
    start_ms: number,
    end_ms: number,
    event_id: string,
  ) => ({ type, delta, start_ms, end_ms, event_id });
  captions.append(
    part("session.input_transcript.delta", " like", 400, 600, "u2"),
  );
  captions.append(
    part("session.output_transcript.delta", "Mm-hmm.", 300, 500, "a1"),
  );
  captions.append(part("session.input_transcript.delta", "I", 100, 300, "u1"));
  captions.append(
    part("session.input_transcript.delta", " like", 400, 600, "u2"),
  );
  captions.append(
    part("session.input_transcript.delta", " quiet music.", 600, 900, "u3"),
  );
  assert.equal(captions.latestUser().text, "I like quiet music.");
  assert.equal(captions.entries.length, 2);
  captions.append(
    part("session.input_transcript.delta", "Yes, yes.", 3000, 3500, "u4"),
  );
  assert.equal(captions.latestUser().text, "Yes, yes.");
  captions.append(
    part("session.input_transcript.delta", " please", 900, 1000, "late"),
  );
  assert.equal(captions.latestUser().text, "Yes, yes.");
});
