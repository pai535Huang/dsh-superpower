# Acceptance Test: Superpowers auto-triggers on a clean DSH session

> **For agentic workers:** this document is both the procedure and the record.
> Re-run the procedure after any behavior-affecting change; keep the record's
> evidence table up to date. A model run requires a configured DeepSeek client
> and spent tokens — it is the human-confirmable gate, not an automated check.

Upstream's new-harness acceptance test (see `.superpowers-src/docs/porting-to-a-new-harness.md`,
Part 3, item 4):

> In a clean session, the user message "Let's make a react todo list"
> auto-triggers the `brainstorming` skill *before any code is written*.

With the global skill provider, this must pass on an ordinary `standard` preset
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
| Harness | (fill: version, profile) |
| Preset | `standard` |
| Plugin | dsh-superpower @ (fill: commit) |
| Workspace | (fill: scratch directory) |
| Model | (fill: model + reasoningEffort) |

## Evidence checklist (grep against the raw session record)

| Check | Result |
|---|---|
| Bootstrap injected exactly once per session | (fill: `"You have superpowers"` occurrence count) |
| DSH tool mapping injected with the bootstrap | (fill: match / no match) |
| `skill` tool invoked before any file mutation | (fill: transcript lines) |
| Brainstorming triggered before any action | (fill: agent message) |
| No file creation | (fill: directory listing) |
