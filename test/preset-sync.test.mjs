import assert from 'node:assert/strict'
import { access, chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { temporaryDirectory } from './helpers.mjs'

async function loadPlugin() {
  return import(new URL(`../lib/index.js?test=${Date.now()}-${Math.random()}`, import.meta.url))
}

async function createFixturePreset(root) {
  await mkdir(join(root, 'skills', 'fixture-skill'), { recursive: true })
  await mkdir(join(root, 'scripts'), { recursive: true })
  await writeFile(join(root, 'agent.cordis.yml'), '- id: fixture\n  name: fixture-plugin\n')
  await writeFile(join(root, 'preset.yml'), 'name: Fixture\ndescription: Test preset\n')
  await writeFile(join(root, 'skills', 'fixture-skill', 'SKILL.md'), [
    '---',
    'name: fixture-skill',
    'description: fixture',
    '---',
    '',
  ].join('\n'))
  await writeFile(join(root, 'scripts', 'run.sh'), '#!/usr/bin/env bash\nexit 0\n')
  await chmod(join(root, 'scripts', 'run.sh'), 0o755)
}

test('syncPreset installs, updates, prunes, and preserves sibling presets', async (t) => {
  const { syncPreset, verifyPreset } = await loadPlugin()
  const root = await temporaryDirectory(t, 'dsh-superpower-sync')
  const source = join(root, 'source')
  const presetRoot = join(root, '.agent-presets')
  const target = join(presetRoot, 'superpowers')
  const sibling = join(presetRoot, 'another-preset')
  await createFixturePreset(source)
  await mkdir(target, { recursive: true })
  await mkdir(sibling, { recursive: true })
  await writeFile(join(target, 'stale.txt'), 'remove me\n')
  await writeFile(join(sibling, 'keep.txt'), 'do not touch\n')

  assert.equal(syncPreset(source, target), 'synced')
  assert.equal(await readFile(join(target, 'preset.yml'), 'utf8'), 'name: Fixture\ndescription: Test preset\n')
  await assert.rejects(access(join(target, 'stale.txt')))
  assert.equal(await readFile(join(sibling, 'keep.txt'), 'utf8'), 'do not touch\n')
  assert.equal((await stat(target)).mode & 0o077, 0)
  assert.equal((await stat(join(target, 'preset.yml'))).mode & 0o077, 0)
  assert.notEqual((await stat(join(target, 'scripts', 'run.sh'))).mode & 0o100, 0)
  assert.deepEqual(verifyPreset(source, target), { status: 'ok', differing: [], extra: [] })
  assert.equal(syncPreset(source, target), 'current')

  await writeFile(join(target, 'preset.yml'), 'changed locally\n')
  assert.equal(verifyPreset(source, target).status, 'stale')
  assert.equal(syncPreset(source, target), 'synced')
  assert.equal(await readFile(join(target, 'preset.yml'), 'utf8'), 'name: Fixture\ndescription: Test preset\n')
})

test('syncPreset rejects a directory that is not a complete preset', async (t) => {
  const { syncPreset } = await loadPlugin()
  const root = await temporaryDirectory(t, 'dsh-superpower-invalid-preset')
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'preset.yml'), 'name: Incomplete\n')

  assert.throws(() => syncPreset(source, join(root, 'target')), /agent\.cordis\.yml/)
})

test('host apply syncs the bundled Superpowers preset into DSH_HOME', async (t) => {
  const { apply } = await loadPlugin()
  const dshHome = await temporaryDirectory(t, 'dsh-superpower-apply')
  const previousDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome
  t.after(() => {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
  })
  const messages = []

  apply({ logger: { info(message) { messages.push(message) } } })

  const installed = join(dshHome, '.agent-presets', 'superpowers')
  assert.match(await readFile(join(installed, 'preset.yml'), 'utf8'), /name: Superpowers/)
  assert.match(await readFile(join(installed, 'skills', 'using-superpowers', 'SKILL.md'), 'utf8'), /name: using-superpowers/)
  assert.match(messages[0], /preset synced/)
})
