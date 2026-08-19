import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

test('sync and verify CLIs maintain the installed preset', async (t) => {
  const dshHome = await temporaryDirectory(t, 'dsh-superpower-cli')
  const env = { ...process.env, DSH_HOME: dshHome }
  const syncScript = join(repoRoot, 'scripts', 'sync-presets.mjs')
  const verifyScript = join(repoRoot, 'scripts', 'verify-install.mjs')

  const syncOutput = execFileSync(process.execPath, [syncScript], { cwd: repoRoot, env, encoding: 'utf8' })
  assert.match(syncOutput, /superpowers: synced/)

  const verified = spawnSync(process.execPath, [verifyScript], { cwd: repoRoot, env, encoding: 'utf8' })
  assert.equal(verified.status, 0, verified.stderr)
  assert.match(verified.stdout, /superpowers: current/)

  await writeFile(join(dshHome, '.agent-presets', 'superpowers', 'preset.yml'), 'tampered\n')
  const stale = spawnSync(process.execPath, [verifyScript], { cwd: repoRoot, env, encoding: 'utf8' })
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /superpowers: stale/)

  execFileSync(process.execPath, [syncScript], { cwd: repoRoot, env })
  const repaired = spawnSync(process.execPath, [verifyScript], { cwd: repoRoot, env, encoding: 'utf8' })
  assert.equal(repaired.status, 0, repaired.stderr)
})
