"use client";
import { useState, useRef, useEffect } from "react";
import { AudioLines, ChevronDown } from "lucide-react";
import type { Transcript } from "@/lib/live/types";
export function ConversationTranscript({ entries }: { entries: Transcript[] }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptBottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptBottom.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [entries, showTranscript]);
  return (
    <section className="transcript-section">
      <button
        className="transcript-toggle"
        onClick={() => setShowTranscript(!showTranscript)}
        aria-expanded={showTranscript}
      >
        <AudioLines size={16} />
        Your conversation
        <ChevronDown size={16} className={showTranscript ? "rotated" : ""} />
      </button>
      {showTranscript && (
        <div
          className="transcript-log"
          role="log"
          aria-label="Conversation transcript"
        >
          {entries.map((entry) => (
            <div key={entry.id} className={`transcript-entry ${entry.role}`}>
              <span>{entry.role === "assistant" ? "Melody" : "You"}</span>
              <p>{entry.text}</p>
            </div>
          ))}
          <div ref={transcriptBottom} />
        </div>
      )}
    </section>
  );
}
