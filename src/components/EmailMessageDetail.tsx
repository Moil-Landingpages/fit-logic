import { Mail, Clock, Sparkles, ExternalLink, Tag } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LEAD_CATEGORY_CONFIG } from "@/lib/types";
import type { LeadCategory } from "@/lib/types";
import type { EmailMessageRow } from "@/components/EmailMessageList";

interface Props {
  email: EmailMessageRow;
  onUpdate: (id: string, updates: Partial<EmailMessageRow>) => void;
}

export function EmailMessageDetail({ email, onUpdate }: Props) {
  const leadCfg = email.lead_category
    ? LEAD_CATEGORY_CONFIG[email.lead_category as LeadCategory]
    : null;

  const handleMarkRead = async () => {
    const { error } = await supabase
      .from("email_messages")
      .update({ is_read: true })
      .eq("id", email.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onUpdate(email.id, { is_read: true });
  };

  const handleConvertToContact = () => {
    // Navigate to contact creation with pre-filled data
    // For now, show the intent — full implementation ties to PatientForm
    toast.success(`Ready to create contact for ${email.from_name || email.from_email}`);
  };

  // Auto-mark as read when viewed
  if (!email.is_read) {
    handleMarkRead();
  }

  return (
    <div className="flex flex-col h-full animate-slide-in-right">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-card">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold truncate">
              {email.subject || "(no subject)"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {email.from_name ? (
                <>{email.from_name} &lt;{email.from_email}&gt;</>
              ) : (
                email.from_email
              )}
            </p>
          </div>
          {email.is_lead && leadCfg && (
            <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0", leadCfg.bgColor)}>
              <Sparkles className={cn("h-3.5 w-3.5", leadCfg.color)} />
              <span className={cn("text-xs font-medium", leadCfg.color)}>
                {leadCfg.label}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />
            {email.provider === "gmail" ? "Gmail" : "Outlook"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {format(new Date(email.received_at), "MMM d, h:mm a")}
          </span>
          {email.to_email && (
            <span className="flex items-center gap-1">
              To: {email.to_email}
            </span>
          )}
          {email.lead_score != null && (
            <span className="ml-auto text-[11px]">
              Lead Score: {Math.round(email.lead_score * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Lead summary */}
      {email.is_lead && email.lead_summary && (
        <div className="mx-6 mt-4 rounded-lg border border-category-health/30 bg-category-health/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-category-health" />
            <span className="text-xs font-medium text-category-health">AI Lead Analysis</span>
          </div>
          <p className="text-sm text-muted-foreground">{email.lead_summary}</p>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {email.body_text || email.snippet || "No content available."}
            </p>
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {email.is_lead && (
            <Button
              variant="default"
              size="sm"
              onClick={handleConvertToContact}
              className="gap-1.5"
            >
              <Tag className="h-3.5 w-3.5" />
              Add to Contacts
            </Button>
          )}
          {email.provider === "gmail" && email.external_id && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-1.5"
            >
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${email.external_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Gmail
              </a>
            </Button>
          )}
        </div>

        {/* Labels */}
        {email.labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Labels:</span>
            {email.labels.map((label) => (
              <span
                key={label}
                className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
