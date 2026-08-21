import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
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

test('build merges overlay references and adds the DSH platform pointer idempotently', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-build-overlay')
  const upstream = join(root, 'upstream')
  const sourceSkill = join(upstream, 'skills', 'using-superpowers')

  await mkdir(join(sourceSkill, 'references'), { recursive: true })
  await writeFile(join(sourceSkill, 'SKILL.md'), [
    '---',
    'name: using-superpowers',
    'description: fixture',
    '---',
    '## Platform Adaptation',
    '',
    'If your harness appears here, read its reference file for special instructions:',
    '',
    '- Codex: `references/codex-tools.md`',
    '- Hermes Agent: `references/hermes-tools.md`',
    '',
  ].join('\n'))
  await writeFile(join(sourceSkill, 'references', 'codex-tools.md'), 'upstream reference\n')

  const overlayDir = join(root, 'overlays', 'using-superpowers', 'references')
  await mkdir(overlayDir, { recursive: true })
  await writeFile(join(overlayDir, 'dsh-tools.md'), 'DSH-TOOLS-MARKER\n')

  await cp(join(repoRoot, 'build.mjs'), join(root, 'build.mjs'))
  await cp(join(repoRoot, 'skill-names.mjs'), join(root, 'skill-names.mjs'))
  execFileSync(process.execPath, ['build.mjs', upstream], { cwd: root, encoding: 'utf8' })

  const builtSkill = await readFile(join(root, 'superpowers', 'skills', 'using-superpowers', 'SKILL.md'), 'utf8')
  const builtMapping = await readFile(join(root, 'superpowers', 'skills', 'using-superpowers', 'references', 'dsh-tools.md'), 'utf8')
  const builtUpstream = await readFile(join(root, 'superpowers', 'skills', 'using-superpowers', 'references', 'codex-tools.md'), 'utf8')

  assert.equal(builtMapping, 'DSH-TOOLS-MARKER\n')
  assert.equal(builtUpstream, 'upstream reference\n')
  assert.match(builtSkill, /- Hermes Agent: `references\/hermes-tools\.md`\n- DeepSeek Harness: `references\/dsh-tools\.md`/)

  execFileSync(process.execPath, ['build.mjs', upstream], { cwd: root, encoding: 'utf8' })
  const rebuilt = await readFile(join(root, 'superpowers', 'skills', 'using-superpowers', 'SKILL.md'), 'utf8')
  assert.equal(rebuilt.match(/DeepSeek Harness: `references\/dsh-tools\.md`/g)?.length, 1)
})

test('build refuses an overlay that would overwrite a copied skill file', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-build-overlay-conflict')
  const upstream = join(root, 'upstream')
  const sourceSkill = join(upstream, 'skills', 'using-superpowers')
  await mkdir(sourceSkill, { recursive: true })
  await writeFile(join(sourceSkill, 'SKILL.md'), '---\nname: using-superpowers\ndescription: fixture\n---\n# body\n')

  const overlayDir = join(root, 'overlays', 'using-superpowers')
  await mkdir(overlayDir, { recursive: true })
  await writeFile(join(overlayDir, 'SKILL.md'), 'an overlay must never replace a copied SKILL.md\n')

  await cp(join(repoRoot, 'build.mjs'), join(root, 'build.mjs'))
  await cp(join(repoRoot, 'skill-names.mjs'), join(root, 'skill-names.mjs'))
  const result = spawnSync(process.execPath, ['build.mjs', upstream], { cwd: root, encoding: 'utf8' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /overlay .* already exists/)
})
