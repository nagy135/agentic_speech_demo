export const debugCategories = [
  "connection",
  "session",
  "transcript",
  "audio",
  "delegation",
  "tools",
  "response",
  "usage",
  "error",
  "other",
] as const;
export type DebugCategory = (typeof debugCategories)[number];
export type DebugSource = "webrtc" | "http" | "media" | "client";
export type DebugDirection = "received" | "sent" | "local";
export interface DebugEntry {
  id: number;
  time: string;
  source: DebugSource;
  direction: DebugDirection;
  category: DebugCategory;
  type: string;
  payload: unknown;
}

export function eventCategory(type: string, payload?: unknown): DebugCategory {
  const nested = payload as
    | {
        event?: { type?: string; item?: { type?: string } };
        item?: { type?: string };
      }
    | undefined;
  const name = `${type} ${nested?.event?.type || ""}`;
  if (/error|failed|failure|invalid/i.test(name)) return "error";
  if (
    /function_call|tool/.test(name) ||
    /function_call/.test(nested?.event?.item?.type || nested?.item?.type || "")
  )
    return "tools";
  if (/transcript/.test(name)) return "transcript";
  if (/usage/.test(name)) return "usage";
  if (/audio|speaking|microphone|track|playback/.test(name)) return "audio";
  if (/delegation/.test(name)) return "delegation";
  if (/response\./.test(name)) return "response";
  if (/session\./.test(name)) return "session";
  if (/connection|ice|signaling|channel|sdp|http/.test(name))
    return "connection";
  return "other";
}

/** Keep credentials out of diagnostics, including future API response fields. */
export function redactDebugPayload(payload: unknown): unknown {
  return JSON.parse(
    JSON.stringify(payload ?? null, (key, value) =>
      /^(authorization|api[_-]?key|client[_-]?secret|access[_-]?token|token|secret)$/i.test(
        key,
      )
        ? "[redacted]"
        : value instanceof Error
          ? { name: value.name, message: value.message }
          : value,
    ),
  );
}

export interface DebugSnapshot {
  entries: DebugEntry[];
  total: number;
  dropped: number;
  userSpeaking: boolean;
  botSpeaking: boolean;
  counts: Record<DebugCategory, number>;
}

function emptyDebug(): DebugSnapshot {
  return {
    entries: [],
    total: 0,
    dropped: 0,
    userSpeaking: false,
    botSpeaking: false,
    counts: Object.fromEntries(
      debugCategories.map((category) => [category, 0]),
    ) as Record<DebugCategory, number>,
  };
}

/** Independent store: recording does not re-render the main conversation UI. */
export class LiveDebug {
  private snapshot = emptyDebug();
  private sequence = 0;
  private bytes = 0;
  private sizes: number[] = [];
  private listeners = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: DebugSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  record(
    source: DebugSource,
    direction: DebugDirection,
    type: string,
    payload: unknown = null,
  ) {
    const category = eventCategory(type, payload);
    const entry: DebugEntry = {
      id: ++this.sequence,
      time: new Date().toISOString(),
      source,
      direction,
      category,
      type,
      payload: redactDebugPayload(payload),
    };
    const entries = [...this.snapshot.entries, entry];
    // Bound both count and payload size; retain at least the latest event intact.
    const size = JSON.stringify(entry).length * 2;
    this.sizes.push(size);
    this.bytes += size;
    let dropped = this.snapshot.dropped;
    while (
      entries.length > 1 &&
      (entries.length > 1500 || this.bytes > 8 * 1024 * 1024)
    ) {
      entries.shift();
      this.bytes -= this.sizes.shift()!;
      dropped++;
    }
    this.publish({
      ...this.snapshot,
      entries,
      total: this.snapshot.total + 1,
      dropped,
      counts: {
        ...this.snapshot.counts,
        [category]: this.snapshot.counts[category] + 1,
      },
    });
  }
  speaking(userSpeaking: boolean, botSpeaking: boolean) {
    if (
      this.snapshot.userSpeaking === userSpeaking &&
      this.snapshot.botSpeaking === botSpeaking
    )
      return;
    this.publish({ ...this.snapshot, userSpeaking, botSpeaking });
    this.record("media", "local", "audio.speaking", {
      userSpeaking,
      botSpeaking,
    });
  }
  clear = () => {
    this.bytes = 0;
    this.sizes = [];
    this.publish({
      ...emptyDebug(),
      userSpeaking: this.snapshot.userSpeaking,
      botSpeaking: this.snapshot.botSpeaking,
    });
  };
}
