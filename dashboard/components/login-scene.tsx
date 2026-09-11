/**
 * Decorative background for the login page: a soft brand-colored glow, a low horizon of
 * abstract angular peaks, drifting particles, and a few faceted crystal accents.
 *
 * Entirely driven by the active theme's CSS variables (--color-brand, --color-ink, ...) —
 * no per-theme branching here, same as every other shared component in this app. Under
 * VIP Neon this reads as a magenta glow with faint shards; under Obsidian, a quiet
 * monochrome vignette; under Glacier, an icy horizon with drifting "snow" — three moods
 * from one markup, entirely original (no photo, no franchise imagery).
 *
 * aria-hidden + pointer-events-none: this is atmosphere, not content — a screen reader
 * or a click must pass straight through it to the actual login card.
 */
export function LoginScene() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-canvas" aria-hidden>
      {/* Two soft glow blobs, opposite corners, for depth rather than a flat gradient. */}
      <div
        className="absolute -top-1/4 -right-1/4 h-[60vh] w-[60vh] rounded-full opacity-25 blur-[100px]"
        style={{ background: "var(--color-brand)" }}
      />
      <div
        className="absolute -bottom-1/3 -left-1/4 h-[55vh] w-[55vh] rounded-full opacity-15 blur-[110px]"
        style={{ background: "var(--color-brand)" }}
      />

      {/* Low horizon of angular peaks, lit from above by the brand color — abstract
          enough to read as mountains (Glacier), a skyline (VIP Neon) or nothing more
          than geometry (Obsidian), never a literal scene. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[42vh] w-full min-w-[900px]"
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMax slice"
      >
        <polygon
          points="0,400 0,260 120,180 230,240 340,120 460,220 560,90 660,210 780,140 900,230 1020,150 1120,240 1200,190 1200,400"
          fill="var(--color-surface)"
        />
        <polyline
          points="0,260 120,180 230,240 340,120 460,220 560,90 660,210 780,140 900,230 1020,150 1120,240 1200,190"
          fill="none"
          stroke="var(--color-brand)"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
      </svg>

      {/* Faceted crystal accents — simple stroked polygons, brand-tinted. */}
      <svg
        className="absolute left-[8%] top-[18%] h-24 w-16 opacity-40 sm:h-32 sm:w-20"
        viewBox="0 0 80 130"
      >
        <polygon
          points="40,0 70,45 55,130 25,130 10,45"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="1.5"
        />
        <line x1="40" y1="0" x2="40" y2="130" stroke="var(--color-brand)" strokeOpacity="0.5" strokeWidth="1" />
        <line x1="10" y1="45" x2="70" y2="45" stroke="var(--color-brand)" strokeOpacity="0.5" strokeWidth="1" />
      </svg>
      <svg
        className="absolute right-[10%] top-[38%] h-16 w-11 opacity-30 sm:h-20 sm:w-14"
        viewBox="0 0 80 130"
      >
        <polygon
          points="40,0 70,45 55,130 25,130 10,45"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="1.5"
        />
      </svg>

      {/* Sparse drifting particles — snow, sparkle, or dust depending on the theme.
          Positions are fixed rather than random so server and client markup match. */}
      {[
        [12, 15], [22, 62], [34, 30], [48, 78], [58, 20], [67, 55], [76, 12], [85, 68],
        [91, 35], [15, 88], [40, 8], [63, 90],
      ].map(([left, top], i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full opacity-50 motion-safe:animate-pulse"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            background: "var(--color-ink)",
            animationDuration: `${3 + (i % 4)}s`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
