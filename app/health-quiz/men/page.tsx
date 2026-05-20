"use client";

import HealthQuiz from "@/page-components/HealthQuiz";
import { MENS_QUIZ } from "@/lib/health-quiz-data";

export default function MensHealthQuizPage() {
  return <HealthQuiz quiz={MENS_QUIZ} />;
}
