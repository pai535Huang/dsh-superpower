# Acceptance Test: Superpowers auto-triggers on a clean DSH session

> **For agentic workers:** this document is both the procedure and the record.
> Re-run the procedure after any behavior-affecting change; keep the record's
> evidence table up to date. A model run requires a configured DeepSeek client
> and spent tokens — it is the human-confirmable gate, not an automated check.

Upstream's new-harness acceptance test (Part 3, item 4 of
[obra/superpowers](https://github.com/obra/superpowers/)' porting guide):

> In a clean session, the user message "Let's make a react todo list"
> auto-triggers the `brainstorming` skill *before any code is written*.

With the host skill provider, this must pass on an ordinary `standard` preset
session — no superpowers-specific preset exists anymore.

## Procedure

1. Install the plugin into the target profile:

   ```bash
   dsh plugin --profile <profile> add <repository-or-local-path>
   ```

   (For a local checkout, register it as a profile bundle and add the patch
   row; see the bundle-patch docs. The host row id is `dsh-superpower`.)

2. Start the profile, create a **new session with the `standard` preset**
   selected (or the profile default, if it is `standard`).

3. Send exactly: `Let's make a react todo list`

4. Verify, from the session record:
   - The first request carries the bootstrap user message
     (`<EXTREMELY_IMPORTANT>` … `You have superpowers.`) — injected ONCE.
   - The DSH tool mapping (`dsh-tools.md` text) is inside the same envelope.
   - The agent invokes the `skill` tool to load `brainstorming` **before** any
     write/create action.
   - The agent asks a clarifying question instead of writing code.
   - The workspace has zero files after the run.

## Environment (record per run)

| Field | Value |
|---|---|
| Harness | DeepSeek Harness CLI `0.1.1-rc.2`, profile `headless` (one-shot under test: "answer one task and exit") |
| Preset | none — headless composes `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless` directly (host `tool-skill` + `skill-filesystem` active, so the session has the same skill surface as a `standard` preset session) |
| Plugin | dsh-superpower @ `4b09a6d`, linked into the profile bundle list; DSH_HOME isolated to the workspace (read-only `~/.dsh` workaround) |
| Workspace | empty scratch directory under the isolated DSH_HOME (`.dsh-acc-home/ws`) |
| Model | `deepseek-official` / `deepseek-v4-flash` (dump-config default) |

## Evidence checklist (grep against the raw session record)

| Check | Result |
|---|---|
| Bootstrap injected exactly once per session | **PASS** — `"You have superpowers"` occurs once (user/message seq=10). |
| DSH tool mapping injected with the bootstrap | **PASS** — `DeepSeek Harness tool mapping` text is inside the `<EXTREMELY_IMPORTANT>` envelope at seq=10. |
| Skill catalog present alongside | **PASS** — `<system-reminder>` available_skills at seq=9 (with `brainstorming` description routed by frontmatter). |
| `skill` tool invoked before any file mutation | **PASS** — tool/call seq=82: `skill { "name": "brainstorming" }`; next actions are read-only (seq=482 `bash ls -la && git status`, seq=484 `glob "**/*"`); zero write/edit tool calls. |
| Brainstorming triggered before any action | **PASS** — the agent loaded `brainstorming` first, then classified the task and asked a clarifying question instead of writing code. |
| No file creation | **PASS** — workspace listing: empty (`ls -la` → only `.`/`..`; `glob "**/*"` → "No files found"). |

## Recorded transcript (one-shot run 2026-08-26, commit 4b09a6d)

The session record (`session-26807a3c-…/session.jsonl.zstd`) shows, in order:

```
seq=7   user/message: "Let's make a react todo list"
seq=9   user/message: <system-reminder> skill catalog (available_skills … brainstorming …)
seq=10  user/message: <EXTREMELY_IMPORTANT> … You have superpowers. …
        (bootstrap: using-superpowers full content + DSH tool mapping)
seq=82  tool/call:    skill { "name": "brainstorming" }
seq=83  tool/result:  <skill_content name="brainstorming"> … (full body from the registry)
seq=482 tool/call:    bash { "command": "ls -la && git status …" }   (read-only recon)
seq=484 tool/call:    glob { "pattern": "**/*" }                     ("No files found")
final   assistant: classification = architectural; first clarifying question
        ("What's the context here — learning exercise, portfolio, or daily tool?")
        — no code, no write/edit.
```

The final assistant message (printed to stdout by the headless runner) then asks the
clarifying question and stops, exactly like the original preset-shape acceptance run.
