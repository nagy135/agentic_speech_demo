import Link from "next/link";
import { ArrowRight, AudioLines } from "lucide-react";
import { instruments } from "@/lib/catalogue";
interface SiteHeaderProps {
  collectionOpen: boolean;
  onToggleCollection: () => void;
}
export function SiteHeader({
  collectionOpen,
  onToggleCollection,
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="First Note home">
        <span className="brand-mark">
          <AudioLines size={24} strokeWidth={1.7} />
        </span>
        first note<span className="brand-period">.</span>
      </Link>
      <button
        aria-expanded={collectionOpen}
        aria-controls="instrument-collection"
        className="catalogue-link"
        onClick={onToggleCollection}
      >
        The instrument collection <span>{instruments.length}</span>
        <ArrowRight size={16} />
      </button>
    </header>
  );
}
