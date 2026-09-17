import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { RealtimeClient } from "../lib/realtime/client";
import type { ServerEvent } from "../lib/realtime/types";

function browserFixture(t: TestContext, delayedMicrophone = false) {
  const sent: Array<{ type: string; item?: { output: string } }> = [];
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
  t.mock.method(globalThis, "fetch", async () => new Response("v=0\r\nanswer"));
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
  return { client, audio, track, sent, releaseMicrophone, emit, user, tool };
}

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
