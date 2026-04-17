"use client";

import { CATEGORY_CONFIG, type InquiryCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryBadge({ category, className }: { category: InquiryCategory; className?: string }) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.bgColor, config.color, className)}>
      {config.label}
    </span>
  );
}
