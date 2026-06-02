---
name: grok-runtime
description: Internal helper contract for calling the grok-companion runtime from Claude Code. Reference when invoking the Grok companion script directly.
---

# Grok companion runtime

The Grok plugin wraps the local `grok` CLI's **headless mode** (`grok -p "<prompt>" --output-format json`). Grok manages its own session store under `~/.grok/sessions`, so the plugin does not run a separate server or broker.

Always invoke through the companion script so job tracking, prompt shaping, and tool filtering stay consistent:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" <subcommand> [flags] [text]
```

## Subcommands

| Subcommand | Purpose | Tool surface |
| --- | --- | --- |
| `setup [--json]` | Check install + login (no API call) | none |
| `review [--base <ref>] [--background] [--model <m>] [focus]` | Read-only code review of a git diff | `read_file, grep, list_dir, web_search, web_fetch` |
| `task <text> [--background] [--resume-last\|--fresh] [--read-only] [--model <m>] [--effort <low\|medium\|high>]` | Delegate work; write-capable by default | full (or read-only with `--read-only`) |
| `search <query> [--background] [--model <m>]` | Live X/web search | `web_search, web_fetch, read_file, grep, list_dir` |
| `status [--job <id>]` | List or show jobs | n/a |
| `result [--job <id>]` | Final output + Grok session id | n/a |
| `cancel [--job <id>]` | Cancel a running job | n/a |

## Key facts

- Add `--json` to any command for machine-readable output.
- The JSON contract from `grok -p` is `{ text, stopReason, sessionId, requestId, thought }`.
- Sessions: `-s <id>` creates-or-resumes, `-r <id>` resumes (errors if missing), `-c` continues most recent in cwd. The companion handles this via `--resume-last`.
- Background jobs write streaming-json to a per-repo log under `~/.grok/cc-plugin/jobs/`; `status`/`result` read from there.
- Models available locally: run `grok models`. Default is `grok-build`.
- `GROK_BIN` overrides the binary path; `GROK_CC_STATE_DIR` overrides the job state directory (used in tests).
- Always return the companion's stdout verbatim to the user. Do not paraphrase.
