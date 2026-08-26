import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { temporaryDirectory } from './helpers.mjs'
import { createSkillProvider } from '../lib/skills.mjs'

/** Write one skill dir (SKILL.md plus optional extra files) under a temp root. */
async function scaffold(t, files = {}) {
  const root = await temporaryDirectory(t, 'dsh-superpower-skill-provider')
  for (const [dir, contents] of Object.entries(files)) {
    await mkdir(join(root, dir), { recursive: true })
    for (const [file, text] of Object.entries(contents)) {
      await writeFile(join(root, dir, file), text)
    }
  }
  return root
}

const frontmatter = (body = 'skill body\n') =>
  '---\nname: brainstorming\ndescription: fixture skill\n---\n' + body

function providerFor(root) {
  return createSkillProvider(root)({})
}

test('list discovers a skill directory that carries a SKILL.md', async (t) => {
  const root = await scaffold(t, {
    brainstorming: { 'SKILL.md': frontmatter() },
  })
  const candidates = await providerFor(root).list({})
  assert.equal(candidates.length, 1)
  const c = candidates[0]
  assert.equal(c.name, 'brainstorming')
  assert.equal(c.description, 'fixture skill')
  assert.equal(c.path, join(root, 'brainstorming', 'SKILL.md'))
  assert.equal(c.locator, join(root, 'brainstorming'))
  assert.equal(c.source, 'superpowers')
  assert.equal(typeof c.rank, 'number')
})

test('list skips directories without a SKILL.md and non-skill files', async (t) => {
  const root = await scaffold(t, {
    brainstorming: { 'SKILL.md': frontmatter() },
    'not-a-skill': { 'README.md': 'no SKILL.md here\n' },
    'loose-file.md': 'floating file\n',
  })
  const candidates = await providerFor(root).list({})
  assert.deepEqual(candidates.map((c) => c.name), ['brainstorming'])
})

test('get returns the parsed body and a directory resource base', async (t) => {
  const root = await scaffold(t, {
    brainstorming: { 'SKILL.md': frontmatter('first line\nsecond line\n') },
  })
  const provider = providerFor(root)
  const [candidate] = await provider.list({})
  const def = await provider.get(candidate, {})
  assert.equal(def.name, 'brainstorming')
  assert.equal(def.description, 'fixture skill')
  assert.equal(def.content, 'first line\nsecond line\n')
  assert.deepEqual(def.resourceBase, { kind: 'directory', path: join(root, 'brainstorming') })
  assert.equal(def.path, join(root, 'brainstorming', 'SKILL.md'))
  assert.equal(def.source, 'superpowers')
  assert.equal(def.provider, 'dsh-superpower')
  assert.deepEqual(def.invocation, { modelInvocable: true, userInvocable: true })
})

test('get returns undefined for a candidate whose file vanished', async (t) => {
  const root = await scaffold(t, {
    brainstorming: { 'SKILL.md': frontmatter() },
  })
  const provider = providerFor(root)
  const [candidate] = await provider.list({})
  const def = await provider.get({ ...candidate, path: join(root, 'missing', 'SKILL.md') }, {})
  assert.equal(def, undefined)
})

test('frontmatter parsing carries whenToUse and honors invocation flags', async (t) => {
  const root = await scaffold(t, {
    brainstorming: {
      'SKILL.md':
        '---\nname: brainstorming\ndescription: "fixture with: a colon"\nwhenToUse: when the user says design\ndisable-model-invocation: true\n---\nbody\n',
    },
  })
  const provider = providerFor(root)
  const [candidate] = await provider.list({})
  assert.equal(candidate.whenToUse, 'when the user says design')
  const def = await provider.get(candidate, {})
  assert.equal(def.whenToUse, 'when the user says design')
  assert.deepEqual(def.invocation, { modelInvocable: false, userInvocable: true })
})

test('provider shape is the registered factory contract', async (t) => {
  const root = await scaffold(t, {
    brainstorming: { 'SKILL.md': frontmatter() },
  })
  const provider = createSkillProvider(root)({})
  assert.equal(typeof provider.name, 'string')
  assert.equal(typeof provider.list, 'function')
  assert.equal(typeof provider.get, 'function')
})
