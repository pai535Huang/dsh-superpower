# Acceptance Test: Superpowers auto-triggers on a clean DSH session

Upstream's new-harness acceptance test (see `.superpowers-src/docs/porting-to-a-new-harness.md`, Part 3, item 4):

> In a clean session, the user message "Let's make a react todo list"
> auto-triggers the `brainstorming` skill *before any code is written*.

**Result: PASS** — 2026-08-21.

## Environment

| Field | Value |
|---|---|
| Harness | DeepSeek Harness CLI `0.1.0-rc.8`, profile `headless` ("answer one task and exit") |
| Preset | `standard` (no superpowers-specific preset exists anymore) |
| Plugin | host plugin from this repo, installed into the profile (bundle patch mounts `dsh-superpower`) |
| Workspace | empty scratch directory (no repo, no existing code) |
| Model | `deepseek-v4-pro`, `reasoningEffort: max` |
| Prompt | exactly `Let's make a react todo list` |

## Transcript

### 1. Session-start bootstrap injection (observed in the session record)

The first request carried the bootstrap user message (injected once, as
designed), wrapped in `<EXTREMELY_IMPORTANT>` and ending with the DSH tool
mapping appended after the `using-superpowers` body:

```
<EXTREMELY_IMPORTANT>
You have superpowers.

Below is the full content of your 'using-superpowers' skill — your introduction
to using skills. For all other skills, use the `skill` tool:

<skill_content name="using-superpowers">
…
</skill_content>

Below is the DeepSeek Harness tool mapping for these skills
(using-superpowers/references/dsh-tools.md):

## Skill invocation
DSH addresses skills by bare kebab-case names through the `skill` tool. …
## Files and the sandbox
…
## Plan mode
…
</EXTREMELY_IMPORTANT>
```

The skill catalog was surfaced alongside it, with `brainstorming` routed by its
frontmatter description:

```
<available_skills>
- `brainstorming`: You MUST use this before any creative work - creating
  features, building components, adding functionality, or modifying behavior. …
```

### 2. The agent's turn

The agent invoked the brainstorming skill before doing anything else:

> Using the brainstorming skill to turn this idea into a design before any code.
> First, let me check the current project state.

…then classified the task and asked the first clarifying question instead of
writing code (this is the run's final assistant message, printed verbatim):

> The workspace is empty — no existing React app or todo flow to build on — so
> this is a **new project, which makes it architectural**: I'll ask a few
> clarifying questions, present a design, write a short spec, and get your
> approval before writing any code.
>
> First question:
>
> **What's this todo list for?** This shapes everything about the design.
>
> - **A) Learning/practice** — minimal, clean, classic todo: add, complete,
>   delete. No extras.
> - **B) Something you'll actually use** — persistence (localStorage), edit
>   items, filter by status, maybe due dates.
> - **C) A demo/showcase piece** — polished UI, animations, maybe
>   drag-and-drop reordering.
>
> Which is closest — or what's your own take?

### 3. No code was written

- The scratch workspace was **empty after the run** (zero files created).
- The only `write`/`edit` occurrences in the session record are tool *schema
  definitions* in the request payload, not tool calls.

## Evidence checks (grep against the raw session record)

| Check | Result |
|---|---|
| Bootstrap injected exactly once per session | `"You have superpowers"` appears once |
| DSH tool mapping injected with the bootstrap | full `dsh-tools.md` text present inside the `<EXTREMELY_IMPORTANT>` envelope |
| `skill` tool invoked by the agent | 5 `"name":"skill"` occurrences in the record |
| Brainstorming triggered before any action | agent message: "I must invoke the brainstorming skill first. Let me load the brainstorming skill", then "Using the brainstorming skill to turn this idea into a design before any code." |
| No file creation | scratch directory listing: empty |
