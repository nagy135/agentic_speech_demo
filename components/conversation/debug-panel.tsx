"use client";

import { memo, useRef, useState, useSyncExternalStore } from "react";
import { Bug, Download, Trash2, X } from "lucide-react";
import {
  debugCategories,
  type DebugCategory,
  type DebugEntry,
  type LiveDebug,
} from "@/lib/live/debug";
import type { LiveController } from "@/hooks/use-live";

function NudgeEditor({ voice }: { voice: LiveController }) {
  const [draft, setDraft] = useState(voice.nudgeMessage);
  const [feedback, setFeedback] = useState("");
  return (
    <form
      className="debug-nudge"
      onSubmit={async (event) => {
        event.preventDefault();
        setFeedback("");
        try {
          await voice.saveNudge(draft);
          setFeedback(
            "Saved on the server for this conversation. Used on the next 30-second tick.",
          );
        } catch (error) {
          setFeedback(
            error instanceof Error
              ? error.message
              : "Could not save the message.",
          );
        }
      }}
    >
      <label htmlFor="sideband-nudge-message">
        Message sent every 30 seconds
      </label>
      <div className="debug-toolbar">
        <input
          id="sideband-nudge-message"
          value={draft}
          maxLength={400}
          required
          disabled={voice.nudgeSaving || voice.status !== "connected"}
          onChange={(event) => {
            setDraft(event.target.value);
            setFeedback("");
          }}
        />
        <button
          type="submit"
          disabled={voice.nudgeSaving || voice.status !== "connected"}
        >
          {voice.nudgeSaving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="debug-note">
        Start a chat to edit and save. Stored on the server for this
        conversation. “tell me current time” uses the current Berlin time; a
        custom message replaces it.
      </p>
      {feedback && (
        <p className="debug-note" role="status">
          {feedback}
        </p>
      )}
    </form>
  );
}

function SpeakingLight({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="debug-speaker" data-active={active} role="status">
      <span className="debug-light" aria-hidden="true" />
      {label}: {active ? "speaking" : "quiet"}
    </span>
  );
}

function EventMonitor({
  debug,
  voice,
}: {
  debug: LiveDebug;
  voice: LiveController;
}) {
  const snapshot = useSyncExternalStore(
    debug.subscribe,
    debug.getSnapshot,
    debug.getSnapshot,
  );
  const [category, setCategory] = useState<DebugCategory | "all">("all");
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState<typeof snapshot | null>(null);
  const shown = paused || snapshot;
  const entries = shown.entries
    .filter(
      (entry) =>
        (category === "all" || category === entry.category) &&
        (direction === "all" || direction === entry.direction) &&
        (!search ||
          `${entry.type} ${JSON.stringify(entry.payload)}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .toReversed();
  const latestSetup = snapshot.entries.findLast(
    (entry) => entry.type === "http.session.response",
  );
  const setup = latestSetup?.payload as
    { body?: { debug?: { sideband?: string } } } | undefined;
  const sideband = setup?.body?.debug?.sideband;

  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              sessionId: voice.sessionId,
              ...shown,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-debug-${new Date().toISOString().replaceAll(":", "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="debug-speaking">
        <SpeakingLight label="User" active={snapshot.userSpeaking} />
        <SpeakingLight label="Bot" active={snapshot.botSpeaking} />
      </div>
      <p className="debug-status">
        {voice.status} · {voice.usageSeconds.toFixed(1)} s usage
        {voice.backendWorking ? " · Backend working" : ""}
      </p>
      <p className="debug-status">
        Session: {voice.sessionId || "Not connected"}
      </p>
      <p className="debug-status">
        Server sideband at setup: {sideband || "Awaiting connection"}. Current
        server activity is in server logs.
      </p>
      <NudgeEditor key={voice.sessionId || "idle"} voice={voice} />
      <div className="debug-categories" aria-label="Event categories">
        <button
          type="button"
          aria-pressed={category === "all"}
          onClick={() => setCategory("all")}
        >
          All <b>{shown.total}</b>
        </button>
        {debugCategories.map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name} <b>{shown.counts[name]}</b>
          </button>
        ))}
      </div>
      <div className="debug-toolbar">
        <input
          aria-label="Search debug events and payloads"
          placeholder="Search events or payloads…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Event direction"
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="all">All directions</option>
          <option value="received">Received</option>
          <option value="sent">Sent</option>
          <option value="local">Local diagnostics</option>
        </select>
      </div>
      <div className="debug-toolbar">
        <button
          type="button"
          onClick={() => setPaused(paused ? null : snapshot)}
        >
          {paused ? "Resume view" : "Freeze view"}
        </button>
        <button type="button" onClick={download}>
          <Download size={14} />
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => {
            debug.clear();
            setPaused(null);
          }}
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>
      <p className="debug-note">
        {paused
          ? "View frozen; capture and lights remain live."
          : "Capturing even when closed. Newest events first."}{" "}
        {entries.length} shown · {shown.dropped} older events discarded (1,500
        events / 8 MB limit). Audio lights use measured levels; audio is
        reported as track metadata and WebRTC statistics.
      </p>
      <div className="debug-events" tabIndex={0} aria-label="Captured events">
        {entries.length === 0 ? (
          <p className="debug-empty">
            {shown.total
              ? "No events match these filters."
              : "Start a conversation to inspect connection setup, audio and events."}
          </p>
        ) : (
          entries.map((entry) => <EventRow key={entry.id} entry={entry} />)
        )}
      </div>
    </>
  );
}

const EventRow = memo(function EventRow({ entry }: { entry: DebugEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="debug-event"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="debug-event-meta">
          <time dateTime={entry.time}>{entry.time.slice(11, 23)}</time> ·{" "}
          {entry.source} · {entry.direction} · {entry.category}
        </span>
        <span>{entry.type}</span>
      </summary>
      {open && <pre>{JSON.stringify(entry.payload, null, 2)}</pre>}
    </details>
  );
});

export function DebugPanel({ voice }: { voice: LiveController }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  return (
    <div className="debug-widget">
      {open && (
        <section
          id="voice-debug-panel"
          className="debug-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="voice-debug-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <header>
            <div>
              <h2 id="voice-debug-title">Conversation debug</h2>
              <p>Client event monitor</p>
            </div>
            <button
              type="button"
              autoFocus
              aria-label="Close debug panel"
              onClick={close}
            >
              <X size={18} />
            </button>
          </header>
          <EventMonitor debug={voice.debug} voice={voice} />
        </section>
      )}
      <button
        ref={button}
        type="button"
        className="debug-toggle"
        aria-expanded={open}
        aria-controls={open ? "voice-debug-panel" : undefined}
        onClick={() => setOpen(!open)}
      >
        <Bug size={17} />
        Debug
      </button>
    </div>
  );
}
