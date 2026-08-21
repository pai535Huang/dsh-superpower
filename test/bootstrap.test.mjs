import assert from 'node:assert/strict'
import { cp, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

/**
 * Load the plugin the way the harness does: from an installed preset directory
 * with NO `node_modules` anywhere above it.
 *
 * The preset is installed under `$DSH_HOME/.agent-presets/superpowers/`, so a
 * relative row's own `import` statements resolve from the user's home and can
 * never reach the harness's `node_modules`. A bare `@deepseek-ai/dsh-*` import
 * therefore throws ERR_MODULE_NOT_FOUND, fails the row, and fails the whole
 * preset mount — which shows up in the GUI as a preset that cannot be selected.
 * Fabricating the dependency here (as an earlier version of this test did) hides
 * exactly that failure, so this loader supplies nothing but the file itself.
 */
async function loadBootstrap(t) {
  const root = await temporaryDirectory(t, 'dsh-superpower-bootstrap')
  const pluginDirectory = join(root, 'superpowers')
  await mkdir(pluginDirectory, { recursive: true })
  await cp(join(repoRoot, 'superpowers', 'superpowers-bootstrap.mjs'), join(pluginDirectory, 'superpowers-bootstrap.mjs'))
  return import(`${pathToFileURL(join(pluginDirectory, 'superpowers-bootstrap.mjs')).href}?test=${Date.now()}`)
}

function harness(skillResult = { content: 'routing rules', name: 'using-superpowers', provider: 'filesystem' }) {
  const handlers = new Map()
  const warnings = []
  const ctx = {
    on(event, handler) { handlers.set(event, handler) },
    skills: { async get() { return skillResult } },
    logger: { warn(message) { warnings.push(message) } },
  }
  return { ctx, handlers, warnings }
}

async function runPreStep(handler, session, decision = { messages: [] }) {
  return handler({ agent: { session }, signal: undefined }, async () => decision)
}

test('bootstrap injects once, then injects again after compaction', async (t) => {
  const { apply } = await loadBootstrap(t)
  const { ctx, handlers } = harness()
  apply(ctx)
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

test('bootstrap declares the inject cordis needs to read ctx.skills', async (t) => {
  const module = await loadBootstrap(t)
  assert.equal(module.name, 'superpowers-bootstrap')
  assert.ok(Array.isArray(module.inject), 'inject must be a declared array')
  assert.ok(module.inject.includes('skills'), 'ctx.skills throws without a declared inject')
})

test('bootstrap imports node: builtins only, so the preset row can be loaded', async (t) => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(join(repoRoot, 'superpowers', 'superpowers-bootstrap.mjs'), 'utf8')
  const specifiers = [...source.matchAll(/^\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  const bare = specifiers.filter((s) => !s.startsWith('node:') && !s.startsWith('.') && !s.startsWith('/'))
  assert.deepEqual(bare, [], `a preset-relative row cannot resolve bare specifiers: ${bare.join(', ')}`)
})

test('bootstrap rejects nothing when the step decision is a rejection', async (t) => {
  const { apply } = await loadBootstrap(t)
  const { ctx, handlers } = harness()
  apply(ctx)
  const session = { id: 'rejected', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session, { kind: 'reject', reason: 'no input' })
  assert.deepEqual(result, { kind: 'reject', reason: 'no input' })
})

test('bootstrap skips delegated sessions', async (t) => {
  const { apply } = await loadBootstrap(t)
  const { ctx, handlers } = harness()
  apply(ctx)
  const delegated = { id: 'child', header: { cwd: '/tmp/project', delegationDepth: 1 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), delegated)
  assert.deepEqual(result, { messages: [] })
})

test('bootstrap fails open when the routing skill is unavailable', async (t) => {
  const { apply } = await loadBootstrap(t)
  const { ctx, handlers, warnings } = harness(null)
  apply(ctx)
  const session = { id: 'missing-skill', header: { cwd: '/tmp/project', delegationDepth: 0 } }

  const result = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.deepEqual(result, { messages: [] })
  assert.match(warnings[0], /using-superpowers skill not found/)
})
