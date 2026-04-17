"use client";

import { Clock, Calendar, Shield } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface ScheduleConfig {
  auto_schedule: boolean;
  max_sends_per_day: number;
  business_hours_start: number;
  business_hours_end: number;
  business_days: string[];
}

interface CampaignScheduleSettingsProps {
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  recipientCount: number;
}

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CampaignScheduleSettings({ config, onChange, recipientCount }: CampaignScheduleSettingsProps) {
  const estimatedDays = config.max_sends_per_day > 0 ? Math.ceil(recipientCount / config.max_sends_per_day) : 0;

  const toggleDay = (day: string) => {
    const next = config.business_days.includes(day)
      ? config.business_days.filter(d => d !== day)
      : [...config.business_days, day];
    onChange({ ...config, business_days: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />Auto-Schedule
          </h3>
          <p className="text-xs text-muted-foreground">Automatically send emails within safe limits</p>
        </div>
        <Switch checked={config.auto_schedule} onCheckedChange={v => onChange({ ...config, auto_schedule: v })} />
      </div>

      {config.auto_schedule && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Max Emails / Day</Label>
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
                    <Shield className="h-3 w-3" />Max 50 to avoid spam
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Business Hours</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Select value={String(config.business_hours_start)} onValueChange={v => onChange({ ...config, business_hours_start: parseInt(v) })}>
                    <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 14 }, (_, i) => i + 6).map(h => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Select value={String(config.business_hours_end)} onValueChange={v => onChange({ ...config, business_hours_end: parseInt(v) })}>
                    <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 14 }, (_, i) => i + 10).map(h => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Send Days</Label>
              <div className="flex gap-1.5 mt-1">
                {ALL_DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                      config.business_days.includes(day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {day}
                  </button>
                ))}
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
