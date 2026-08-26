#!/usr/bin/env node
/**
 * validate.mjs — sanity-check the bundled Superpowers skills before publishing.
 *
 * Skills are now discovered at runtime (see lib/skills.mjs) by scanning
 * `skills/<name>/SKILL.md`, so this script verifies the tree the provider will
 * observe: every directory that carries a SKILL.md opens with a YAML frontmatter
 * block holding a kebab-case `name` and string `description`, and that
 * frontmatter `name` matches the directory name. Extra/custom skills are
 * allowed — they are picked up automatically — and the build artifacts that
 * used to be validated (skills/manifest.json) are gone, since the runtime no
 * longer reads them.
 *
 * Usage: node validate.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const schema = yaml.JSON_SCHEMA

const root = fileURLToPath(new URL('.', import.meta.url))
const SKILLS = join(root, 'skills')

let failures = 0
const fail = (msg) => { failures += 1; console.error('  ✗ ' + msg) }
const ok = (msg) => console.log('  ✓ ' + msg)

// Dirs that carry a SKILL.md are candidate skills (the provider's discovery
// rule); a dir without one is simply not a skill and is not an error.
console.log('bundled skills:')
const dirs = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, 'SKILL.md')))
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
let count = 0
for (const dir of dirs.sort()) {
  const file = join(SKILLS, dir, 'SKILL.md')
  const text = readFileSync(file).toString('utf8')
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) { fail(`${dir}: SKILL.md has no YAML frontmatter`); continue }
  const fm = yaml.load(m[1], { schema })
  if (typeof fm?.name !== 'string' || fm.name.length === 0) { fail(`${dir}: frontmatter missing name`); continue }
  if (typeof fm?.description !== 'string' || fm.description.length === 0) { fail(`${dir}: frontmatter missing description`); continue }
  if (!kebab.test(fm.name)) { fail(`${dir}: name "${fm.name}" is not kebab-case`); continue }
  if (fm.name !== dir) fail(`${dir}: frontmatter name "${fm.name}" differs from directory name`)
  if (fm['disable-model-invocation'] === true) console.log(`  ! ${dir}: disable-model-invocation: true (model-invisible)`)
  ok(`${fm.name}`)
  count += 1
}
console.log(`  total: ${count} skills`)

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} problem(s))`)
process.exit(failures === 0 ? 0 : 1)
