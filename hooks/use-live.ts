"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { LiveClient } from "@/lib/live/client";
import { defaultVoiceSettings } from "@/lib/live/settings";

/** Thin React adapter. Browser resources and protocol handling live in lib/live. */
export function useLive(audioRef: RefObject<HTMLAudioElement | null>) {
  const [client] = useState(() => new LiveClient());
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
    debug: client.debug,
    settings,
    setSettings,
    applySettings: () => client.applySettings(settings),
    restart: async () => {
      await client.stop();
      await start();
    },
    start,
    stop: client.stop,
    toggleMute: client.toggleMute,
    resumeAudio: client.resumeAudio,
  };
}

export type LiveController = ReturnType<typeof useLive>;
