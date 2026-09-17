import { ArrowDown } from "lucide-react";
import type { ChoiceState } from "@/lib/tools";
import { InstrumentCard } from "./instrument-card";
import { ConfirmedChoice } from "./confirmed-choice";
import { EmptySuggestions } from "./empty-suggestions";
interface DiscoveryResultsProps {
  selection: ChoiceState;
  onExploreAgain: () => void;
}
export function DiscoveryResults({
  selection: { choice, suggestions },
  onExploreAgain,
}: DiscoveryResultsProps) {
  return (
    <section
      className={`discovery-section ${choice ? "has-choice" : ""}`}
      aria-label={
        choice ? "Your confirmed instrument" : "Instrument suggestions"
      }
      aria-live="polite"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {choice
              ? "MADE FOR YOUR MUSICAL JOURNEY"
              : "POSSIBILITIES, PICKED FOR YOU"}
          </span>
          <h2>
            {choice
              ? "You found your first note."
              : suggestions.length
                ? "These could be your kind of thing."
                : "Your next favourite thing awaits."}
          </h2>
        </div>
        {!choice && (
          <span className="section-note">
            {suggestions.length
              ? `${suggestions.length} ${suggestions.length === 1 ? "instrument" : "instruments"} to explore`
              : "Listen. Discover. Make it yours."}
            <ArrowDown size={15} />
          </span>
        )}
      </div>
      {choice ? (
        <ConfirmedChoice choice={choice} onExploreAgain={onExploreAgain} />
      ) : suggestions.length ? (
        <div className="suggestions-grid">
          {suggestions.map((item) => (
            <InstrumentCard key={item.instrumentId} suggestion={item} />
          ))}
        </div>
      ) : (
        <EmptySuggestions />
      )}
    </section>
  );
}
