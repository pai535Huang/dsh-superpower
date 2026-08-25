import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'
import { SUPERPOWERS_SKILLS } from '../skill-names.mjs'

const { apply, name, inject } = await import('../lib/index.js')

test('host plugin declares cordis metadata and injects skills + tools', () => {
  assert.equal(name, 'dsh-superpower')
  assert.ok(Array.isArray(inject))
  assert.ok(inject.includes('skills'))
  assert.ok(inject.includes('tools'))
})

function harness(home) {
  const registered = []
  const warnings = []
  const infos = []
  const handlers = new Map()
  const ctx = {
    on(event, handler) { handlers.set(event, handler) },
    skills: { register(def) { registered.push(def) } },
    tools: { get() { return { name: 'skill' } } },
    logger: {
      warn(message) { warnings.push(message) },
      info(message) { infos.push(message) },
    },
  }
  return { ctx, registered, warnings, infos, handlers }
}

/**
 * apply() reads process.env.DSH_HOME through dshHome(). Without this, the
 * tests would point at the machine's real ~/.dsh — and the cleanup test
 * would delete a REAL .agent-presets/superpowers. Save/restore around a call.
 */
async function withDshHome(t, home, fn) {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  return await fn()
}

test('apply registers all 14 skills from the bundled manifest', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-register')
  const { ctx, registered } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  const names = registered.map((d) => d.name).sort()
  assert.deepEqual(names, [...SUPERPOWERS_SKILLS].sort())
  for (const def of registered) {
    assert.ok(def.content.length > 0, `${def.name} needs a body`)
    assert.equal(def.source, 'superpowers')
    assert.equal(def.resourceBase.kind, 'directory')
    assert.ok(def.path.endsWith(`${def.name}/SKILL.md`), `${def.name} path`)
  }
})

test('apply removes the legacy preset directory', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-cleanup')
  const legacy = join(home, '.agent-presets', 'superpowers')
  await mkdir(legacy, { recursive: true })
  await writeFile(join(legacy, 'sentinel.txt'), 'remove me\n')

  const { ctx } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  assert.equal(existsSync(legacy), false, 'legacy preset dir must be removed')
})

test('apply never creates a preset directory', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-nocreate')
  const { ctx } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  assert.equal(existsSync(join(home, '.agent-presets')), false)
})

test('apply warns when settings.yaml names superpowers as the default preset', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-stale-default')
  await writeFile(join(home, 'settings.yaml'), 'agent-presets: { default: superpowers }\nlocale:\n  preference: zh\n')

  const { ctx, warnings } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  assert.ok(warnings.some((w) => /default preset/i.test(w) && /superpowers/i.test(w)),
    `expected a stale-default warning, got: ${warnings.join('; ')}`)
})

test('apply stays silent when settings.yaml has another default', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-fine-default')
  await writeFile(join(home, 'settings.yaml'), 'agent-presets: { default: standard }\n')

  const { ctx, warnings } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  assert.deepEqual(warnings.filter((w) => /default preset/i.test(w)), [])
})

test('apply wires the bootstrap listener', async (t) => {
  const home = await temporaryDirectory(t, 'dsh-superpower-migrate-bootstrap')
  const { ctx, handlers } = harness(home)
  await withDshHome(t, home, () => apply(ctx))
  assert.equal(typeof handlers.get('agent/pre-step'), 'function')
  assert.equal(typeof handlers.get('session/event'), 'function')
})
