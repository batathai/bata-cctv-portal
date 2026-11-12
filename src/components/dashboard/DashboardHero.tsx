/**
 * Banner at the top of the Dashboard. The picture is a static illustration
 * (public/dashboard-hero.jpg) — decorative only, not live data; the live
 * numbers are the cards right below it. Its left edge fades out (CSS mask)
 * so the title stays readable in light and dark mode.
 */
export function DashboardHero() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#161616] min-h-[150px] sm:min-h-[190px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dashboard-hero.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-y-0 right-0 h-full w-full sm:w-[62%] object-cover object-right opacity-30 sm:opacity-100 dark:opacity-25 sm:dark:opacity-70"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)",
        }}
      />
      <div className="relative px-5 py-6 sm:px-8 sm:py-9">
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-ink dark:text-white">BATA CCTV</h1>
        <p className="mt-2 text-sm sm:text-base font-medium text-brand">Smart Surveillance. Connected Stores. Secure Operations.</p>
        <div className="mt-3 h-0.5 w-16 rounded bg-brand" />
      </div>
    </section>
  );
}
