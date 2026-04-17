"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-heading text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Go home
      </Link>
    </div>
  );
}
