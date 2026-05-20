"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Mail, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  QUIZ_SCALE,
  maxScoreFor,
  scoreSeverity,
  type QuizConfig,
} from "@/lib/health-quiz-data";

interface Props {
  quiz: QuizConfig;
}

type Phase = "questions" | "results";

export default function HealthQuiz({ quiz }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("questions");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = quiz.questions.length;
  const progress = Math.round((answeredCount / totalQuestions) * 100);
  const allAnswered = answeredCount === totalQuestions;
  const score = useMemo(
    () => Object.values(answers).reduce((sum, v) => sum + v, 0),
    [answers],
  );
  const maxScore = maxScoreFor(quiz);
  const severity = useMemo(
    () => scoreSeverity(score, maxScore),
    [score, maxScore],
  );
  const ratioPct = Math.round((score / maxScore) * 100);

  const setAnswer = (qid: string, value: number) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const handleSeeResults = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      toast.error("Please answer all questions before continuing.");
      return;
    }
    setPhase("results");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleDetailedRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email so we can send you the details.");
      return;
    }

    setSubmitting(true);

    const formattedAnswers: Record<string, string> = {};
    for (const q of quiz.questions) {
      const v = answers[q.id];
      const scale = QUIZ_SCALE[v];
      formattedAnswers[q.id] = `${v} - ${scale.label}`;
    }

    try {
      const res = await fetch("/api/health-quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: quiz.formId,
          quiz_type: quiz.gender,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          consent,
          score,
          max_score: maxScore,
          severity: severity.key,
          severity_label: severity.label,
          answers: formattedAnswers,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("health-quiz submit failed", body);
        toast.error("We couldn't save your answers — please try again.");
        setSubmitting(false);
        return;
      }

      const params = new URLSearchParams({
        gender: quiz.gender,
        score: String(score),
        max: String(maxScore),
        saved: "1",
      });
      router.push(`/health-quiz/thank-you?${params.toString()}`);
    } catch (err) {
      console.error(err);
      toast.error("We couldn't save your answers — please try again.");
      setSubmitting(false);
    }
  };

  if (phase === "results") {
    return (
      <div className="space-y-6">
        <section className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> Your snapshot is ready
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
            Here&apos;s what your answers suggest
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This isn&apos;t a diagnosis — it&apos;s a starting point. A clinician will review
            the full picture if you opt in below.
          </p>
        </section>

        <section className="rounded-2xl border bg-card p-6 space-y-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-lg sm:text-xl font-semibold">
              {severity.label}
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {score} / {maxScore} · {ratioPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${ratioPct}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {severity.blurb}
          </p>
          <div className="grid grid-cols-4 gap-1 pt-1">
            {(["minimal", "mild", "moderate", "high"] as const).map((k) => (
              <div
                key={k}
                className={`h-1 rounded-full ${
                  severity.key === k ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </section>

        <form
          onSubmit={handleDetailedRequest}
          className="rounded-2xl border bg-card p-5 sm:p-6 space-y-5"
        >
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Get your detailed result
            </h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll email a clinician-reviewed breakdown of your answers and
              suggested next steps.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="First and last name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@email.com"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Phone (optional)
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="(555) 555-5555"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm cursor-pointer">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">
                Allow Fit Logic to contact me
              </span>{" "}
              about my results, next steps, and relevant services. You can opt
              out anytime.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPhase("questions")}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              ← Review answers
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="w-full sm:flex-1 order-1 sm:order-2 gap-1.5"
            >
              {submitting ? (
                "Sending…"
              ) : (
                <>
                  Send my detailed result <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            <CheckCircle2 className="inline h-3 w-3 mr-1 text-primary" />
            Your information is private and never shared with third parties.
          </p>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSeeResults} className="space-y-8">
      <section className="space-y-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
          {quiz.title}
        </h1>
        <p className="text-muted-foreground">{quiz.subtitle}</p>
      </section>

      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background/90 backdrop-blur border-b">
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-muted-foreground">
            {answeredCount} of {totalQuestions} answered
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <ol className="space-y-6">
        {quiz.questions.map((q, idx) => (
          <li
            key={q.id}
            className="rounded-xl border bg-card p-4 sm:p-5 space-y-3"
          >
            <p className="text-sm sm:text-base font-medium leading-snug">
              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
              {q.label}
            </p>
            <div
              role="radiogroup"
              aria-label={q.label}
              className="grid grid-cols-5 gap-1.5 sm:gap-2"
            >
              {QUIZ_SCALE.map((opt) => {
                const selected = answers[q.id] === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswer(q.id, opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2.5 text-center transition-all ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-input bg-background hover:border-primary/40 hover:bg-muted"
                    }`}
                  >
                    <span className="font-heading text-base font-bold leading-none">
                      {opt.value}
                    </span>
                    <span
                      className={`text-[10px] leading-tight ${
                        selected ? "" : "text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground order-2 sm:order-1">
          {allAnswered
            ? "All done — see your snapshot."
            : `${totalQuestions - answeredCount} question${
                totalQuestions - answeredCount === 1 ? "" : "s"
              } remaining`}
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={!allAnswered}
          className="w-full sm:w-auto order-1 sm:order-2 gap-1.5"
        >
          See my results <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
