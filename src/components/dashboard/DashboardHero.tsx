import clsx from "clsx";

/**
 * Banner at the top of the Dashboard. The picture is a static illustration
 * (public/dashboard-hero.webp, supplied by the owner 2026-11-12) — decorative
 * only, not live data; the live numbers are the cards right below it. It
 * cancels the page padding (negative margins) so it runs edge to edge up to
 * the top of the screen, behind the floating top bar (see PortalLayout), and
 * the bottom is left clear so the KPI cards can overlap it. A left-to-right
 * fade keeps the title readable in light and dark mode.
 *
 * `compact` is the shorter version shown on every other page (PortalLayout).
 */
// Wide screens: the whole picture (city + Bata store + camera) is shown at its
// natural proportions, pinned right, and its left edge melts into the page.
const maskLeft = {
  maskImage: "linear-gradient(to right, transparent 0%, black 38%)",
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 38%)",
} as const;

export function DashboardHero({ compact = false }: { compact?: boolean }) {
  const Title = compact ? "p" : "h1";
  return (
    <section
      className={clsx(
        "relative overflow-hidden -mx-4 -mt-4 lg:-mx-6 lg:-mt-6 bg-white dark:bg-[#161616]",
        compact ? "mb-3 min-h-[150px] sm:min-h-[200px]" : "min-h-[210px] sm:min-h-[360px]"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dashboard-hero.webp"
        alt=""
        aria-hidden="true"
        className="absolute top-0 right-0 h-full w-full object-cover object-[right_30%] sm:w-auto sm:max-w-none sm:object-contain dark:opacity-80"
        style={maskLeft}
      />
      {/* Phones: even wash over the whole picture. Wider screens: solid behind the title, clear over the picture. */}
      <div className="absolute inset-0 bg-white/75 sm:bg-transparent sm:bg-[linear-gradient(to_right,rgba(255,255,255,0.97)_0%,rgba(255,255,255,0.9)_30%,rgba(255,255,255,0)_62%)] dark:bg-[#161616]/80 sm:dark:bg-transparent sm:dark:bg-[linear-gradient(to_right,rgba(22,22,22,0.97)_0%,rgba(22,22,22,0.9)_30%,rgba(22,22,22,0.2)_62%)]" />
      {/* Bottom of the picture melts into the page colour, so there is no hard edge behind the KPI cards. */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface-muted via-surface-muted/70 to-transparent dark:from-surface-dark dark:via-surface-dark/90" />
      <div className={clsx("relative px-5 sm:px-8", compact ? "pt-16 pb-6 sm:pt-[4.25rem] sm:pb-7" : "pt-20 pb-28 sm:pt-24 sm:pb-28")}>
        <Title className={clsx("font-display font-extrabold tracking-tight text-ink dark:text-white", compact ? "text-2xl sm:text-4xl" : "text-3xl sm:text-5xl")}>BATA CCTV</Title>
        <p className="mt-2 text-sm sm:text-base font-semibold text-brand dark:text-[#FF7A80]">Smart Surveillance. Connected Stores. Secure Operations.</p>
        <div className="mt-3 h-0.5 w-16 rounded bg-brand" />
      </div>
    </section>
  );
}
