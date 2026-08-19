/**
 * superpowers-bootstrap — reproduce obra/superpowers' SessionStart hook for DSH.
 *
 * Upstream injects the full `using-superpowers` skill body at session start
 * (and again after compaction), wrapped in an <EXTREMELY_IMPORTANT> envelope:
 *
 *   <EXTREMELY_IMPORTANT>
 *   You have superpowers.
 *   Below is the full content of your 'superpowers:using-superpowers' skill …
 *   For all other skills, use the 'Skill' tool:
 *   <using-superpowers body>
 *   </EXTREMELY_IMPORTANT>
 *
 * That bootstrap is what makes the rest of the library auto-trigger: it tells
 * the model to invoke a relevant/requested skill BEFORE any response or action,
 * and to treat an applicable skill as mandatory ("if there is even a 1% chance
 * a skill applies, invoke it"). This plugin does the same, with the only
 * adaptation being DSH's loader — the `skill` tool and bare skill names.
 *
 * The body is loaded from the skill registry at session start (not duplicated
 * here), so the injected bootstrap always matches the bundled
 * `using-superpowers/SKILL.md`, and it is rendered with the canonical
 * <skill_content> block so the model treats it as already-invoked rather than
 * re-loading it through the `skill` tool.
 *
 * Subagents are skipped (delegationDepth > 0): a dispatched worker should just
 * do its task. The injected body also carries upstream's <SUBAGENT-STOP> as a
 * backstop.
 */
import { renderSkillContent } from '@deepseek-ai/dsh-skill'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'superpowers-bootstrap'

/** Upstream's SessionStart envelope, adapted only for DSH's `skill` tool. */
function envelope(body) {
  return `<EXTREMELY_IMPORTANT>
You have superpowers.

Below is the full content of your 'using-superpowers' skill — your introduction to using skills. For all other skills, use the \`skill\` tool:

${body}
</EXTREMELY_IMPORTANT>`
}

/** Register the session-start bootstrap injector. */
export function apply(ctx) {
  /** Sessions that already carry the bootstrap in the current epoch. */
  const injected = new Set()

  ctx.on('session/event', (session, event) => {
    // Compaction collapses the surface; the bootstrap must come back after it.
    if (event.type === 'compaction/end') injected.delete(session.id)
  })

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    try {
      const session = agent?.session
      if (session === undefined) return decision
      // A dispatched subagent does its own task; skip the workflow bootstrap.
      if ((session.header?.delegationDepth ?? 0) > 0) return decision
      if (injected.has(session.id)) return decision
      injected.add(session.id)

      const skill = await ctx.skills.get('using-superpowers', {
        scope: agent,
        cwd: session.header.cwd,
        signal,
      })
      if (skill?.content == null) {
        try {
          ctx.logger?.warn('superpowers-bootstrap: using-superpowers skill not found; skipping')
        } catch {
          // Logger unavailable — ignore.
        }
        return decision
      }

      return {
        ...decision,
        messages: [...(decision.messages ?? []), {
          id: `superpowers-bootstrap-${session.id}`,
          role: 'user',
          content: [{ type: 'text', text: envelope(renderSkillContent(skill)) }],
          source: { kind: 'skill-invocation', name: 'using-superpowers', form: 'instructions' },
        }],
      }
    } catch (error) {
      // A bootstrap bug must never hurt the session: skip it.
      try {
        ctx.logger?.warn(`superpowers-bootstrap: injection failed, skipping: ${String(error?.message ?? error)}`)
      } catch {
        // Logger unavailable — ignore.
      }
      return decision
    }
  })
}
