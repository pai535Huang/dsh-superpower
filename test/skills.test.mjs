import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { temporaryDirectory } from './helpers.mjs'
import { loadSkillDefinitions, registerSkills } from '../lib/skills.mjs'

async function scaffold(t, manifestEntries, body = 'skill body\n') {
  const root = await temporaryDirectory(t, 'dsh-superpower-skills')
  await mkdir(join(root, 'brainstorming'), { recursive: true })
  await writeFile(join(root, 'brainstorming', 'SKILL.md'),
    '---\nname: brainstorming\ndescription: fixture skill\n---\n' + body)
  await writeFile(join(root, 'manifest.json'),
    JSON.stringify(manifestEntries, null, 2) + '\n')
  return root
}

test('loadSkillDefinitions reads manifest and slices the body at contentOffset', async (t) => {
  const root = await scaffold(t, [{
    name: 'brainstorming',
    description: 'fixture skill',
    file: 'brainstorming/SKILL.md',
    contentOffset: 55, // byte offset of the body after '---\nname: brainstorming\ndescription: fixture skill\n---\n'
  }])
  const definitions = loadSkillDefinitions(root)
  assert.equal(definitions.length, 1)
  const def = definitions[0]
  assert.equal(def.name, 'brainstorming')
  assert.equal(def.description, 'fixture skill')
  assert.equal(def.content, 'skill body\n')
  assert.equal(def.source, 'superpowers')
  assert.deepEqual(def.resourceBase, { kind: 'directory', path: join(root, 'brainstorming') })
  assert.equal(def.path, join(root, 'brainstorming', 'SKILL.md'))
  assert.equal(def.whenToUse, undefined)
  assert.equal(def.invocation, undefined)
})

test('loadSkillDefinitions carries whenToUse and invocation from the manifest', async (t) => {
  const root = await scaffold(t, [{
    name: 'brainstorming',
    description: 'fixture skill',
    file: 'brainstorming/SKILL.md',
    contentOffset: 55,
    whenToUse: 'when user says design',
    invocation: { modelInvocable: false, userInvocable: true },
  }])
  const [def] = loadSkillDefinitions(root)
  assert.equal(def.whenToUse, 'when user says design')
  assert.deepEqual(def.invocation, { modelInvocable: false, userInvocable: true })
})

test('loadSkillDefinitions rejects a missing manifest', async (t) => {
  const root = await temporaryDirectory(t, 'dsh-superpower-skills-nomanifest')
  assert.throws(() => loadSkillDefinitions(root), /manifest not found/)
})

test('loadSkillDefinitions rejects an invalid contentOffset', async (t) => {
  const root = await scaffold(t, [{
    name: 'brainstorming',
    description: 'fixture skill',
    file: 'brainstorming/SKILL.md',
    contentOffset: 99999,
  }])
  assert.throws(() => loadSkillDefinitions(root), /contentOffset/)
})

test('loadSkillDefinitions rejects an entry without description', async (t) => {
  const root = await scaffold(t, [{
    name: 'brainstorming',
    file: 'brainstorming/SKILL.md',
    contentOffset: 0,
  }])
  assert.throws(() => loadSkillDefinitions(root), /missing description/)
})

test('registerSkills registers every definition and returns the count', () => {
  const calls = []
  const ctx = { skills: { register(def) { calls.push(def) } } }
  const count = registerSkills(ctx, [
    { name: 'a', content: 'x', source: 'superpowers' },
    { name: 'b', content: 'y', source: 'superpowers' },
  ])
  assert.equal(count, 2)
  assert.deepEqual(calls.map((c) => c.name), ['a', 'b'])
})
