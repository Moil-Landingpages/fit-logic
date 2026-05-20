"use client";

import HealthQuiz from "@/page-components/HealthQuiz";
import { WOMENS_QUIZ } from "@/lib/health-quiz-data";

export default function WomensHealthQuizPage() {
  return <HealthQuiz quiz={WOMENS_QUIZ} />;
}
