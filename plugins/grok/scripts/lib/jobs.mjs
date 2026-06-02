import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  renameSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { processAlive, terminateProcess } from "./process.mjs";

// Background-job state lives outside the repo, namespaced per working directory
// so concurrent projects never collide. Honor GROK_CC_STATE_DIR for tests.
function stateRoot() {
  return process.env.GROK_CC_STATE_DIR?.trim() || path.join(homedir(), ".grok", "cc-plugin", "jobs");
}

function repoKey(cwd) {
  return createHash("sha1").update(path.resolve(cwd)).digest("hex").slice(0, 16);
}

function repoDir(cwd) {
  const dir = path.join(stateRoot(), repoKey(cwd));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function jobPath(cwd, jobId) {
  return path.join(repoDir(cwd), `${jobId}.json`);
}

export function newJobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logPathFor(cwd, jobId) {
  return path.join(repoDir(cwd), `${jobId}.log`);
}

export function writeJob(cwd, job) {
  const file = jobPath(cwd, job.id);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(job, null, 2));
  renameSync(tmp, file);
  return file;
}

/**
 * Read the latest job record and merge a patch into it, then write atomically.
 * Used so the parent (setting pid) and the detached worker (setting status /
 * sessionId) never clobber each other with a stale snapshot.
 */
export function updateJob(cwd, jobId, patch) {
  const current = readJob(cwd, jobId) ?? { id: jobId };
  const merged = { ...current, ...patch };
  writeJob(cwd, merged);
  return merged;
}

export function readJob(cwd, jobId) {
  const file = jobPath(cwd, jobId);
  if (!existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Reconcile a job's recorded status with reality: a job marked "running"
 * whose pid has died is treated as finished (its log holds the result).
 */
export function reconcileJob(cwd, job) {
  if (!job) {
    return job;
  }
  if (job.status === "running" && job.pid && !processAlive(job.pid)) {
    job.status = "finished";
    job.finishedAt = job.finishedAt ?? new Date().toISOString();
    writeJob(cwd, job);
  }
  return job;
}

export function listJobs(cwd) {
  const dir = repoDir(cwd);
  let entries = [];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const jobs = [];
  for (const entry of entries) {
    try {
      const job = JSON.parse(readFileSync(path.join(dir, entry), "utf8"));
      jobs.push(reconcileJob(cwd, job));
    } catch {
      /* skip corrupt entries */
    }
  }
  return jobs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export function latestJob(cwd, predicate = () => true) {
  return listJobs(cwd).find(predicate) ?? null;
}

export function latestRunningJob(cwd) {
  return latestJob(cwd, (job) => job.status === "running");
}

/** Read the captured streaming-json log and pull out the final result. */
export function readJobOutput(cwd, jobId) {
  const logPath = logPathFor(cwd, jobId);
  if (!existsSync(logPath)) {
    return { text: "", sessionId: null, stopReason: null, raw: "" };
  }
  const raw = readFileSync(logPath, "utf8");
  const textChunks = [];
  let sessionId = null;
  let stopReason = null;
  let single = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type === "text" && event.data) {
      textChunks.push(event.data);
    } else if (event.type === "end") {
      sessionId = event.sessionId ?? sessionId;
      stopReason = event.stopReason ?? stopReason;
    } else if (event.text !== undefined) {
      // Non-streaming single JSON object fallback.
      single = event;
    }
  }

  if (single) {
    return {
      text: single.text ?? "",
      sessionId: single.sessionId ?? sessionId,
      stopReason: single.stopReason ?? stopReason,
      raw
    };
  }

  return { text: textChunks.join(""), sessionId, stopReason, raw };
}

export function cancelJob(cwd, jobId) {
  const job = readJob(cwd, jobId);
  if (!job) {
    return { ok: false, detail: `No job found with id ${jobId}.` };
  }
  if (job.status !== "running") {
    return { ok: false, detail: `Job ${jobId} is not running (status: ${job.status}).` };
  }
  const killed = terminateProcess(job.pid);
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  writeJob(cwd, job);
  return {
    ok: true,
    detail: killed ? `Cancelled job ${jobId} (pid ${job.pid}).` : `Marked job ${jobId} cancelled; process already exited.`
  };
}
