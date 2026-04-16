import { useState } from "react";
import { Search, Sparkles, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { LeadCategory } from "@/lib/types";
import { LEAD_CATEGORY_CONFIG } from "@/lib/types";

export interface EmailMessageRow {
  id: string;
  provider: string;
  external_id: string;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  labels: string[];
  is_lead: boolean;
  lead_score: number | null;
  lead_category: string | null;
  lead_summary: string | null;
  synced_at: string;
  created_at: string;
}

interface Props {
  emails: EmailMessageRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: "all" | "leads";
}

export function EmailMessageList({ emails, selectedId, onSelect, filter }: Props) {
  const [search, setSearch] = useState("");

  const filtered = emails.filter((e) => {
    if (filter === "leads" && !e.is_lead) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesFrom = (e.from_name ?? "").toLowerCase().includes(q) || e.from_email.toLowerCase().includes(q);
      const matchesSubject = (e.subject ?? "").toLowerCase().includes(q);
      const matchesSnippet = (e.snippet ?? "").toLowerCase().includes(q);
      if (!matchesFrom && !matchesSubject && !matchesSnippet) return false;
    }
    return true;
  });

  const leadCount = emails.filter((e) => e.is_lead).length;
  const unreadCount = emails.filter((e) => !e.is_read).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-heading font-bold">{filtered.length}</span>
          <span className="text-sm text-muted-foreground">
            {filter === "leads" ? "Leads" : "Messages"}
          </span>
        </div>
        {leadCount > 0 && filter === "all" && (
          <div className="flex items-center gap-1.5 rounded-full bg-category-health/10 px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-category-health" />
            <span className="text-xs font-medium text-category-health">{leadCount} Leads</span>
          </div>
        )}
        {unreadCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
            <span className="text-xs font-medium text-primary">{unreadCount} Unread</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-background"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.map((email) => {
          const isSelected = selectedId === email.id;
          const displayName = email.from_name || email.from_email;
          const leadCfg = email.lead_category
            ? LEAD_CATEGORY_CONFIG[email.lead_category as LeadCategory]
            : null;

          return (
            <button
              key={email.id}
              onClick={() => onSelect(email.id)}
              className={cn(
                "w-full text-left px-4 py-3.5 border-b transition-colors hover:bg-accent/50",
                isSelected && "bg-accent border-l-2 border-l-primary",
                !email.is_read && !isSelected && "bg-primary/[0.03]",
                email.is_lead && !isSelected && "border-l-2 border-l-category-health",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {!email.is_read && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                  <span className={cn("text-sm truncate", !email.is_read && "font-semibold")}>
                    {displayName}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                </span>
              </div>
              <p className={cn("text-sm truncate mb-1", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
                {email.subject || "(no subject)"}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">
                {email.snippet}
              </p>
              {email.is_lead && leadCfg && (
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", leadCfg.color, leadCfg.bgColor)}>
                    {leadCfg.label}
                  </span>
                  {email.lead_score != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(email.lead_score * 100)}% match
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Mail className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">
              {filter === "leads" ? "No leads detected yet" : "No emails match your search"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
