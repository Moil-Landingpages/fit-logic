#!/usr/bin/env node
/**
 * Test runner for the newsletter pipeline.
 *
 * The project has no test framework, so this stays dependency-light: compile
 * the pure modules with the TypeScript already in the project, rewrite the `@/`
 * path alias for plain Node resolution, then run each suite in a child process.
 *
 *   npm run test:newsletter
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const build = join(here, ".build");

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

console.log("compiling…");
// Source list and compiler options live in tests/tsconfig.build.json.
execFileSync("npx", ["tsc", "-p", join(here, "tsconfig.build.json")],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] });

// `@/x` -> a relative require, so the compiled output runs under plain Node.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
for (const file of walk(build).filter((f) => f.endsWith(".js"))) {
  const depth = relative(build, file).split("/").length - 1;
  const prefix = depth === 0 ? "./" : "../".repeat(depth);
  const src = readFileSync(file, "utf8");
  const out = src.replace(/require\("@\/([^"]+)"\)/g, (_m, p) => `require("${prefix}${p}")`);
  if (out !== src) writeFileSync(file, out);
}

const suites = readdirSync(join(here, "suites")).filter((f) => f.endsWith(".test.cjs")).sort();
let failed = 0;
for (const suite of suites) {
  console.log(`\n──────── ${suite} ────────`);
  try {
    execFileSync("node", [join(here, "suites", suite)], { cwd: here, stdio: "inherit" });
  } catch {
    failed++;
  }
}
console.log(failed ? `\n${failed} suite(s) FAILED` : `\nAll ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
