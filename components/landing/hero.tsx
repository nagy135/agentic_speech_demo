import { Music2 } from "lucide-react";
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-eyebrow">
        <span /> EVERY MUSICIAN STARTS SOMEWHERE
      </div>
      <h1 id="hero-title">
        Find the sound
        <br />
        that feels like <em>you.</em>
        <svg
          className="title-spark"
          viewBox="0 0 50 60"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M25 4v14m18 2-10 9M5 23l12 6m16 12 10 8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </h1>
      <p className="hero-description">
        Your favourite music. Your kind of rhythm. Your first instrument.
        <br className="desktop-break" /> Let’s find it together, one
        conversation at a time.
      </p>
      <div className="hero-decoration decoration-left" aria-hidden="true">
        <Music2 size={23} strokeWidth={1.3} />
        <span className="decoration-line" />
      </div>
      <div className="hero-decoration decoration-right" aria-hidden="true">
        <span className="small-star">✧</span>
        <Music2 size={20} strokeWidth={1.3} />
      </div>
    </section>
  );
}
