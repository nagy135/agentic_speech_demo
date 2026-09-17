import Image from "next/image";
import { Check } from "lucide-react";
import { instrumentsById } from "@/lib/catalogue";
import type { Suggestion } from "@/lib/tools";

export function InstrumentCard({
  suggestion,
  chosen = false,
}: {
  suggestion: Suggestion;
  chosen?: boolean;
}) {
  const instrument = instrumentsById.get(suggestion.instrumentId)!;
  return (
    <article className={`instrument-card ${chosen ? "chosen-card" : ""}`}>
      <div
        className={`instrument-art family-${instrument.family.toLowerCase()}`}
      >
        <span className="family-label">{instrument.family}</span>
        {chosen && (
          <span className="choice-badge">
            <Check size={14} /> Your choice
          </span>
        )}
        <Image
          src={instrument.image}
          alt={`Illustration of ${instrument.name}`}
          width={300}
          height={260}
        />
      </div>
      <div className="instrument-copy">
        {chosen && <p className="eyebrow">THE START OF SOMETHING GOOD</p>}
        <h3>{instrument.name}</h3>
        <p className={chosen ? "" : "truncate-description"}>
          {suggestion.reason}
        </p>
        <div className="instrument-tags">
          <span>{instrument.learningCurve} learning curve</span>
          <span>{instrument.practiceVolume}</span>
        </div>
      </div>
    </article>
  );
}
