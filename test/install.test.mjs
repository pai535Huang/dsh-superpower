import assert from 'node:assert/strict'
import { access, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

test('install replaces a stale preset and tightens its permissions', async (t) => {
  const dshHome = await temporaryDirectory(t, 'dsh-superpower-home')
  const destination = join(dshHome, '.agent-presets', 'superpowers')
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'stale.txt'), 'remove me\n')

  const runInstall = () => execFileSync('bash', [join(repoRoot, 'install.sh')], {
    cwd: repoRoot,
    env: { ...process.env, DSH_HOME: dshHome },
    encoding: 'utf8',
  })

  const firstOutput = runInstall()
  assert.match(firstOutput, /done\. select the 'Superpowers' preset/)
  assert.equal(await readFile(join(destination, 'preset.yml'), 'utf8'), await readFile(join(repoRoot, 'superpowers', 'preset.yml'), 'utf8'))
  await assert.rejects(access(join(destination, 'stale.txt')))
  assert.equal((await stat(destination)).mode & 0o077, 0)
  assert.equal((await stat(join(destination, 'preset.yml'))).mode & 0o077, 0)

  assert.doesNotThrow(runInstall)
})
