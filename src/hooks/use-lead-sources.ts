"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadSource {
  id: string;
  label: string;
  is_default: boolean;
  sort_order: number;
}

const LEAD_SOURCES_KEY = ["lead_sources"] as const;

export function useLeadSources() {
  return useQuery({
    queryKey: LEAD_SOURCES_KEY,
    queryFn: async (): Promise<LeadSource[]> => {
      // Cast through unknown — auto-generated supabase types in
      // src/integrations/supabase/types.ts predate this table.
      // Cast supabase to `any` for the lead_sources table — the table exists
      // (added in migration 20260429000001) but auto-generated types in
      // src/integrations/supabase/types.ts are stale.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{ data: LeadSource[] | null; error: Error | null }>;
            };
          };
        };
      })
        .from("lead_sources")
        .select("id, label, is_default, sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export const LEAD_SOURCES_QUERY_KEY = LEAD_SOURCES_KEY;
