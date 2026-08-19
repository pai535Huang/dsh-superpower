import assert from 'node:assert/strict'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

async function loadBootstrap(t) {
  const root = await temporaryDirectory(t, 'dsh-superpower-bootstrap')
  const pluginDirectory = join(root, 'superpowers')
  const dependencyDirectory = join(root, 'node_modules', '@deepseek-ai', 'dsh-skill')
  await mkdir(pluginDirectory, { recursive: true })
  await mkdir(dependencyDirectory, { recursive: true })
  await cp(join(repoRoot, 'superpowers', 'superpowers-bootstrap.mjs'), join(pluginDirectory, 'superpowers-bootstrap.mjs'))
  await writeFile(join(dependencyDirectory, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-skill',
    type: 'module',
    exports: './index.mjs',
  }))
  await writeFile(join(dependencyDirectory, 'index.mjs'), [
    'export function renderSkillContent(skill) {',
    '  return `<skill_content>${skill.content}</skill_content>`',
    '}',
    '',
  ].join('\n'))
  return import(`${pathToFileURL(join(pluginDirectory, 'superpowers-bootstrap.mjs')).href}?test=${Date.now()}`)
}

function harness(skillResult = { content: 'routing rules' }) {
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
  assert.match(first.messages[0].content[0].text, /<skill_content>routing rules<\/skill_content>/)

  const second = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(second.messages.length, 0)

  handlers.get('session/event')(session, { type: 'compaction/end' })
  const afterCompaction = await runPreStep(handlers.get('agent/pre-step'), session)
  assert.equal(afterCompaction.messages.length, 1)
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
