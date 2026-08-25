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
 *
 * ── IMPORTS: `node:` BUILTINS ONLY ──────────────────────────────────────────
 * This module is imported by lib/index.js, which declares the host plugin's
 * `inject` list (`skills`, `tools`). A host-level module's own `import`
 * statements resolve like any ESM import, and a bare
 * `import … from '@deepseek-ai/dsh-…'` would throw ERR_MODULE_NOT_FOUND and
 * fail the whole plugin mount, so this file must stay free of runtime
 * dependencies. Keep the `<skill_content>` renderer below inlined and never
 * add a package import here.
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Escape a value embedded in a `<skill_content>` attribute. */
function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/** Escape model-facing prose embedded inside skill markup. */
function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** The `<skill_resources>` lines for one skill's resource base. */
function renderResourceHint(skill) {
  const base = skill.resourceBase
  if (base === undefined || base === null) {
    return [
      `Resources for this skill are managed by provider "${escapeText(skill.provider ?? 'unknown')}".`,
      'Load referenced resources only as needed.',
    ]
  }
  switch (base.kind) {
    case 'directory':
      return [
        `Base directory for this skill: ${escapeText(base.path)}`,
        'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.',
      ]
    case 'url':
      return [
        `Base URL for this skill: ${escapeText(base.url)}`,
        'Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.',
      ]
    case 'opaque':
      return [
        `Resources for this skill: ${escapeText(base.description)}`,
        'Load referenced resources only as needed.',
      ]
    default:
      return ['Load referenced resources only as needed.']
  }
}

/**
 * Render one loaded skill in the harness's canonical model-facing shape.
 *
 * Deliberately a local copy of `renderSkillContent` from
 * `@deepseek-ai/dsh-skill`: see the import note at the top of this file — a
 * package import here would violate the zero-runtime-dependency constraint.
 * The block shape is the contract (`<skill_content>` / `<skill_resources>` /
 * `<skill_instructions>`),
 * so the model reads an injected skill exactly as it reads one returned by the
 * `skill` tool.
 */
function renderSkillContent(skill) {
  return [
    `<skill_content name="${escapeAttr(skill.name ?? 'using-superpowers')}">`,
    '<skill_resources>',
    ...renderResourceHint(skill),
    '</skill_resources>',
    '',
    '<skill_instructions>',
    skill.content,
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n')
}

/** Upstream's SessionStart envelope, adapted only for DSH's `skill` tool. */
function envelope(body, toolMapping = '') {
  const mappingBlock = toolMapping === ''
    ? ''
    : `\n\nBelow is the DeepSeek Harness tool mapping for these skills (using-superpowers/references/dsh-tools.md):\n\n${toolMapping}`
  return `<EXTREMELY_IMPORTANT>
You have superpowers.

Below is the full content of your 'using-superpowers' skill — your introduction to using skills. For all other skills, use the \`skill\` tool:

${body}${mappingBlock}
</EXTREMELY_IMPORTANT>`
}

/**
 * Register the session-start bootstrap injector. Called from lib/index.js,
 * which declares the cordis inject list (skills, tools) for its ctx.
 * @param {object} ctx - the host plugin context (skills + tools injected).
 */
export function applyBootstrap(ctx) {
  /** Sessions that already carry the bootstrap in the current epoch. */
  const injected = new Set()

  /** Warn without ever letting a missing logger break the session. */
  const warn = (message) => {
    try {
      ctx.logger?.warn(message)
    } catch {
      // Logger unavailable — ignore.
    }
  }

  ctx.on('session/event', (session, event) => {
    // Compaction collapses the surface; the bootstrap must come back after it.
    if (event.type === 'compaction/end') injected.delete(session.id)
  })

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    try {
      if (decision?.kind === 'reject') return decision
      const session = agent?.session
      if (session === undefined) return decision
      // A dispatched subagent does its own task; skip the workflow bootstrap.
      if ((session.header?.delegationDepth ?? 0) > 0) return decision
      // The bootstrap is only meaningful where the model can load skills at
      // all. Guard on TOOL VISIBILITY, never on preset ids: a preset that
      // mounts tool-skill gets the discipline automatically; one that replaces
      // it (minimal, the anchored family) opts out by construction.
      if (ctx.tools.get('skill', agent) === undefined) return decision
      if (injected.has(session.id)) return decision
      injected.add(session.id)

      const skill = await ctx.skills.get('using-superpowers', {
        scope: agent,
        cwd: session.header.cwd,
        signal,
      })
      if (skill?.content == null) {
        warn('superpowers-bootstrap: using-superpowers skill not found; skipping')
        return decision
      }

      // Append the DSH tool mapping shipped as a reference file next to the
      // skill, so the harness-specific mapping rides the same bootstrap and
      // has a single source of truth. Fail open: a missing or unreadable
      // mapping must never break the session.
      let toolMapping = ''
      const base = skill.resourceBase
      if (base?.kind === 'directory') {
        const mappingFile = join(base.path, 'references', 'dsh-tools.md')
        try {
          toolMapping = await readFile(mappingFile, 'utf8')
        } catch (error) {
          warn(`superpowers-bootstrap: ${mappingFile} unreadable; injecting without the DSH tool mapping`)
        }
      }

      return {
        ...decision,
        messages: [...(decision.messages ?? []), {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: envelope(renderSkillContent(skill), toolMapping) }],
          source: { kind: 'skill-invocation', name: 'using-superpowers', form: 'instructions' },
        }],
      }
    } catch (error) {
      // A bootstrap bug must never hurt the session: skip it.
      warn(`superpowers-bootstrap: injection failed, skipping: ${String(error?.message ?? error)}`)
      return decision
    }
  })
}
