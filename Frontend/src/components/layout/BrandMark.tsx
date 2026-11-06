/** The Sentinel mark: a hexagonal sensor with a live core. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bm-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0686c" />
          <stop offset="1" stopColor="#9d0102" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" style={{ fill: "var(--color-navy-800)" }} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" style={{ stroke: "var(--color-border-strong)" }} />
      <path d="M16 5.5 25.5 10.8v10.4L16 26.5 6.5 21.2V10.8z" fill="none" stroke="url(#bm-edge)" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M16 11.2 20.8 13.9v4.2L16 20.8l-4.8-2.7v-4.2z" fill="#a8171c" fillOpacity="0.22" />
      <circle cx="16" cy="16" r="2.4" fill="#f0686c" />
    </svg>
  );
}
