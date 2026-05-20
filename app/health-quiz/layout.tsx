import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health Quiz | Fit Logic Functional Medicine",
  description:
    "Take a quick hormone-health quiz with Megan Miller, FNP-C. Two minutes to see what your symptoms might be telling you.",
};

export default function HealthQuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="border-b bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <a href="/health-quiz" className="font-heading text-lg font-bold tracking-tight">
            Fit Logic <span className="text-primary">Health Quiz</span>
          </a>
          <a
            href="https://www.MyFitLogic.com"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            MyFitLogic.com →
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-6 text-xs text-muted-foreground">
        <p>
          This quiz is for informational and educational purposes only and is not a substitute for
          professional medical advice, diagnosis, or treatment.
        </p>
      </footer>
    </div>
  );
}
