import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

test('package exposes a DSH bundle and packs every runtime file', async (t) => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports?.['.'], './lib/index.js')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')

  const npmCache = await temporaryDirectory(t, 'dsh-superpower-npm-cache')
  const packResult = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    env: { ...process.env, npm_config_cache: join(npmCache, 'cache') },
    encoding: 'utf8',
  }))
  const pack = Array.isArray(packResult) ? packResult[0] : packResult[manifest.name]
  assert.ok(pack, `npm pack returned no entry for ${manifest.name}`)
  const files = new Set(pack.files.map(({ path }) => path))
  for (const required of [
    'package.json',
    'cordis.patch.yml',
    'lib/index.js',
    'lib/bootstrap.mjs',
    'lib/skills.mjs',
    'skills/using-superpowers/SKILL.md',
  ]) assert.ok(files.has(required), `packed artifact is missing ${required}`)
  assert.equal([...files].some((path) => path.startsWith('test/')), false)
  assert.equal([...files].some((path) => path.startsWith('.superpowers-src/')), false)
  assert.equal([...files].some((path) => path.startsWith('superpowers/')), false, 'no preset artifacts in the package')
  assert.equal([...files].some((path) => path.startsWith('scripts/')), false, 'no sync/verify scripts in the package')
  assert.equal([...files].some((path) => path === 'install.sh'), false, 'no install.sh in the package')
})
