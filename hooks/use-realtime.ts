"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { RealtimeClient } from "@/lib/realtime/client";

/** Thin React adapter. Browser resources and protocol handling live in lib/realtime. */
export function useRealtime(audioRef: RefObject<HTMLAudioElement | null>) {
  const [client] = useState(() => new RealtimeClient());
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  useEffect(() => () => client.dispose(), [client]);
  const start = useCallback(async () => {
    if (audioRef.current) await client.start(audioRef.current);
  }, [audioRef, client]);
  return {
    ...snapshot,
    start,
    stop: client.stop,
    toggleMute: client.toggleMute,
    resumeAudio: client.resumeAudio,
  };
}

export type RealtimeController = ReturnType<typeof useRealtime>;
