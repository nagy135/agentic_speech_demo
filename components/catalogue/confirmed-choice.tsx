import { ArrowRight, Check } from "lucide-react";
import type { Suggestion } from "@/lib/tools";
import { InstrumentCard } from "./instrument-card";
interface ConfirmedChoiceProps {
  choice: Suggestion;
  onExploreAgain: () => void;
}
export function ConfirmedChoice({
  choice,
  onExploreAgain,
}: ConfirmedChoiceProps) {
  return (
    <div className="final-choice">
      <InstrumentCard suggestion={choice} chosen />
      <div className="choice-message">
        <span className="success-mark">
          <Check size={29} />
        </span>
        <h3>
          Chosen by you.
          <br />
          Full of possibility.
        </h3>
        <p>
          Every musician remembers their first instrument. Here’s to the very
          first note of your story.
        </p>
        <button className="text-button" onClick={onExploreAgain}>
          Explore again <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
