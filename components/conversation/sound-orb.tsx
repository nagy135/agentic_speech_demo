import type { CSSProperties } from "react";
import type { Activity } from "@/lib/live/types";
export function SoundOrb({
  live,
  activity,
}: {
  live: boolean;
  activity: Activity;
}) {
  return (
    <div
      className={`sound-orb ${live ? `active ${activity}` : ""}`}
      aria-hidden="true"
    >
      <div className="orb-ring ring-one" />
      <div className="orb-ring ring-two" />
      <div className="orb-core">
        <div className="wave-bars">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ "--bar": i } as CSSProperties} />
          ))}
        </div>
      </div>
      <span className="orb-spark">✦</span>
    </div>
  );
}
