import fitlogicKnowledge from "@/lib/fitlogic-knowledge.json";

export type FitlogicKnowledgeCategory =
  | "overview"
  | "services"
  | "pricing"
  | "audience"
  | "market"
  | "competition"
  | "marketing"
  | "operations"
  | "strategy"
  | "financials";

export interface FitlogicKnowledgeChunk {
  id: string;
  documentName: string;
  sectionTitle: string;
  category: FitlogicKnowledgeCategory;
  tags: string[];
  content: string;
  tokenEstimate: number | null;
  createdAt: string;
}

interface FitlogicKnowledgeDataset {
  brandName: string;
  source: string;
  chunks: FitlogicKnowledgeChunk[];
}

const dataset = fitlogicKnowledge as FitlogicKnowledgeDataset;

export const FITLOGIC_KNOWLEDGE = dataset;

const CORE_SECTION_TITLES = [
  "Executive Summary",
  "Mission & Vision",
  "Services Offered",
  "Target Customers",
] as const;

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "what",
  "with",
  "you",
  "your",
]);

const FAQ_CATEGORY_HINTS: Record<string, FitlogicKnowledgeCategory[]> = {
  Appointment_Scheduling: ["operations", "overview", "services"],
  Prescription_Lab_Requests: ["services", "operations", "overview"],
  Health_Questions: ["services", "overview", "audience"],
  Billing_Insurance: ["pricing", "overview", "competition"],
  Urgent_Red_Flags: ["operations", "services", "overview"],
  General_Info: ["overview", "services", "operations", "audience"],
};

const CAMPAIGN_BASE_CATEGORIES: FitlogicKnowledgeCategory[] = [
  "overview",
  "services",
  "audience",
  "marketing",
];

const KEYWORD_CATEGORY_HINTS: Array<{ pattern: RegExp; categories: FitlogicKnowledgeCategory[] }> = [
  { pattern: /\b(retreat|event|community|workshop)\b/i, categories: ["services", "marketing", "strategy"] },
  { pattern: /\b(hormone|bhrt|menopause|andropause)\b/i, categories: ["services", "audience"] },
  { pattern: /\b(gut|digestive|wellness|fitness|supplement)\b/i, categories: ["services", "audience"] },
  { pattern: /\b(price|pricing|cost|membership|subscription|plan)\b/i, categories: ["pricing", "financials"] },
  { pattern: /\b(segment|persona|audience|customer|lead)\b/i, categories: ["audience", "marketing"] },
  { pattern: /\b(launch|campaign|email|promotion|offer|social|seo|ads)\b/i, categories: ["marketing", "strategy"] },
  { pattern: /\b(team|provider|capacity|operations|hours|location)\b/i, categories: ["operations", "overview"] },
  { pattern: /\b(competitor|differentiate|why fit logic|why choose)\b/i, categories: ["competition", "overview"] },
];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function tokenize(text: string): string[] {
  return unique(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function getPreferredCategories(
  query: string,
  intent: "campaign" | "faq",
  category?: string,
): FitlogicKnowledgeCategory[] {
  const categories = intent === "faq" ? [...(FAQ_CATEGORY_HINTS[category ?? ""] ?? ["overview", "services", "operations"])] : [...CAMPAIGN_BASE_CATEGORIES];

  for (const hint of KEYWORD_CATEGORY_HINTS) {
    if (hint.pattern.test(query)) {
      categories.push(...hint.categories);
    }
  }

  return unique(categories);
}

function scoreChunk(
  chunk: FitlogicKnowledgeChunk,
  terms: string[],
  preferredCategories: FitlogicKnowledgeCategory[],
): number {
  const section = chunk.sectionTitle.toLowerCase();
  const content = chunk.content.toLowerCase();
  const tags = chunk.tags.map((tag) => tag.toLowerCase());
  let score = preferredCategories.includes(chunk.category) ? 6 : 0;

  if (CORE_SECTION_TITLES.includes(chunk.sectionTitle as (typeof CORE_SECTION_TITLES)[number])) {
    score += 3;
  }

  for (const term of terms) {
    if (section.includes(term)) score += 6;
    if (content.includes(term)) score += 2;
    if (tags.some((tag) => tag.includes(term) || term.includes(tag))) score += 4;
  }

  return score;
}

export function selectFitlogicKnowledge(
  query: string,
  options: {
    intent?: "campaign" | "faq";
    category?: string;
    limit?: number;
    includeCore?: boolean;
  } = {},
): FitlogicKnowledgeChunk[] {
  const { intent = "campaign", category, limit = 15, includeCore = true } = options;
  const preferredCategories = getPreferredCategories(query, intent, category);
  const terms = tokenize(query);
  const selected: FitlogicKnowledgeChunk[] = [];

  if (includeCore) {
    for (const sectionTitle of CORE_SECTION_TITLES) {
      const chunk = dataset.chunks.find((item) => item.sectionTitle === sectionTitle);
      if (chunk) selected.push(chunk);
    }
  }

  const scored = dataset.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms, preferredCategories) }))
    .sort((a, b) => b.score - a.score || a.chunk.sectionTitle.localeCompare(b.chunk.sectionTitle));

  for (const { chunk } of scored) {
    if (selected.some((item) => item.id === chunk.id)) continue;
    selected.push(chunk);
    if (selected.length >= limit) break;
  }

  return selected.slice(0, limit);
}

export function formatFitlogicKnowledgeForPrompt(
  chunks: FitlogicKnowledgeChunk[],
  heading = "Fit Logic knowledge context",
): string {
  return [
    `${heading}:`,
    ...chunks.map(
      (chunk, index) =>
        `${index + 1}. ${chunk.sectionTitle} [${chunk.category}] | tags: ${chunk.tags.join(", ")}\n${chunk.content}`,
    ),
  ].join("\n");
}

export function buildFitlogicKnowledgeContext(
  query: string,
  options: {
    intent?: "campaign" | "faq";
    category?: string;
    limit?: number;
    includeCore?: boolean;
    heading?: string;
  } = {},
): string {
  const { heading, ...selectionOptions } = options;
  return formatFitlogicKnowledgeForPrompt(
    selectFitlogicKnowledge(query, selectionOptions),
    heading,
  );
}
