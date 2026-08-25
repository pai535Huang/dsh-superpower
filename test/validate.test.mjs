import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'

import { copyValidationProject, temporaryDirectory } from './helpers.mjs'

function validate(projectRoot) {
  return spawnSync(process.execPath, ['validate.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
}

test('validation loads js-yaml from the project dependency', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-local-dependency')
  await copyValidationProject(root)

  const result = validate(root)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /LOCAL_JS_YAML_PROXY_LOADED/)
  assert.match(result.stdout, /PASS/)
})

test('validation rejects a missing bundled skill', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-missing')
  await copyValidationProject(root)
  await rm(join(root, 'skills', 'brainstorming'), { recursive: true })

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /missing bundled skill.*brainstorming/i)
})

test('validation rejects an unexpected bundled skill', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-extra')
  await copyValidationProject(root)
  const extra = join(root, 'skills', 'experimental-workflow')
  await mkdir(extra, { recursive: true })
  await writeFile(join(extra, 'SKILL.md'), [
    '---',
    'name: experimental-workflow',
    'description: test-only extra skill',
    '---',
    '',
  ].join('\n'))

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /unexpected bundled skill.*experimental-workflow/i)
})

test('validation rejects a manifest entry that disagrees with SKILL.md', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-manifest-mismatch')
  await copyValidationProject(root)
  const manifestFile = join(root, 'skills', 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  const entry = manifest.find((e) => e.name === 'brainstorming')
  entry.description = 'tampered'
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /brainstorming.*description/i)
})

test('validation rejects a manifest entry with a wrong contentOffset', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-manifest-offset')
  await copyValidationProject(root)
  const manifestFile = join(root, 'skills', 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  const entry = manifest.find((e) => e.name === 'brainstorming')
  entry.contentOffset = entry.contentOffset + 1
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /contentOffset/i)
})
