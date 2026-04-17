"use client";

import { STATUS_CONFIG, type InquiryStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: InquiryStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.bgColor, config.color, className)}>
      {config.label}
    </span>
  );
}
