import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_CONFIG, type InquiryCategory } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, FileText, Mail, Clock } from "lucide-react";

type TimelineEvent = {
  id: string;
  type: "inquiry" | "intake" | "campaign";
  title: string;
  description: string;
  date: string;
  status: string;
  meta?: Record<string, string>;
};

function eventIcon(type: TimelineEvent["type"]) {
  switch (type) {
    case "inquiry":  return <MessageSquare className="h-4 w-4" />;
    case "intake":   return <FileText className="h-4 w-4" />;
    case "campaign": return <Mail className="h-4 w-4" />;
  }
}

function eventColor(type: TimelineEvent["type"]) {
  switch (type) {
    case "inquiry":  return "bg-primary text-primary-foreground";
    case "intake":   return "bg-accent text-accent-foreground";
    case "campaign": return "bg-secondary text-secondary-foreground";
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Typed shape for the intake_submissions join result
type IntakeSubmissionRow = {
  id: string;
  patient_name: string;
  completion_status: string;
  review_status: string;
  created_at: string;
  submitted_at: string | null;
  form_id: string;
  intake_forms: { name: string } | null;
};

// Typed shape for the campaign_recipients join result
type CampaignRecipientRow = {
  id: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  created_at: string;
  campaigns: { name: string } | null;
};

export function PatientTimeline({ patientId }: { patientId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: async () => {
      const [inquiriesRes, submissionsRes, recipientsRes] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id, raw_content, category, status, source, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("intake_submissions")
          .select("id, patient_name, completion_status, review_status, created_at, submitted_at, form_id, intake_forms(name)")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("campaign_recipients")
          .select("id, status, sent_at, opened_at, created_at, campaigns(name)")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
      ]);

      if (inquiriesRes.error) throw inquiriesRes.error;
      if (submissionsRes.error) throw submissionsRes.error;
      if (recipientsRes.error) throw recipientsRes.error;

      const timeline: TimelineEvent[] = [];

      for (const inq of inquiriesRes.data) {
        const catConfig = CATEGORY_CONFIG[inq.category as InquiryCategory];
        timeline.push({
          id: inq.id,
          type: "inquiry",
          title: `Inquiry — ${catConfig?.label ?? inq.category}`,
          description: inq.raw_content.length > 120
            ? inq.raw_content.slice(0, 120) + "…"
            : inq.raw_content,
          date: inq.created_at,
          status: inq.status,
          meta: { source: inq.source },
        });
      }

      for (const sub of submissionsRes.data as IntakeSubmissionRow[]) {
        const formName = sub.intake_forms?.name ?? "Form";
        timeline.push({
          id: sub.id,
          type: "intake",
          title: `Intake — ${formName}`,
          description: `Status: ${sub.completion_status} · Review: ${sub.review_status}`,
          date: sub.submitted_at ?? sub.created_at,
          status: sub.completion_status,
        });
      }

      for (const rec of recipientsRes.data as CampaignRecipientRow[]) {
        const campaignName = rec.campaigns?.name ?? "Campaign";
        const eventDate = rec.opened_at ?? rec.sent_at ?? rec.created_at;
        const description = rec.opened_at
          ? "Email opened"
          : rec.sent_at
            ? "Email delivered"
            : "Added to campaign";
        timeline.push({
          id: rec.id,
          type: "campaign",
          title: `Campaign — ${campaignName}`,
          description,
          date: eventDate,
          status: rec.status,
        });
      }

      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return timeline;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No activity yet for this contact</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-6">
        {events.map((event) => (
          <div key={event.id} className="relative flex gap-4">
            <div className={`absolute -left-6 mt-1 flex h-7 w-7 items-center justify-center rounded-full ${eventColor(event.type)} shrink-0 z-10`}>
              {eventIcon(event.type)}
            </div>
            <Card className="flex-1 ml-4">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {event.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{formatDate(event.date)}</span>
                  {event.meta?.source && (
                    <span className="capitalize">via {event.meta.source}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
