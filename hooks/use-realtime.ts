"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { RealtimeClient } from "@/lib/realtime/client";
import { defaultVoiceSettings } from "@/lib/realtime/settings";

/** Thin React adapter. Browser resources and protocol handling live in lib/realtime. */
export function useRealtime(audioRef: RefObject<HTMLAudioElement | null>) {
  const [client] = useState(() => new RealtimeClient());
  const [settings, setSettings] = useState({ ...defaultVoiceSettings });
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  useEffect(() => () => client.dispose(), [client]);
  const start = useCallback(async () => {
    if (audioRef.current) await client.start(audioRef.current, settings);
  }, [audioRef, client, settings]);
  return {
    ...snapshot,
    settings,
    setSettings,
    applySettings: () => client.applySettings(settings),
    restart: async () => {
      client.stop();
      await start();
    },
    requestResponse: client.requestResponse,
    start,
    stop: client.stop,
    toggleMute: client.toggleMute,
    resumeAudio: client.resumeAudio,
  };
}

export type RealtimeController = ReturnType<typeof useRealtime>;
