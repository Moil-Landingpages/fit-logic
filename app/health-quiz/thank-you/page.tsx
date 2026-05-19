"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { scoreSeverity } from "@/lib/health-quiz-data";

function ThankYouInner() {
  const params = useSearchParams();
  const gender = params.get("gender") === "men" ? "men" : "women";
  const score = Math.max(0, Number(params.get("score") || 0));
  const max = Math.max(1, Number(params.get("max") || (gender === "men" ? 48 : 40)));
  const band = scoreSeverity(score, max);
  const ratioPct = Math.round((score / max) * 100);

  return (
    <div className="space-y-8">
      <section className="text-center space-y-3">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Thanks — we got your answers
        </span>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
          Your hormone-health snapshot
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          This isn&apos;t a diagnosis — it&apos;s a starting point. Use it to decide whether digging
          deeper makes sense for you right now.
        </p>
      </section>

      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg font-semibold">{band.label}</h2>
          <span className="text-sm text-muted-foreground">
            {score} / {max} ({ratioPct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${ratioPct}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{band.blurb}</p>
      </section>

      <section className="rounded-2xl border bg-muted/40 p-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold">What&apos;s next?</h2>
        <p className="text-sm text-muted-foreground">
          Megan Miller, FNP-C and the Fit Logic team will review your answers. If you opted in
          for follow-up we&apos;ll reach out within a business day. In the meantime, you can:
        </p>
        <ul className="text-sm space-y-2">
          <li>
            <a
              href="https://www.MyFitLogic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Visit MyFitLogic.com
            </a>{" "}
            to learn about our hormone optimization programs.
          </li>
          <li>
            Call or text <span className="font-medium text-foreground">512-580-4399</span> to book a
            consult.
          </li>
        </ul>
      </section>

      <div className="flex items-center justify-between pt-2">
        <Link
          href="/health-quiz"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to quiz selector
        </Link>
        <a
          href="https://www.MyFitLogic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary"
        >
          MyFitLogic.com →
        </a>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <ThankYouInner />
    </Suspense>
  );
}
