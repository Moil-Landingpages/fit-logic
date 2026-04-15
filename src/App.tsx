import { Component, lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Eagerly loaded — needed immediately on first paint
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";

// Lazily loaded — only fetched when the user navigates to that route
const FAQManager  = lazy(() => import("./pages/FAQManager"));
const IntakeForms = lazy(() => import("./pages/IntakeForms"));
const Patients    = lazy(() => import("./pages/Patients"));
const Campaigns   = lazy(() => import("./pages/Campaigns"));
const Analytics   = lazy(() => import("./pages/Analytics"));
const Settings    = lazy(() => import("./pages/Settings"));
const Referrals   = lazy(() => import("./pages/Referrals"));
const Inbox       = lazy(() => import("./pages/Inbox"));
const Retreat     = lazy(() => import("./pages/Retreat"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl">⚠</span>
          </div>
          <h2 className="font-heading text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <Button onClick={() => this.setState({ error: null })} variant="outline">
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Protected — all app routes require a session */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/inbox" element={<Inbox />} />
                          <Route path="/faqs" element={<FAQManager />} />
                          <Route path="/forms" element={<IntakeForms />} />
                          <Route path="/intake" element={<Navigate to="/forms" replace />} />
                          <Route path="/contacts" element={<Patients />} />
                          <Route path="/patients" element={<Navigate to="/contacts" replace />} />
                          <Route path="/campaigns" element={<Campaigns />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/referrals" element={<Referrals />} />
                          <Route path="/retreat" element={<Retreat />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
