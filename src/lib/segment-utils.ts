import type { SegmentRule } from "@/lib/campaign-data";

export type SegmentMemberRow = {
  id: string;
} & Record<string, unknown>;

export function sanitizeSegmentRules(rules?: SegmentRule[] | null): SegmentRule[] {
  if (!Array.isArray(rules)) return [];
  return rules.filter((rule) => typeof rule?.value === "string" && rule.value.trim().length > 0);
}

function resolveRelativeDate(value: string): Date | null {
  const match = value.match(/^(\d+)_(days|months|years?)_ago$/);
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const date = new Date();

  if (unit.startsWith("day")) date.setDate(date.getDate() - amount);
  else if (unit.startsWith("month")) date.setMonth(date.getMonth() - amount);
  else date.setFullYear(date.getFullYear() - amount);

  return date;
}

export function evaluateSegmentRule(record: Record<string, unknown>, rule: SegmentRule): boolean {
  const raw = record[rule.field];
  const value = String(raw ?? "").toLowerCase();
  const ruleValue = rule.value.toLowerCase();

  switch (rule.operator) {
    case "is":
      return value === ruleValue;
    case "is_not":
      return value !== ruleValue;
    case "contains":
      if (Array.isArray(raw)) return raw.some((item) => String(item).toLowerCase().includes(ruleValue));
      return value.includes(ruleValue);
    case "greater_than":
      return Number.parseFloat(value) > Number.parseFloat(ruleValue);
    case "less_than":
      return Number.parseFloat(value) < Number.parseFloat(ruleValue);
    case "before": {
      if (!raw) return false;
      const comparison = resolveRelativeDate(ruleValue) ?? new Date(ruleValue);
      return new Date(String(raw)) < comparison;
    }
    case "after": {
      if (!raw) return false;
      const comparison = resolveRelativeDate(ruleValue) ?? new Date(ruleValue);
      return new Date(String(raw)) > comparison;
    }
    default:
      return true;
  }
}

export function matchesSegmentRules(record: Record<string, unknown>, rules?: SegmentRule[] | null): boolean {
  const activeRules = sanitizeSegmentRules(rules);
  if (activeRules.length === 0) return true;
  return activeRules.every((rule) => evaluateSegmentRule(record, rule));
}

export function resolveSegmentMembers<T extends SegmentMemberRow>(
  records: T[],
  options: {
    rules?: SegmentRule[] | null;
    manualContactIds?: string[] | null;
    fallbackToAllWhenEmpty?: boolean;
  } = {},
): T[] {
  const {
    rules,
    manualContactIds = [],
    fallbackToAllWhenEmpty = true,
  } = options;

  const activeRules = sanitizeSegmentRules(rules);
  const manualIds = new Set((manualContactIds ?? []).filter(Boolean));

  if (activeRules.length === 0 && manualIds.size === 0) {
    return fallbackToAllWhenEmpty ? records : [];
  }

  const matches = new Map<string, T>();

  if (activeRules.length > 0) {
    for (const record of records) {
      if (matchesSegmentRules(record, activeRules)) {
        matches.set(record.id, record);
      }
    }
  }

  if (manualIds.size > 0) {
    for (const record of records) {
      if (manualIds.has(record.id)) {
        matches.set(record.id, record);
      }
    }
  }

  return Array.from(matches.values());
}
