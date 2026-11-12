/**
 * Banner at the top of the Dashboard. The picture is a static illustration
 * (public/dashboard-hero.webp, supplied by the owner 2026-11-12) — decorative
 * only, not live data; the live numbers are the cards right below it. A
 * left-to-right fade keeps the title readable in light and dark mode.
 */
export function DashboardHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#161616] min-h-[150px] sm:min-h-[260px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dashboard-hero.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[right_30%] dark:opacity-70"
      />
      {/* Phones: even wash over the whole picture. Wider screens: solid behind the title, clear over the picture. */}
      <div className="absolute inset-0 bg-white/75 sm:bg-transparent sm:bg-[linear-gradient(to_right,rgba(255,255,255,0.97)_0%,rgba(255,255,255,0.9)_30%,rgba(255,255,255,0)_62%)] dark:bg-[#161616]/80 sm:dark:bg-transparent sm:dark:bg-[linear-gradient(to_right,rgba(22,22,22,0.97)_0%,rgba(22,22,22,0.9)_30%,rgba(22,22,22,0.2)_62%)]" />
      <div className="relative px-5 py-6 sm:px-8 sm:py-16">
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-ink dark:text-white">BATA CCTV</h1>
        <p className="mt-2 text-sm sm:text-base font-semibold text-brand dark:text-[#FF7A80]">Smart Surveillance. Connected Stores. Secure Operations.</p>
        <div className="mt-3 h-0.5 w-16 rounded bg-brand" />
      </div>
    </section>
  );
}
