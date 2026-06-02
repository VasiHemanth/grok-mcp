import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { appendFileSync } from "node:fs";

import { parseArgs, normalizeEffort } from "../plugins/grok/scripts/lib/args.mjs";
import { parseJsonResult } from "../plugins/grok/scripts/lib/grok.mjs";

// jobs.mjs reads GROK_CC_STATE_DIR at call time, so set it before importing.
process.env.GROK_CC_STATE_DIR = mkdtempSync(path.join(tmpdir(), "grok-cc-jobs-"));
const jobs = await import("../plugins/grok/scripts/lib/jobs.mjs");

test("parseArgs splits value flags, bool flags, and positional text", () => {
  const { flags, rest } = parseArgs(["--model", "grok-build", "--background", "fix", "the", "bug"]);
  assert.equal(flags.model, "grok-build");
  assert.equal(flags.background, true);
  assert.equal(rest, "fix the bug");
});

test("parseArgs keeps base64 payload intact as a value flag", () => {
  const payload = Buffer.from(JSON.stringify({ a: 1 })).toString("base64");
  const { flags } = parseArgs(["__run", "--job", "job-1", "--payload", payload]);
  assert.equal(flags.job, "job-1");
  assert.equal(flags.payload, payload);
});

test("normalizeEffort maps friendly words to grok levels", () => {
  assert.equal(normalizeEffort("medium"), "medium");
  assert.equal(normalizeEffort("minimal"), "low");
  assert.equal(normalizeEffort("xhigh"), "high");
  assert.equal(normalizeEffort("bogus"), null);
  assert.equal(normalizeEffort(undefined), null);
});

test("parseJsonResult tolerates leading log noise", () => {
  const raw = 'some warning line\n{"text":"hi","sessionId":"s1","stopReason":"EndTurn"}';
  const parsed = parseJsonResult(raw);
  assert.equal(parsed.text, "hi");
  assert.equal(parsed.sessionId, "s1");
});

test("parseJsonResult returns null on garbage", () => {
  assert.equal(parseJsonResult(""), null);
  assert.equal(parseJsonResult("not json at all"), null);
});

test("job write/read roundtrip and listing are per-cwd", () => {
  const cwd = "/tmp/project-a";
  const id = jobs.newJobId();
  jobs.writeJob(cwd, { id, kind: "task", prompt: "p", status: "finished", startedAt: new Date().toISOString() });
  const read = jobs.readJob(cwd, id);
  assert.equal(read.kind, "task");
  assert.ok(jobs.listJobs(cwd).some((j) => j.id === id));
  // A different cwd must not see it.
  assert.equal(jobs.listJobs("/tmp/project-b").length, 0);
});

test("updateJob merges without clobbering existing fields", () => {
  const cwd = "/tmp/project-merge";
  const id = jobs.newJobId();
  jobs.writeJob(cwd, { id, status: "running", sessionId: null, pid: 999 });
  jobs.updateJob(cwd, id, { status: "finished", sessionId: "sess" });
  const merged = jobs.readJob(cwd, id);
  assert.equal(merged.status, "finished");
  assert.equal(merged.sessionId, "sess");
  assert.equal(merged.pid, 999); // preserved
});

test("readJobOutput reconstructs text from streaming-json log", () => {
  const cwd = "/tmp/project-log";
  const id = jobs.newJobId();
  appendFileSync(
    jobs.logPathFor(cwd, id),
    `${JSON.stringify({ type: "text", data: "Hello " })}\n${JSON.stringify({ type: "text", data: "world" })}\n${JSON.stringify({ type: "end", sessionId: "s9", stopReason: "EndTurn" })}\n`
  );
  const out = jobs.readJobOutput(cwd, id);
  assert.equal(out.text, "Hello world");
  assert.equal(out.sessionId, "s9");
});
