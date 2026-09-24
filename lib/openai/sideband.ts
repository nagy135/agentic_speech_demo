import type OpenAI from "openai";
import { SidebandWS } from "openai/resources/live/sideband/ws";
import { serverDebug } from "./debug";
import { createTimeNudges } from "./time-nudges";

/** Send clock nudges and observe the session; the browser still executes tools. */
export async function attachSideband(
  client: OpenAI,
  sessionId: string,
  requestId: string,
): Promise<"connected" | "failed"> {
  const context = { requestId, sessionId, transport: "sideband" };
  serverDebug(context, "sideband.connection.initializing");
  try {
    const sideband = new SidebandWS(
      client,
      { session_id: sessionId, graceful_close: true },
      {
        handshakeTimeout: 5_000,
        reconnect: {
          maxRetries: 3,
          onReconnecting: (event) => {
            serverDebug(context, "sideband.connection.reconnecting", event);
          },
        },
      },
    );
    const nudges = createTimeNudges(sideband, context);
    // A hard bound also releases orphan connections if a peer never completes setup.
    const lifetime = setTimeout(
      () => {
        serverDebug(context, "sideband.connection.expired", {
          maximumHours: 2,
        });
        nudges.stop();
        sideband.close();
      },
      2 * 60 * 60 * 1000,
    );
    lifetime.unref();
    const handleLifecycle = (type: string) => {
      if (type === "session.started") nudges.start();
      if (type === "session.closed") {
        nudges.stop();
        clearTimeout(lifetime);
        sideband.close();
      }
    };
    sideband.on("event", (event) => {
      serverDebug(context, event.type, event);
      handleLifecycle(event.type);
    });
    sideband.on("raw", (data) => {
      const raw =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : String(data);
      try {
        const event = JSON.parse(raw);
        serverDebug(
          context,
          typeof event?.type === "string" ? event.type : "sideband.unknown",
          event,
        );
        handleLifecycle(event?.type);
      } catch {
        serverDebug(context, "sideband.invalid_message", { raw });
      }
    });
    sideband.on("error", (error) => {
      serverDebug(context, "sideband.error", {
        message: error.message,
        event: error.error,
      });
    });
    sideband.on("close", (code, reason) => {
      nudges.stop();
      clearTimeout(lifetime);
      serverDebug(context, "sideband.connection.closed", { code, reason });
    });
    sideband.on("reconnected", () =>
      serverDebug(context, "sideband.connection.reconnected"),
    );
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (status: "connected" | "failed") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sideband.socket.off("open", opened);
        sideband.socket.off("error", failed);
        sideband.socket.off("close", failed);
        if (status === "failed") {
          nudges.stop();
          clearTimeout(lifetime);
          sideband.close();
          serverDebug(context, "sideband.connection.failed");
        }
        resolve(status);
      };
      const opened = () => {
        serverDebug(context, "sideband.connection.initialized");
        finish("connected");
      };
      const failed = () => finish("failed");
      const timer = setTimeout(failed, 6_000);
      sideband.socket.on("open", opened);
      sideband.socket.on("error", failed);
      sideband.socket.on("close", failed);
    });
  } catch (error) {
    serverDebug(context, "sideband.connection.failed", error);
    return "failed";
  }
}
