import Link from "next/link";

export default function HealthQuizLanding() {
  return (
    <div className="space-y-10">
      <section className="text-center space-y-3">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          2-minute hormone check-in
        </span>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
          How are your hormones <span className="text-primary">really</span> doing?
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Most people brush off fatigue, mood swings, low libido, weight that won&apos;t budge — and chalk
          it up to &quot;just getting older.&quot; This quick quiz helps you see what&apos;s actually showing up,
          and gives Megan a head start if you decide to book a consult.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/health-quiz/women"
          className="group rounded-2xl border bg-card p-6 transition-all hover:border-primary hover:shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xl font-semibold">For women</h2>
            <span className="text-primary text-sm group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <p className="text-sm text-muted-foreground">
            10 questions covering mood, cycle, sleep, energy, libido, weight, and digestion.
          </p>
        </Link>

        <Link
          href="/health-quiz/men"
          className="group rounded-2xl border bg-card p-6 transition-all hover:border-primary hover:shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-xl font-semibold">For men</h2>
            <span className="text-primary text-sm group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <p className="text-sm text-muted-foreground">
            12 questions covering mood, drive, sleep, energy, libido, weight, and digestion.
          </p>
        </Link>
      </div>

      <section className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">What happens after you submit?</p>
        <p>
          Your answers come straight to the Fit Logic team. Megan&apos;s office will reach out within a
          business day if you opted in for a follow-up. We don&apos;t share your responses with anyone
          else.
        </p>
      </section>
    </div>
  );
}
