import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { RealtimeClient } from "../lib/realtime/client";
import type { ServerEvent } from "../lib/realtime/types";
import { defaultVoiceSettings, settingsHeader } from "../lib/realtime/settings";

function browserFixture(t: TestContext, delayedMicrophone = false) {
  const sent: Array<{
    type: string;
    item?: { output: string };
    event_id?: string;
    session?: Record<string, unknown>;
  }> = [];
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
  class Peer {
    connectionState = "new";
    onconnectionstatechange = null;
    ontrack = null;
    addTrack() {}
    createDataChannel() {
      return channel;
    }
    async createOffer() {
      return { sdp: "v=0\r\nm=audio mock" };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.connectionState = "connected";
      channel.onopen?.();
    }
    close() {
      this.connectionState = "closed";
    }
  }
  const globals: Record<string, unknown> = {
    window: { isSecureContext: true },
    navigator: { mediaDevices: { getUserMedia: () => microphone } },
    RTCPeerConnection: Peer,
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const requests: RequestInit[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      requests.push(init!);
      return new Response("v=0\r\nanswer");
    },
  );
  const audio = {
    srcObject: null,
    pause() {},
    async play() {},
  } as unknown as HTMLAudioElement;
  const client = new RealtimeClient();
  t.after(() => client.dispose());
  const emit = (event: ServerEvent) =>
    channel.onmessage?.({ data: JSON.stringify(event) });
  const user = (id: string, text: string) => {
    emit({ type: "input_audio_buffer.committed", item_id: id });
    emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: id,
      transcript: text,
    });
  };
  const tool = (id: string, name: string, args: object) =>
    emit({
      type: "response.done",
      response: {
        status: "completed",
        output: [
          {
            type: "function_call",
            status: "completed",
            call_id: id,
            name,
            arguments: JSON.stringify(args),
          },
        ],
      },
    });
  return {
    client,
    audio,
    track,
    sent,
    requests,
    releaseMicrophone,
    emit,
    user,
    tool,
  };
}

test("chosen settings reach session setup and manual replies wait for a completed user turn", async (t) => {
  const { client, audio, sent, requests, emit, user } = browserFixture(t);
  const settings = {
    ...defaultVoiceSettings,
    createResponse: false,
    eagerness: "high" as const,
  };
  await client.start(audio, settings);
  assert.deepEqual(
    JSON.parse(new Headers(requests[0].headers).get(settingsHeader)!),
    settings,
  );
  emit({ type: "response.done", response: { status: "completed" } });
  client.requestResponse();
  assert.equal(sent.length, 1, "only the initial greeting has been requested");
  emit({ type: "input_audio_buffer.speech_started" });
  assert.equal(client.getSnapshot().canRespond, false);
  emit({ type: "input_audio_buffer.speech_stopped" });
  user("u1", "I like folk music.");
  assert.equal(client.getSnapshot().activity, "listening");
  assert.equal(client.getSnapshot().canRespond, true);
  client.requestResponse();
  client.requestResponse();
  assert.equal(
    sent.filter((event) => event.type === "response.create").length,
    2,
  );
  assert.equal(client.getSnapshot().canRespond, false);
});

test("live controls update directly over the data channel and become active after acknowledgement", async (t) => {
  const { client, audio, sent, requests, emit } = browserFixture(t);
  await client.start(audio);
  const settings = {
    ...defaultVoiceSettings,
    turnDetection: "server_vad" as const,
    silenceDurationMs: 350,
    createResponse: false,
  };
  client.applySettings(settings);
  assert.equal(requests.length, 1, "live updates do not call the app server");
  const update = sent.at(-1)!;
  assert.equal(update.type, "session.update");
  assert.deepEqual(update.session, {
    type: "realtime",
    audio: {
      input: {
        turn_detection: {
          type: "server_vad",
          silence_duration_ms: 350,
          threshold: 0.5,
          create_response: false,
          interrupt_response: true,
        },
      },
    },
  });
  assert.equal(client.getSnapshot().settingsApplying, true);
  assert.equal(
    client.getSnapshot().activeSettings.turnDetection,
    "semantic_vad",
  );
  client.applySettings({ ...settings, threshold: 0.2 });
  assert.equal(
    sent.filter((event) => event.type === "session.update").length,
    1,
  );
  emit({ type: "session.updated" });
  assert.equal(client.getSnapshot().settingsApplying, false);
  assert.deepEqual(client.getSnapshot().activeSettings, settings);
  const count = sent.length;
  client.applySettings({ ...settings, transcriptWaitMs: 0 });
  assert.equal(sent.length, count, "local waiting needs no OpenAI update");
  assert.equal(client.getSnapshot().activeSettings.transcriptWaitMs, 0);
});

test("rejected live settings preserve the active values; model changes require a new session", async (t) => {
  const { client, audio, sent, requests, emit } = browserFixture(t);
  await client.start(audio);
  client.applySettings({ ...defaultVoiceSettings, eagerness: "high" });
  emit({
    type: "error",
    error: { event_id: sent.at(-1)!.event_id, message: "Settings rejected" },
  });
  assert.equal(client.getSnapshot().settingsApplying, false);
  assert.equal(client.getSnapshot().activeSettings.eagerness, "auto");
  const count = sent.length;
  client.applySettings({ ...defaultVoiceSettings, model: "gpt-realtime-mini" });
  assert.equal(sent.length, count);
  assert.match(client.getSnapshot().error!, /End the chat/);
  client.stop();
  await client.start(audio, {
    ...defaultVoiceSettings,
    model: "gpt-realtime-mini",
  });
  assert.equal(
    JSON.parse(new Headers(requests.at(-1)!.headers).get(settingsHeader)!)
      .model,
    "gpt-realtime-mini",
  );
  assert.deepEqual(client.getSnapshot().transcript, []);
});

test("zero transcript wait rejects missing confirmation immediately without weakening grounding", async (t) => {
  const { client, audio, user, tool, emit, sent } = browserFixture(t);
  await client.start(audio, { ...defaultVoiceSettings, transcriptWaitMs: 0 });
  const suggestion = { instrumentId: "kalimba", reason: "Quiet melodies." };
  user("u1", "Quiet music.");
  tool("s1", "suggest_instrument", { suggestions: [suggestion] });
  emit({ type: "input_audio_buffer.committed", item_id: "u2" });
  tool("f1", "finalize_choice", {
    ...suggestion,
    explicitlyConfirmed: true,
    confirmationQuote: "Yes",
  });
  await Promise.resolve();
  const output = sent
    .filter((event) => event.type === "conversation.item.create")
    .at(-1)!.item!.output;
  assert.equal(JSON.parse(output).ok, false);
  assert.equal(client.getSnapshot().selection.choice, null);
});

test("session handles tool output once, confirms a later multilingual turn, and releases microphone", async (t) => {
  const { client, audio, track, sent, user, tool } = browserFixture(t);
  await client.start(audio);
  assert.equal(client.getSnapshot().status, "connected");
  user("u1", "I like quiet music.");
  const suggestion = {
    instrumentId: "kalimba",
    reason: "A quiet, melodic first instrument.",
  };
  tool("call1", "suggest_instrument", { suggestions: [suggestion] });
  tool("call1", "suggest_instrument", { suggestions: [suggestion] });
  assert.equal(
    sent.filter((event) => event.type === "conversation.item.create").length,
    1,
  );
  assert.equal(client.getSnapshot().selection.suggestions.length, 1);
  user("u2", "Sì, scelgo la kalimba.");
  tool("call2", "finalize_choice", {
    ...suggestion,
    explicitlyConfirmed: true,
    confirmationQuote: "Sì, scelgo la kalimba.",
  });
  assert.equal(client.getSnapshot().selection.choice?.instrumentId, "kalimba");
  assert.deepEqual(client.getSnapshot().selection.suggestions, []);
  client.toggleMute();
  assert.equal(track.enabled, false);
  client.toggleMute();
  assert.equal(track.enabled, true);
  client.stop();
  assert.equal(track.stopped, true);
  assert.equal(client.getSnapshot().status, "idle");
  assert.equal(client.getSnapshot().selection.choice?.instrumentId, "kalimba");
});

test("cancelling before microphone permission resolves stops the late stream", async (t) => {
  const { client, audio, track, releaseMicrophone } = browserFixture(t, true);
  const starting = client.start(audio);
  client.stop();
  releaseMicrophone();
  await starting;
  assert.equal(track.stopped, true);
  assert.equal(client.getSnapshot().status, "idle");
});

test("late transcripts from older turns cannot authorize a current choice", async (t) => {
  const { client, audio, user, emit, tool, sent } = browserFixture(t);
  await client.start(audio);
  const suggestion = { instrumentId: "kalimba", reason: "Quiet melodies." };
  user("u1", "Yes, I choose kalimba.");
  tool("s1", "suggest_instrument", { suggestions: [suggestion] });
  user("u2", "Actually, tell me about piano.");
  emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "u1",
    transcript: "Yes, I choose kalimba.",
  });
  tool("f1", "finalize_choice", {
    ...suggestion,
    explicitlyConfirmed: true,
    confirmationQuote: "Yes, I choose kalimba.",
  });
  assert.equal(client.getSnapshot().selection.choice, null);
  const output = sent
    .filter((event) => event.type === "conversation.item.create")
    .at(-1)?.item?.output;
  assert.equal(JSON.parse(output!).ok, false);
});
