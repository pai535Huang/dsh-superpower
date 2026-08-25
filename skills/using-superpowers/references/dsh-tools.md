## Skill invocation

DSH addresses skills by bare kebab-case names through the `skill` tool.
The session catalog shows only each skill's `name` + `description`; route
by exact description match, and load a skill with the `skill` tool when
its description matches the task. Never read `SKILL.md` files with file
tools — the `skill` tool is the loading mechanism, and it resolves the
skill's resource base for you.

## Files and the sandbox

- Create, replace, and edit files with `write` and `edit`; inspect text
  files with `read` (line-numbered). Shell `cat` is not a substitute.
- Every session runs under a file sandbox policy announced in the system
  prompt (commonly `workspace-write`). A blocked file operation is
  reported as `[sandbox: file access denied ...]` — that is a policy
  denial, not a bug in the command; do not retry it another way.
- When a denial blocks work the plan genuinely needs, escalate in the
  same turn: retry the exact same command once with
  `sandbox_permissions` set to the narrowest wider mode that suffices,
  plus a one-sentence justification. The user approves or rejects that
  retry. A rejection is final for that command — stop and explain,
  never work around it.
- Skills that create git worktrees (`using-git-worktrees`, SDD step 0)
  write *outside* the session workspace (`git worktree add ../<branch>`),
  so expect a sandbox denial there and use the escalation path above.
- Plan documents (`docs/superpowers/plans/...`) and SDD workspaces
  (`.superpowers/sdd/...`) live inside the workspace — no escalation.

## Shell and jobs

- `bash` runs shell commands; non-zero exits are reported as
  `[exit code: N]` — investigate before moving on.
- Long-running work should use `run_in_background: true`, which returns
  a job id immediately. Track every job id you start; the runtime
  notifies you when a job finishes — do not busy-poll or sleep on one,
  keep working on independent steps instead.
- Read a job's output with `job_output` (set `wait: true` only when you
  are genuinely blocked on that job's result); stop one with `job_kill`
  once it stops mattering.

## Search

Use the `grep` tool for file contents and the `glob` tool for path
patterns — not shell `grep`/`find`.

## Web

Use `web_search` (1–4 queries per call) and cite the returned source
URLs as markdown links. URL fetching is disabled in the superpowers
preset, so rely on search results and snippets.

## Subagents (subagent-driven-development, dispatching-parallel-agents)

- `subagent` spawns a child with a fresh context (the SDD default for
  implementers and reviewers); `subagent_fork` seeds a child with this
  conversation (use it for follow-up analysis and reviews). Both run in
  the background by default and return a durable agent id immediately;
  when a background run settles, the runtime sends you a notice with
  its outcome — you are told when a child finishes, so never poll
  `list_agents` for completion.
- Fix rounds: message the same child with `send_message` — it starts
  the next turn on that child's existing conversation. Never dispatch a
  fresh implementer on the theory that a finished child cannot be
  messaged again.
- `interrupt_agent` stops only the child's current turn; agents it
  started keep running, and it stays available for follow-ups.
- Delegated children skip the superpowers bootstrap by design — give
  each one a complete, standalone task brief (SDD's
  `implementer-prompt.md`), because it sees nothing of this session.

## Workflows and Ralph

`workflow` is for large multi-agent orchestration the user explicitly
asks for; `ralph` is only for a Ralph loop / fresh-agent iteration the
user explicitly requests. For one or two delegations, plain `subagent`
calls are the right tool; for a long single objective in this session,
use the goal tools instead.

## Goals

For one long-running completion objective in the current session, use
`create_goal`; call `get_goal` before `update_goal` and copy its exact
`goal_id` and `revision`. Mark the goal complete only when the
objective is actually achieved.

## Todos

`todo_write` REPLACES the entire list on every call — resend the whole
list. Keep at least one item `in_progress` while work remains and mark
items complete the moment they finish.

## Asking the user and approvals

Skills make their human-partner checkpoints explicit — brainstorming's
clarifying questions, design approval and spec review gate;
writing-plans' execution-handoff choice; executing-plans' "raise
concerns before starting". On DSH those are real stopping points:
never answer your own question, never proceed past a gate.

- **Structured questions:** use `ask_user_question` whenever a question
  can be answered from options — brainstorming's "prefer multiple
  choice questions", writing-plans' "which approach?". One call is one
  question: split multi-topic questions into separate turns.
- **Open-ended questions:** end your turn with the question in plain
  text and wait. The user's next message answers it.
- **Approval gates:** after presenting a design in chat, or writing a
  spec/plan document, STOP and wait for an explicit yes — or change
  requests. In plan mode, submit the complete plan with
  `exit_plan_mode`; the user reviews and approves it or sends it back.
  Run brainstorming before entering plan mode.
- **Never self-approve.** "I'll assume X and proceed" skips the gate. A
  decision the user might want to make differently is a question to
  ask, not a call to make.
- **No Visual Companion here.** Brainstorming's Visual Companion is a
  browser tool that is not available on this harness; never offer to
  open one, and never start a companion server — treat visual
  questions as plain text questions.

## Plan mode

In plan mode, explore with non-mutating reads and searches, then submit
the complete plan with `exit_plan_mode` as the only and final tool call
of that response. Before entering plan mode, run `brainstorming` first
if you have not already. See Asking the user and approvals above for
the gates that apply throughout the workflow.
