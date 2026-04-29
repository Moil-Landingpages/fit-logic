"use client";

import { Clock, Calendar, Shield, MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";

export interface ScheduleConfig {
  auto_schedule: boolean;
  max_sends_per_day: number;
  // These are now hardcoded but kept for backwards compatibility
  business_hours_start: number;
  business_hours_end: number;
  business_days: string[];
}

interface CampaignScheduleSettingsProps {
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  recipientCount: number;
}

export function CampaignScheduleSettings({ config, onChange, recipientCount }: CampaignScheduleSettingsProps) {
  const estimatedDays = config.max_sends_per_day > 0 ? Math.ceil(recipientCount / config.max_sends_per_day) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />Daily Auto-Send
          </h3>
          <p className="text-xs text-muted-foreground">Automatically send emails at 8:00 AM Texas time</p>
        </div>
        <Switch
          checked={config.auto_schedule}
          onCheckedChange={v => onChange({ ...config, auto_schedule: v })}
        />
      </div>

      {config.auto_schedule && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 space-y-3">
            {/* Send Time Info */}
            <div className="flex items-start gap-2 p-2 rounded bg-primary/5 border border-primary/10">
              <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Emails send daily at 8:00 AM Texas time</p>
                <p className="text-[10px] text-muted-foreground">Monday through Friday only</p>
              </div>
            </div>

            {/* Rate Limiting */}
            <div>
              <Label className="text-xs">Max Emails Per Day</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={config.max_sends_per_day}
                  onChange={e => onChange({ ...config, max_sends_per_day: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })}
                  className="h-8 text-xs w-20"
                />
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />Max 50/day to maintain deliverability
                </span>
              </div>
            </div>

            {recipientCount > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Calendar className="h-3 w-3 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {recipientCount} recipients → ~{estimatedDays} business day{estimatedDays !== 1 ? "s" : ""} to complete
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
