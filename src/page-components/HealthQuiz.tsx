"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

export default function HealthQuiz({ quiz }: Props) {
  const router = useRouter();
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

  const setAnswer = (qid: string, value: number) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      toast.error("Please answer all questions before submitting.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email so we can follow up.");
      return;
    }

    setSubmitting(true);
    const severity = scoreSeverity(score, maxScore);

    // Map question id -> "<value> - <label>" so it reads cleanly in the CRM
    // and matches the option strings stored in intake_forms.questions.
    const submissionData: Record<string, string | string[]> = {};
    for (const q of quiz.questions) {
      const v = answers[q.id];
      const scale = QUIZ_SCALE[v];
      submissionData[q.id] = `${v} - ${scale.label}`;
    }
    submissionData._quiz_type = quiz.gender;
    submissionData._score = String(score);
    submissionData._max_score = String(maxScore);
    submissionData._severity = severity.key;
    if (phone.trim()) submissionData._phone = phone.trim();
    submissionData._follow_up_consent = consent ? "yes" : "no";

    const { error } = await supabase.from("intake_submissions").insert({
      form_id: quiz.formId,
      patient_name: name.trim(),
      patient_email: email.trim() || null,
      submission_data: submissionData,
      completion_status: "submitted",
      review_status: "pending",
      submitted_at: new Date().toISOString(),
    });

    setSubmitting(false);

    if (error) {
      toast.error("We couldn't save your answers — please try again.");
      console.error(error);
      return;
    }

    const params = new URLSearchParams({
      gender: quiz.gender,
      score: String(score),
      max: String(maxScore),
    });
    router.push(`/health-quiz/thank-you?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
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

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold">Where should we send the results?</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll keep your answers private. A team member may reach out if you opted in.
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
            <Label htmlFor="phone">Phone (optional)</Label>
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
        <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
          />
          <span>
            It&apos;s okay to contact me about my results and Fit Logic services. You can opt out
            anytime.
          </span>
        </label>
      </section>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground order-2 sm:order-1">
          {allAnswered
            ? `Your current score: ${score} / ${maxScore}`
            : `${totalQuestions - answeredCount} question${
                totalQuestions - answeredCount === 1 ? "" : "s"
              } remaining`}
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={submitting || !allAnswered}
          className="w-full sm:w-auto order-1 sm:order-2"
        >
          {submitting ? "Submitting…" : "See my results"}
        </Button>
      </div>
    </form>
  );
}
