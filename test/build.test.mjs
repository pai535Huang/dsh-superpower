import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'

import { repoRoot, temporaryDirectory } from './helpers.mjs'

test('build copies skill resources and rewrites known Superpowers references', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-build')
  const upstream = join(root, 'upstream')
  const sourceSkill = join(upstream, 'skills', 'brainstorming')
  const skippedDirectory = join(upstream, 'skills', 'not-a-skill')

  await mkdir(join(sourceSkill, 'references'), { recursive: true })
  await mkdir(skippedDirectory, { recursive: true })
  await writeFile(join(sourceSkill, 'SKILL.md'), [
    '---',
    'name: brainstorming',
    'description: fixture',
    '---',
    'Use superpowers:test-driven-development.',
    'Leave superpowers:not-a-real-skill unchanged.',
    '',
  ].join('\n'))
  await writeFile(join(sourceSkill, 'references', 'guide.md'), 'See superpowers:writing-plans.\n')
  const binary = Buffer.from([0, 255, 1, 254, 2, 253])
  await writeFile(join(sourceSkill, 'references', 'asset.bin'), binary)
  await writeFile(join(skippedDirectory, 'README.md'), 'no SKILL.md here\n')

  await cp(join(repoRoot, 'build.mjs'), join(root, 'build.mjs'))
  await cp(join(repoRoot, 'skill-names.mjs'), join(root, 'skill-names.mjs'))
  const output = execFileSync(process.execPath, ['build.mjs', upstream], {
    cwd: root,
    encoding: 'utf8',
  })

  const builtSkill = await readFile(join(root, 'superpowers', 'skills', 'brainstorming', 'SKILL.md'), 'utf8')
  const builtGuide = await readFile(join(root, 'superpowers', 'skills', 'brainstorming', 'references', 'guide.md'), 'utf8')
  const builtBinary = await readFile(join(root, 'superpowers', 'skills', 'brainstorming', 'references', 'asset.bin'))

  assert.match(output, /copied 1 skills/)
  assert.match(builtSkill, /Use test-driven-development\./)
  assert.match(builtSkill, /superpowers:not-a-real-skill/)
  assert.equal(builtGuide, 'See writing-plans.\n')
  assert.deepEqual(builtBinary, binary)
  await assert.rejects(readFile(join(root, 'superpowers', 'skills', 'not-a-skill', 'README.md')))
})
