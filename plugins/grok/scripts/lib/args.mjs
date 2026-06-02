/**
 * Minimal argv parser for the grok companion subcommands.
 *
 * Recognizes a fixed set of value flags (--model X, --effort X, ...) and
 * boolean flags (--json, --background, --wait, --resume, --fresh, ...).
 * Everything else is collected as positional "rest" text — the natural
 * language task/prompt.
 */
const VALUE_FLAGS = new Set([
  "--model",
  "--effort",
  "--base",
  "--session",
  "--job",
  "--max-turns",
  "--cwd",
  "--payload"
]);
const BOOL_FLAGS = new Set([
  "--json",
  "--background",
  "--wait",
  "--resume",
  "--resume-last",
  "--fresh",
  "--write",
  "--read-only",
  "--enable-review-gate",
  "--disable-review-gate"
]);

export function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      flags[arg.replace(/^--/, "")] = argv[++i];
    } else if (BOOL_FLAGS.has(arg)) {
      flags[arg.replace(/^--/, "")] = true;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest: rest.join(" ").trim() };
}

/** Map the user-facing effort word to grok's --effort levels. */
export function normalizeEffort(value) {
  if (!value) {
    return null;
  }
  const v = String(value).toLowerCase();
  if (["low", "medium", "high"].includes(v)) {
    return v;
  }
  if (["none", "minimal"].includes(v)) {
    return "low";
  }
  if (["xhigh", "max"].includes(v)) {
    return "high";
  }
  return null;
}
