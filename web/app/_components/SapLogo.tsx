/**
 * SAP wordmark (nominative use — this product connects to SAP S/4HANA).
 * SAP and S/4HANA are trademarks of SAP SE; see the footer disclaimer.
 */
export function SapLogo({ height = 28 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 120 60"
      role="img"
      aria-label="SAP"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="sapBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00AEEF" />
          <stop offset="55%" stopColor="#0073E6" />
          <stop offset="100%" stopColor="#00339A" />
        </linearGradient>
      </defs>
      <text
        x="2"
        y="46"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="52"
        letterSpacing="-2"
        fill="url(#sapBlue)"
      >
        SAP
      </text>
    </svg>
  );
}

/** Wordmark for muave, the product. */
export function MuaveMark() {
  return (
    <span style={{ fontWeight: 700, letterSpacing: "-0.02em", fontSize: 18 }}>
      muave<span style={{ color: "var(--accent)" }}>·</span>sapmcp
    </span>
  );
}
