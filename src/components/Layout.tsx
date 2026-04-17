"use client";

import { LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger className="mr-4" />
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-category-health animate-pulse-glow" />
              <span className="text-sm text-muted-foreground">System Online</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {user && (
                <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[160px]">
                  {user.email}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
