/**
 * lib/skills.mjs — the skill provider that exposes this package's bundled
 * skills to the DeepSeek Harness registry.
 *
 * Instead of reading a build-time manifest, this module implements the
 * registry's provider protocol (a `registerProvider` factory) and discovers
 * skills by scanning `<skillsRoot>/<name>/SKILL.md` at runtime: `list()`
 * enumerates candidates (frontmatter parsed for metadata), `get()` reads the
 * winner's body on demand. Any skill dropped into the bundled skills
 * directory is picked up automatically — no build, no manifest, no need to
 * bind to an upstream checkout. This is the same shape the filesystem skill
 * provider uses, so a user adding their own skill is treated uniformly.
 *
 * The frontmatter parser is a small, dependency-free scalar reader (the
 * package keeps a zero-runtime-dependency posture): it understands the fields
 * DSH skill discovery consumes — `name`, `description`, `whenToUse`,
 * `disable-model-invocation`, `user-invocable` — and passes the rest through
 * verbatim as metadata.
 *
 * @module lib/skills
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The source bucket bundled skills advertise under (prompt-visible metadata). */
const SOURCE = 'superpowers'

/**
 * Parse the YAML frontmatter block of a SKILL.md into metadata plus body.
 * Handles only the scalar fields DSH skill discovery consumes; richer metadata
 * passes through verbatim. Returns null when the file has no frontmatter.
 * @param {string} text - the raw skill file contents.
 * @returns {{ metadata: Record<string,string>, body: string } | null}
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const block = text.slice(3, end)
  const body = text.slice(end + 4).replace(/^\n+/, '')
  const metadata = {}
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    metadata[match[1]] = value
  }
  return { metadata, body }
}

/**
 * Read and parse one skill directory's SKILL.md.
 * @param {string} skillFile - absolute path to the SKILL.md file.
 * @param {AbortSignal} [signal] - optional cancellation; aborts the read.
 * @returns {Promise<object | undefined>} the parsed skill record, or undefined
 *   when the file vanished or carried no frontmatter.
 */
async function parseSkillFile(skillFile, signal) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return undefined
  }
  if (signal?.aborted) return undefined
  const parsed = parseFrontmatter(text)
  if (parsed === null) return undefined
  return {
    name: parsed.metadata.name ?? '',
    description: parsed.metadata.description ?? '',
    whenToUse: parsed.metadata.whenToUse,
    metadata: parsed.metadata,
    body: parsed.body,
    invocation: {
      // The scalar parser keeps values as strings; compare loosely so both
      // `true` (string) and true (boolean) behave, and an absent flag is a no-op.
      modelInvocable: String(parsed.metadata['disable-model-invocation']) !== 'true',
      userInvocable: String(parsed.metadata['user-invocable']) !== 'false',
    },
  }
}

/**
 * Discover packaged skill candidates by scanning `<skillsRoot>`: one
 * subdirectory per skill, each carrying a SKILL.md. Directories without one
 * (and loose files) are skipped.
 * @param {string} skillsRoot - absolute path to the bundled skills directory.
 * @param {AbortSignal} [signal] - optional cancellation.
 * @param {string} providerName - the provider name to attribute each candidate to.
 * @returns {Promise<Array<object>>} the candidate list.
 */
async function discoverCandidates(skillsRoot, signal, providerName) {
  let entries
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (signal?.aborted) break
    if (!entry.isDirectory()) continue
    const skillDir = join(skillsRoot, entry.name)
    const skillFile = join(skillDir, 'SKILL.md')
    const parsed = await parseSkillFile(skillFile, signal)
    if (parsed === undefined) continue
    candidates.push({
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: parsed.invocation,
      source: SOURCE,
      provider: providerName,
      rank: rankFor(skillDir),
      locator: skillDir,
      path: skillFile,
      ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
    })
  }
  return candidates
}

/** Rank bucket for packaged skills: low precedence, so user skills shadow them. */
function rankFor() {
  return 550
}

/**
 * Build the `registerProvider` factory for the skill registry.
 * @param {string} skillsRoot - absolute path to the bundled skills directory.
 * @param {{ name?: string }} [options]
 * @returns {(control: unknown) => { name: string, list: Function, get: Function }}
 */
export function createSkillProvider(skillsRoot, { name = 'dsh-superpower' } = {}) {
  return (control) => ({
    name,
    async list(options = {}) {
      return discoverCandidates(skillsRoot, options.signal, name)
    },
    async get(candidate, options = {}) {
      const parsed = await parseSkillFile(candidate.path, options.signal)
      if (parsed === undefined) return undefined
      return {
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        invocation: parsed.invocation,
        source: SOURCE,
        provider: name,
        rank: rankFor(candidate.locator),
        resourceBase: { kind: 'directory', path: candidate.locator },
        path: candidate.path,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
        content: parsed.body,
      }
    },
  })
}
