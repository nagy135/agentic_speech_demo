import { randomUUID } from "node:crypto";
import type { CommentaryAppendEvent } from "openai/resources/live/live";
import { serverDebug } from "./debug";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** One timer per session; disconnected ticks are discarded, never replayed. */
export function createTimeNudges(
  connection: {
    socket: { readyState: number };
    send: (event: CommentaryAppendEvent) => void;
  },
  context: Record<string, unknown>,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  return {
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => {
        if (connection.socket.readyState !== 1) return;
        const event: CommentaryAppendEvent = {
          type: "session.commentary.append",
          event_id: `time-nudge-${randomUUID()}`,
          delegation_id: null,
          content: `The current time in Berlin (Europe/Berlin) is ${clock.format(new Date())}. Briefly tell the user the time in the language of this conversation.`,
        };
        try {
          connection.send(event);
          serverDebug({ ...context, direction: "sent" }, event.type, event);
        } catch (error) {
          serverDebug(context, "sideband.time_nudge.failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }, 30_000);
      timer.unref();
      serverDebug(context, "sideband.time_nudge.started", {
        intervalMs: 30_000,
        timeZone: "Europe/Berlin",
      });
    },
    stop() {
      stopped = true;
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
      serverDebug(context, "sideband.time_nudge.stopped");
    },
  };
}
