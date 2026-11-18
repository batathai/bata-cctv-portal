/** Decorative SVG overlay aligned to the 1670x941 approved reference image.
 * Uses native SVG animations; no WebGL or runtime dependencies.
 */
export default function LoginOrbitAnimation() {
  return (
    <svg className="bata-orbit-overlay" viewBox="0 0 1670 941" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bata-orbit-red" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff273a" stopOpacity="0" />
          <stop offset=".48" stopColor="#ff1d32" stopOpacity=".92" />
          <stop offset="1" stopColor="#ff273a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bata-orbit-blue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#74c7ff" stopOpacity="0" />
          <stop offset=".52" stopColor="#a7e7ff" stopOpacity=".85" />
          <stop offset="1" stopColor="#74c7ff" stopOpacity="0" />
        </linearGradient>
        <filter id="bata-orbit-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="bata-pedestal-glow" x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <path id="bata-red-orbit-path" d="M 374,467 C 371,386 507,332 659,312 C 826,290 972,310 996,366 C 1025,435 869,490 704,514 C 543,538 391,528 374,467 Z" />
        <path id="bata-blue-orbit-path" d="M 423,538 C 392,454 502,339 657,294 C 802,252 931,286 971,390 C 1012,498 929,613 771,662 C 619,707 462,654 423,538 Z" />
      </defs>
      <g className="bata-orbit-moving">
        <use href="#bata-red-orbit-path" fill="none" stroke="url(#bata-orbit-red)" strokeWidth="3" strokeDasharray="85 1200" className="bata-orbit-red-trail" filter="url(#bata-orbit-glow)" />
        <use href="#bata-blue-orbit-path" fill="none" stroke="url(#bata-orbit-blue)" strokeWidth="2.5" strokeDasharray="110 1300" className="bata-orbit-blue-trail" filter="url(#bata-orbit-glow)" />
        <circle r="4" fill="#fff" filter="url(#bata-orbit-glow)">
          <animateMotion dur="9s" repeatCount="indefinite"><mpath href="#bata-red-orbit-path" /></animateMotion>
        </circle>
        <circle r="3" fill="#b4eaff" filter="url(#bata-orbit-glow)">
          <animateMotion dur="12s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#bata-blue-orbit-path" /></animateMotion>
        </circle>
        <ellipse cx="778" cy="824" rx="144" ry="10" fill="#ff3557" opacity=".45" filter="url(#bata-pedestal-glow)" className="bata-pedestal-pulse" />
      </g>
    </svg>
  );
}
