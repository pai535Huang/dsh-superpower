import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { temporaryDirectory } from './helpers.mjs'
import { applyBootstrap } from '../lib/bootstrap.mjs'

function harness({ skillResult = { content: 'routing rules', name: 'using-superpowers', provider: 'runtime', source: 'superpowers' }, hasSkillTool = true } = {}) {
  const handlers = new Map()
  const warnings = []
  const ctx = {
    on(event, handler) { handlers.set(event, handler) },
    skills: { async get() { return skillResult } },
    tools: { get(name) { return hasSkillTool ? { name } : undefined } },
    logger: { warn(message) { warnings.push(message) } },
  }
  return { ctx, handlers, warnings }
}

async function runPreStep(handler, session, decision = { messages: [] }) {
  return handler({ agent: { session }, signal: undefined }, async () => decision)
}

test('bootstrap injects once, then injects again after compaction', async () => {
  const { ctx, handlers } = harness()
  applyBootstrap(ctx)
  const session = { id: 'top-level', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const first = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(first.messages.length, 1)
  const text = first.messages[0].content[0].text
  assert.match(text, /^<EXTREMELY_IMPORTANT>\nYou have superpowers\./)
  assert.match(text, /<skill_content name="using-superpowers">/)
  assert.match(text, /<skill_instructions>\nrouting rules\n<\/skill_instructions>/)

  const second = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(second.messages.length, 0)

  handlers.get('session/event')(session, { type: 'compaction/end' })
  const afterCompaction = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(afterCompaction.messages.length, 1)
})

test('bootstrap skips agents whose tool view has no skill tool', async () => {
  const { ctx, handlers, warnings } = harness({ hasSkillTool: false, skillResult: null })
  applyBootstrap(ctx)
  const session = { id: 'minimal-shape', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.deepEqual(result, { messages: [] })
  assert.equal(warnings.length, 0, 'no skill tool must skip before touching the registry')

  const again = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.deepEqual(again, { messages: [] })
})

test('bootstrap declares no dependency on preset ids (guard is tool visibility)', async () => {
  const { ctx, handlers } = harness()
  applyBootstrap(ctx)
  const session = { id: 'some-future-preset', header: { cwd: '/tmp/project', delegationDepth: 0 } }
  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(result.messages.length, 1)
})

test('bootstrap skips delegated sessions', async () => {
  const { ctx, handlers } = harness()
  applyBootstrap(ctx)
  const delegated = { id: 'child', header: { cwd: '/tmp/project', delegationDepth: 1 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), delegated)
  assert.deepEqual(result, { messages: [] })
})

test('bootstrap rejects nothing when the step decision is a rejection', async () => {
  const { ctx, handlers } = harness()
  applyBootstrap(ctx)
  const session = { id: 'rejected', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session, { kind: 'reject', reason: 'no input' })
  assert.deepEqual(result, { kind: 'reject', reason: 'no input' })
})

test('bootstrap fails open when the routing skill is unavailable', async () => {
  const { ctx, handlers, warnings } = harness({ skillResult: null })
  applyBootstrap(ctx)
  const session = { id: 'missing-skill', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.deepEqual(result, { messages: [] })
  assert.match(warnings[0], /using-superpowers skill not found/)
})

test('bootstrap appends the DSH tool mapping from the skill resource base', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-bootstrap-mapping')
  const references = join(root, 'skills', 'using-superpowers', 'references')
  await mkdir(references, { recursive: true })
  await writeFile(join(references, 'dsh-tools.md'), 'DSH-TOOLS-MARKER: use the skill tool with bare names.\n')

  const { ctx, handlers } = harness({
    skillResult: {
      name: 'using-superpowers',
      provider: 'runtime',
      source: 'superpowers',
      content: 'routing rules',
      resourceBase: { kind: 'directory', path: join(root, 'skills', 'using-superpowers') },
    },
  })
  applyBootstrap(ctx)
  const session = { id: 'top-level', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  const text = result.messages[0].content[0].text
  assert.match(text, /<skill_instructions>\nrouting rules\n<\/skill_instructions>/)
  assert.match(text, /DSH-TOOLS-MARKER: use the skill tool with bare names\./)
  assert.ok(
    text.indexOf('DSH-TOOLS-MARKER') < text.lastIndexOf('</EXTREMELY_IMPORTANT>'),
    'tool mapping must travel inside the EXTREMELY_IMPORTANT envelope',
  )
})

test('bootstrap still injects when the tool mapping file is missing', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-bootstrap-mapping-missing')
  const skillDir = join(root, 'skills', 'using-superpowers')
  await mkdir(skillDir, { recursive: true })

  const { ctx, handlers, warnings } = harness({
    skillResult: {
      name: 'using-superpowers',
      provider: 'runtime',
      source: 'superpowers',
      content: 'routing rules',
      resourceBase: { kind: 'directory', path: skillDir },
    },
  })
  applyBootstrap(ctx)
  const session = { id: 'top-level', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  const text = result.messages[0].content[0].text
  assert.match(text, /<skill_instructions>\nrouting rules\n<\/skill_instructions>/)
  assert.doesNotMatch(text, /DSH-TOOLS-MARKER/)
  assert.ok(warnings.some((w) => /dsh-tools\.md/.test(w)))
})

test('bootstrap imports node: builtins only (zero runtime dependencies)', async () => {
  const { readFile } = await import('node:fs/promises')
  const { repoRoot } = await import('./helpers.mjs')
  const source = await readFile(join(repoRoot, 'lib', 'bootstrap.mjs'), 'utf8')
  const specifiers = [...source.matchAll(/^\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  const bare = specifiers.filter((s) => !s.startsWith('node:') && !s.startsWith('.') && !s.startsWith('/'))
  assert.deepEqual(bare, [], `lib/bootstrap.mjs cannot resolve bare specifiers: ${bare.join(', ')}`)
})
