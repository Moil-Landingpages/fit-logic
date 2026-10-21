/**
 * Turn a raw Supabase/PostgREST error into something staff can act on.
 *
 * "Could not find the 'design' column of 'email_templates' in the schema
 * cache" (or Postgres "column ... does not exist") means a database migration
 * has not been applied yet. That is a setup step for the developer, not
 * something wrong with what the user typed, and it should say so.
 */
export function describeSaveError(message: string | null | undefined): string {
  const raw = (message ?? "").trim() || "Unknown error";
  const missing =
    /could not find the '([^']+)' column of '([^']+)'/i.exec(raw) ??
    /column "?([\w.]+)"? of relation "?(\w+)"? does not exist/i.exec(raw);
  if (missing) {
    return (
      `${raw}\n\nThe database is missing "${missing[1]}" on "${missing[2]}". ` +
      `A database migration has not been applied yet — ask your developer to run the latest migrations ` +
      `(supabase/migrations). Your changes were not lost from the screen; try again after it is applied.`
    );
  }
  if (/relation "?[\w.]+"? does not exist|Could not find the table/i.test(raw)) {
    return `${raw}\n\nA required database table is missing — a migration has not been applied yet. Ask your developer to run the latest migrations.`;
  }
  return raw;
}
