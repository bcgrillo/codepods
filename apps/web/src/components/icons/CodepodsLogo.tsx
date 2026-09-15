/**
 * CodePods logo — uses currentColor for strokes so it adapts to light/dark themes.
 * Based on the original codepods.svg (cleaned up, Inkscape metadata removed).
 */
export function CodepodsLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M 54.57,15.43 44.57,5.43 C 42.77,3.62 40.27,2.5 37.5,2.5 H 12.5 C 6.96,2.5 2.5,6.96 2.5,12.5 v 25 c 0,2.77 1.11,5.27 2.93,7.07 l 10,10" />
      <rect x="12.5" y="12.5" width="45" height="45" rx="10" />
      <path d="m 29.26,22.91 -8.44,8.44 8.44,8.44" />
      <path d="m 40.74,22.91 8.44,8.44 -8.44,8.44" />
      <path d="m 40.74,39.78 v 8.44" />
    </svg>
  );
}