---
description: Search X (Twitter) and the web in real time with Grok, then summarize with sources
argument-hint: "[--background] [--model <model>] <what to search for on X or the web>"
allowed-tools: Bash(node:*)
---

Grok has native, real-time access to X (x.com) and the web. This is its specialty.
Use this command to answer questions that need current, social, or breaking information.

Raw user request:
$ARGUMENTS

Run the search through the Grok companion:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" search $ARGUMENTS
```

Rules:

- `--background` runs the search detached; report the job id and that the user can check `/grok:status` and `/grok:result`. Otherwise run in the foreground and return Grok's answer.
- `--model` is a runtime control; keep it on the command but do not treat it as part of the query text.
- Return the companion's stdout verbatim: it already includes the answer, a Sources list, and a session id for follow-ups. Do not paraphrase or add commentary.
- If the companion reports Grok is missing or not logged in, tell the user to run `/grok:setup`.
