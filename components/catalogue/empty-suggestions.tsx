import { Music2, Sparkles } from "lucide-react";
export function EmptySuggestions() {
  return (
    <div className="empty-suggestions">
      <div className="empty-icon">
        <Music2 size={25} strokeWidth={1.3} />
        <Sparkles size={14} />
      </div>
      <h3>A few words from you. A world of instruments.</h3>
      <p>As you chat, Melody will bring your best matches here.</p>
      <div className="family-pills">
        <span>Strings</span>
        <span>Keys</span>
        <span>Wind</span>
        <span>Percussion</span>
        <span>+ a little unexpected</span>
      </div>
    </div>
  );
}
