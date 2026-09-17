"use client";
import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { instruments } from "@/lib/catalogue";
import { InstrumentCard } from "./instrument-card";
const families = [
  "All instruments",
  "Strings",
  "Keys",
  "Woodwind",
  "Brass",
  "Percussion",
];
export function InstrumentCollection({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState("All instruments");
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const filtered = instruments.filter(
    (item) => filter === "All instruments" || item.family === filter,
  );
  return (
    <section
      id="instrument-collection"
      ref={sectionRef}
      className="catalogue-section"
      aria-label="Instrument collection"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {instruments.length} DIFFERENT WAYS TO MAKE MUSIC
          </span>
          <h2>The instrument collection</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close collection"
        >
          <X size={20} />
        </button>
      </div>
      <div className="catalogue-filters">
        {families.map((family) => (
          <button
            key={family}
            onClick={() => setFilter(family)}
            className={filter === family ? "selected" : ""}
            aria-pressed={filter === family}
          >
            {family}
          </button>
        ))}
      </div>
      <div className="catalogue-grid">
        {filtered.map((instrument) => (
          <InstrumentCard
            key={instrument.id}
            suggestion={{
              instrumentId: instrument.id,
              reason: instrument.description,
            }}
          />
        ))}
      </div>
    </section>
  );
}
