"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const { session, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (session) { router.replace("/"); return null; }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/settings`,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <Image src='/fitlogic-logo.png' alt="FitLogic" height={48} width={160} className="h-12 w-auto" />
          <p className="text-sm text-muted-foreground text-center">
            {showReset ? "Reset your password" : "Sign in to your workspace"}
          </p>
        </div>

        {!showReset ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fitlogicfunctionalmedicine.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot your password?
            </button>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Don&apos;t have access?</p>
              <a
                href="mailto:hello@fitlogicfunctionalmedicine.com?subject=Access Request – FitLogic Sales Engine"
                className="text-xs font-medium text-primary hover:underline"
              >
                hello@fitlogicfunctionalmedicine.com
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {resetSent ? (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-center text-muted-foreground">
                Check your email — we sent a password reset link to <strong>{email}</strong>.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@fitlogicfunctionalmedicine.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setShowReset(false); setResetSent(false); }}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
