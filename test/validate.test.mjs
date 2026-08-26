import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
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

test('validation accepts extra/custom skills (no fixed upstream set)', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-extra')
  await copyValidationProject(root)
  const extra = join(root, 'skills', 'experimental-workflow')
  await mkdir(extra, { recursive: true })
  await writeFile(join(extra, 'SKILL.md'), [
    '---',
    'name: experimental-workflow',
    'description: test-only extra skill',
    '---',
    'body\n',
  ].join('\n'))

  const result = validate(root)

  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /experimental-workflow/)
})

test('validation rejects a SKILL.md with no frontmatter block', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-no-frontmatter')
  await copyValidationProject(root)
  await writeFile(join(root, 'skills', 'brainstorming', 'SKILL.md'), '# body without frontmatter\n')

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /brainstorming.*frontmatter/i)
})

test('validation rejects a frontmatter name that differs from the directory', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-name-mismatch')
  await copyValidationProject(root)
  await writeFile(join(root, 'skills', 'brainstorming', 'SKILL.md'), [
    '---',
    'name: different',
    'description: s',
    '---',
    'body\n',
  ].join('\n'))

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /name "different" differs/)
})

test('validation rejects a skill missing its description', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-validate-missing-desc')
  await copyValidationProject(root)
  await writeFile(join(root, 'skills', 'brainstorming', 'SKILL.md'), [
    '---',
    'name: brainstorming',
    '---',
    'body\n',
  ].join('\n'))

  const result = validate(root)

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /missing description/)
})
