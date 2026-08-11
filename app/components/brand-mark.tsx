/**
 * The BudgetRail mark: two rails meeting a buffer stop — the thing at the end
 * of a dead-end track whose only job is to stop what is travelling down it.
 *
 * Every element rides the gradient and none of it is dark ink, so a single
 * definition works on light and dark backgrounds with no variant to maintain,
 * and the three strokes stay legible down to a 16px favicon.
 */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="budgetrail-mark"
          x1="4"
          y1="8"
          x2="27"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="0.55" stopColor="#6366F1" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#budgetrail-mark)"
        strokeWidth="3.4"
        strokeLinecap="round"
      >
        <path d="M11 27 L7 13" />
        <path d="M21 27 L25 13" />
        <path d="M5 7 L27 7" />
      </g>
    </svg>
  );
}
