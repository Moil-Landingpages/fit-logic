/**
 * Deterministic check of generated copy against the pasted source material.
 *
 * The model's own "unverifiedClaims" list depends on it noticing its own
 * paraphrases, and it does not (a recipe's "raw pistachios" came back as
 * "toasted pistachios" with nothing flagged). This does not trust the model:
 * it scans the output for risky words that do not appear in the source.
 *
 * It is a net, not a proof. It only knows the word classes below, so it will
 * miss other drift; the human review step is still required.
 */

// Words that change what a food/ingredient/process actually is.
const PREP_WORDS = [
  "raw", "toasted", "roasted", "fresh", "frozen", "dried", "dry-roasted", "salted", "unsalted",
  "sweetened", "unsweetened", "organic", "ripe", "chopped", "minced", "diced", "sliced",
  "crushed", "ground", "whole", "boiled", "steamed", "fried", "baked", "grilled", "blanched",
  "soaked", "sprouted", "fermented", "melted", "softened", "chilled", "warm", "hot", "cold",
  "gluten-free", "dairy-free", "vegan", "vegetarian", "sugar-free", "low-carb", "keto", "paleo",
];

// Comparative/health framing the source did not make.
const CLAIM_WORDS = [
  "lighter", "healthier", "healthy", "nutritious", "low-calorie", "guilt-free", "clean",
  "superfood", "detox", "detoxify", "boost", "boosts", "improves", "supports", "promotes",
  "cure", "cures", "treats", "prevents", "reduces inflammation", "anti-inflammatory",
  "balances hormones", "alternative", "better for you", "proven", "clinically",
];

export interface SourceCheckResult {
  /** Human-readable flags for the Accuracy panel. */
  flags: string[];
}

const stripHtml = (s: string) =>
  s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const normalise = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

function containsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s|es|ed)?(?=$|[^a-z0-9])`, "i").test(haystack);
}

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,/]\d+)?|[¼½¾⅓⅔⅛]/g)) out.add(m[0]);
  return out;
}

/**
 * @param source  the pasted source material
 * @param outputHtmlOrText  the generated body (HTML is stripped)
 */
export function checkAgainstSource(source: string, outputHtmlOrText: string): SourceCheckResult {
  const src = normalise(stripHtml(source));
  const out = normalise(stripHtml(outputHtmlOrText));
  const flags: string[] = [];
  if (!src.trim() || !out.trim()) return { flags };

  for (const w of PREP_WORDS) {
    if (containsWord(out, w) && !containsWord(src, w)) {
      flags.push(`Wording changed: "${w}" appears in the draft but not in your source. Check it matches the original.`);
    }
  }
  for (const w of CLAIM_WORDS) {
    if (containsWord(out, w) && !containsWord(src, w)) {
      flags.push(`Claim not in source: "${w}". Remove it unless your source says so.`);
    }
  }

  const srcNums = numbersIn(src);
  const missing = [...numbersIn(out)].filter((n) => !srcNums.has(n));
  if (missing.length) {
    flags.push(`Numbers not found in your source: ${missing.slice(0, 8).join(", ")}. Check quantities, times and statistics.`);
  }
  return { flags };
}
