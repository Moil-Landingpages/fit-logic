// Health Quiz definitions for the public hormone-health questionnaires.
// Submissions are written to the existing `intake_submissions` table; each
// quiz is backed by a row in `intake_forms` seeded by migration
// 20260519000001_health_quiz_forms.sql with the stable UUIDs below.

export type QuizGender = "women" | "men";

export interface QuizQuestion {
  id: string;
  label: string;
}

export interface QuizConfig {
  gender: QuizGender;
  formId: string;
  title: string;
  subtitle: string;
  questions: QuizQuestion[];
}

export const QUIZ_SCALE: { value: number; label: string; description: string }[] = [
  { value: 0, label: "Not at all", description: "I don't experience this" },
  { value: 1, label: "A bit", description: "Occasionally noticeable" },
  { value: 2, label: "Sometimes", description: "Somewhat, but it doesn't really bother me" },
  { value: 3, label: "Frequently", description: "Often, and it's bothersome" },
  { value: 4, label: "All or most of the time", description: "This is part of my daily life" },
];

export const WOMENS_QUIZ_FORM_ID = "a1f0c0d0-0001-4000-8001-000000000001";
export const MENS_QUIZ_FORM_ID = "a1f0c0d0-0002-4000-8001-000000000002";

export const WOMENS_QUIZ: QuizConfig = {
  gender: "women",
  formId: WOMENS_QUIZ_FORM_ID,
  title: "Women's Hormone Health Quiz",
  subtitle:
    "Ten quick questions to help us understand how your hormones are showing up in your life. Takes about 2 minutes.",
  questions: [
    { id: "q1",  label: "Sometimes my mood is low and things I used to be interested in no longer interest me." },
    { id: "q2",  label: "I'm irritable (even if this is just around your period)." },
    { id: "q3",  label: "I used to want to have sex, but now I'm just like, \"meh.\"" },
    { id: "q4",  label: "I have tried exercise and eating healthy but I keep gaining weight." },
    { id: "q5",  label: "I wake up sweating at night and sometimes have to change the sheets." },
    { id: "q6",  label: "I have trouble falling and/or staying asleep." },
    { id: "q7",  label: "My energy is low." },
    { id: "q8",  label: "My brain feels \"foggy\" and I feel like I forget simple words." },
    { id: "q9",  label: "My belly feels bloated." },
    { id: "q10", label: "I have heartburn or acid reflux." },
  ],
};

export const MENS_QUIZ: QuizConfig = {
  gender: "men",
  formId: MENS_QUIZ_FORM_ID,
  title: "Men's Hormone Health Quiz",
  subtitle:
    "Twelve quick questions to help us understand how your hormones are showing up in your life. Takes about 2 minutes.",
  questions: [
    { id: "q1",  label: "My mood is low and it is affecting my outlook on life." },
    { id: "q2",  label: "I used to have a great sex drive, but now I'm sometimes embarrassed to admit that it has declined." },
    { id: "q3",  label: "Morning erections have decreased." },
    { id: "q4",  label: "I have tried exercise and eating healthy but I keep gaining weight." },
    { id: "q5",  label: "My energy is like the \"meh\" emoji." },
    { id: "q6",  label: "I feel like taking a nap in the afternoon." },
    { id: "q7",  label: "My motivation or drive to do things is low." },
    { id: "q8",  label: "Little things seem to set me off." },
    { id: "q9",  label: "My belly feels bloated." },
    { id: "q10", label: "I am having trouble with regular bowel movements (too many, too loose, or less than one a day)." },
    { id: "q11", label: "I have heartburn or acid reflux." },
    { id: "q12", label: "I just don't feel like myself." },
  ],
};

export const QUIZ_BY_GENDER: Record<QuizGender, QuizConfig> = {
  women: WOMENS_QUIZ,
  men: MENS_QUIZ,
};

export interface SeverityBand {
  key: "minimal" | "mild" | "moderate" | "high";
  label: string;
  blurb: string;
  ratioFloor: number; // inclusive lower bound of score/maxScore
}

// Bands are applied to the ratio (score / maxScore) so they work for both
// the 10-question and 12-question quizzes.
export const SEVERITY_BANDS: SeverityBand[] = [
  {
    key: "minimal",
    label: "Minimal symptoms",
    blurb:
      "Your symptom load is low. This is a great time to focus on prevention — sleep, nutrition, and stress management compound quickly when you start from a strong baseline.",
    ratioFloor: 0,
  },
  {
    key: "mild",
    label: "Mild symptoms",
    blurb:
      "You're noticing a few things that don't feel quite right. Functional-medicine basics — labs, nutrition, sleep — usually move the needle here within a few weeks.",
    ratioFloor: 0.25,
  },
  {
    key: "moderate",
    label: "Moderate symptoms",
    blurb:
      "There's a pattern here worth investigating. A targeted workup (hormones, thyroid, metabolic, gut) typically uncovers the root cause and points to a clear plan.",
    ratioFloor: 0.5,
  },
  {
    key: "high",
    label: "High symptom load",
    blurb:
      "Your symptoms are meaningfully affecting your day-to-day. Don't keep pushing through — a comprehensive evaluation can identify what's driving this and how to feel like yourself again.",
    ratioFloor: 0.7,
  },
];

export function scoreSeverity(score: number, maxScore: number): SeverityBand {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  let band = SEVERITY_BANDS[0];
  for (const b of SEVERITY_BANDS) {
    if (ratio >= b.ratioFloor) band = b;
  }
  return band;
}

export function maxScoreFor(quiz: QuizConfig): number {
  return quiz.questions.length * 4;
}
