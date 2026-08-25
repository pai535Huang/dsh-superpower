#!/usr/bin/env node
/**
 * validate.mjs — sanity-check the bundled Superpowers skills before publishing.
 *
 * Verifies: the skills/ tree contains exactly the expected skill set; every
 * SKILL.md parses with a kebab-case `name` and string `description`; and
 * skills/manifest.json exists, covers exactly the tree, and agrees with each
 * SKILL.md (name/description/whenToUse/invocation, and contentOffset slicing
 * the parsed body byte-for-byte). The preset composition checks are gone:
 * this plugin no longer ships a preset.
 *
 * Usage: node validate.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { SUPERPOWERS_SKILLS } from './skill-names.mjs'

const schema = yaml.JSON_SCHEMA

const root = fileURLToPath(new URL('.', import.meta.url))
const SKILLS = join(root, 'skills')

let failures = 0
const fail = (msg) => { failures += 1; console.error('  ✗ ' + msg) }
const ok = (msg) => console.log('  ✓ ' + msg)

// 1. Skill set
console.log('bundled skills:')
const dirs = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, 'SKILL.md')))
const expectedSkills = new Set(SUPERPOWERS_SKILLS)
const bundledSkills = new Set(dirs)
for (const skill of SUPERPOWERS_SKILLS) {
  if (!bundledSkills.has(skill)) fail(`missing bundled skill: ${skill}`)
}
for (const skill of dirs) {
  if (!expectedSkills.has(skill)) fail(`unexpected bundled skill: ${skill}`)
}
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const bodies = new Map()
let count = 0
for (const dir of dirs.sort()) {
  const file = join(SKILLS, dir, 'SKILL.md')
  const buffer = readFileSync(file)
  const text = buffer.toString('utf8')
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) { fail(`${dir}: no YAML frontmatter`); continue }
  const fm = yaml.load(m[1], { schema })
  if (typeof fm?.name !== 'string') { fail(`${dir}: frontmatter missing name`); continue }
  if (typeof fm?.description !== 'string') { fail(`${dir}: frontmatter missing description`); continue }
  if (!kebab.test(fm.name)) { fail(`${dir}: name "${fm.name}" is not kebab-case`); continue }
  if (fm.name !== dir) fail(`${dir}: frontmatter name "${fm.name}" differs from directory name`)
  if (fm['disable-model-invocation'] === true) console.log(`  ! ${dir}: disable-model-invocation: true (model-invisible)`)
  // Same closing-delimiter arithmetic as build.mjs: `\n---\n` is 5 bytes, so
  // contentOffset = (its start) + 5 is the body start.
  const end = buffer.indexOf(Buffer.from('\n---\n'), 4)
  if (end === -1) { fail(`${dir}: frontmatter is not closed`); continue }
  bodies.set(dir, {
    name: fm.name,
    description: fm.description,
    whenToUse: typeof fm.whenToUse === 'string' ? fm.whenToUse : undefined,
    invocation: {
      modelInvocable: fm['disable-model-invocation'] !== true,
      userInvocable: fm['user-invocable'] !== false,
    },
    contentOffset: end + 5,
  })
  ok(`${fm.name}`)
  count += 1
}
console.log(`  total: ${count} skills`)

// 2. Manifest
console.log('skills/manifest.json:')
const manifestFile = join(SKILLS, 'manifest.json')
if (!existsSync(manifestFile)) {
  fail(`missing ${manifestFile}`)
} else {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  if (!Array.isArray(manifest)) {
    fail('manifest is not an array')
  } else {
    ok(`${manifest.length} entries`)
    const manifestNames = new Set()
    for (const entry of manifest) {
      const dir = entry.name
      if (typeof dir !== 'string' || !expectedSkills.has(dir)) {
        fail(`manifest names an unknown skill: ${dir}`)
        continue
      }
      if (manifestNames.has(dir)) { fail(`manifest has duplicate entry: ${dir}`); continue }
      manifestNames.add(dir)
      const actual = bodies.get(dir)
      if (actual === undefined) { fail(`${dir}: manifest entry has no SKILL.md`); continue }
      if (entry.description !== actual.description) {
        fail(`${dir}: manifest description disagrees with SKILL.md`)
      }
      if ((entry.whenToUse ?? undefined) !== actual.whenToUse) {
        fail(`${dir}: manifest whenToUse disagrees with SKILL.md`)
      }
      const invocationMatches = (entry.invocation === undefined)
        ? (actual.invocation.modelInvocable && actual.invocation.userInvocable)
        : (entry.invocation.modelInvocable === actual.invocation.modelInvocable &&
           entry.invocation.userInvocable === actual.invocation.userInvocable)
      if (!invocationMatches) fail(`${dir}: manifest invocation disagrees with SKILL.md`)
      if (entry.contentOffset !== actual.contentOffset) {
        fail(`${dir}: manifest contentOffset ${entry.contentOffset} != ${actual.contentOffset} in SKILL.md`)
      }
      if (entry.file !== `${dir}/SKILL.md`) {
        fail(`${dir}: manifest file must be "${dir}/SKILL.md"`)
        continue
      }
      if (entry.contentOffset < 0 || entry.contentOffset > readFileSync(join(SKILLS, entry.file)).length) {
        fail(`${dir}: manifest contentOffset out of range`)
      }
    }
    for (const dir of SUPERPOWERS_SKILLS) {
      if (!manifestNames.has(dir)) fail(`manifest missing entry: ${dir}`)
    }
  }
}

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} problem(s))`)
process.exit(failures === 0 ? 0 : 1)
