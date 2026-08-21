#!/usr/bin/env node
/**
 * validate.mjs — sanity-check the superpowers preset before installing.
 *
 * Parses the composition with the SAME `!!js` YAML dialect the harness loader
 * uses (js-yaml JSON_SCHEMA + the js expression tag), checks that it is a list
 * of named plugin rows, and validates every bundled skill's SKILL.md frontmatter
 * (kebab-case `name` + string `description`).
 *
 * Usage: node validate.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { SUPERPOWERS_SKILLS } from './skill-names.mjs'

// Mirror the loader's dialect: `!!js` scalars become { __jsExpr } expression nodes.
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const schema = yaml.JSON_SCHEMA.extend(JsExpr)

const root = fileURLToPath(new URL('.', import.meta.url))
const PRESET = join(root, 'superpowers')

let failures = 0
const fail = (msg) => { failures += 1; console.error('  ✗ ' + msg) }
const ok = (msg) => console.log('  ✓ ' + msg)

// 1. Composition
console.log('composition agent.cordis.yml:')
const rows = yaml.load(readFileSync(join(PRESET, 'agent.cordis.yml'), 'utf8'), { schema })
if (!Array.isArray(rows)) { fail('not a list of plugin rows'); }
else {
  ok(`${rows.length} rows`)
  const ids = new Set()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') { fail(`row is not an object: ${JSON.stringify(row)}`); continue }
    const id = row.id
    const name = row.name
    if (typeof id !== 'string' || id.length === 0) fail(`row missing string id: ${JSON.stringify(row)}`)
    if (typeof name !== 'string' && !(name && name.__jsExpr)) fail(`row ${id} missing string/!!js name`)
    if (ids.has(id)) fail(`duplicate row id "${id}"`)
    ids.add(id)
    if (row.group === true) {
      if (!Array.isArray(row.config)) fail(`group row ${id} has non-list config`)
    }
  }
  ok(`row ids unique`)
}

// 2. Display metadata
console.log('preset.yml:')
const meta = yaml.load(readFileSync(join(PRESET, 'preset.yml'), 'utf8'), { schema })
if (typeof meta?.name === 'string' && typeof meta?.description === 'string') ok(`name=${meta.name}`)
else fail(`preset.yml needs string name + description: ${JSON.stringify(meta)}`)

// 3. Preset-relative plugin rows must import `node:` builtins only.
//
// `dsh-agent-presets` redirects bare specifiers named in composition ROWS to the
// harness install, but a relative row's own `import` statements resolve through
// Node from the INSTALLED preset directory ($DSH_HOME/.agent-presets/<id>/),
// whose upward `node_modules` walk never reaches the harness. One bare
// `@deepseek-ai/dsh-*` import there throws ERR_MODULE_NOT_FOUND, fails the row,
// and fails the whole mount — the preset stays listed but cannot be selected.
console.log('preset-relative plugin rows:')
const relativeRows = (Array.isArray(rows) ? rows : [])
  .map((row) => row?.name)
  .filter((name) => typeof name === 'string' && name.startsWith('.'))
if (relativeRows.length === 0) ok('no relative rows')
for (const rowName of relativeRows) {
  const file = join(PRESET, rowName)
  if (!existsSync(file)) { fail(`row "${rowName}" has no file at ${file}`); continue }
  const source = readFileSync(file, 'utf8')
  const specifiers = [...source.matchAll(/^\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  const bare = specifiers.filter((s) => !s.startsWith('node:') && !s.startsWith('.') && !s.startsWith('/'))
  if (bare.length > 0) fail(`${rowName} imports bare specifier(s) the installed preset cannot resolve: ${bare.join(', ')}`)
  else ok(`${rowName} imports node: builtins only`)
}

// 4. Skills
console.log('bundled skills:')
const skillsDir = join(PRESET, 'skills')
const dirs = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')))
const expectedSkills = new Set(SUPERPOWERS_SKILLS)
const bundledSkills = new Set(dirs)
for (const skill of SUPERPOWERS_SKILLS) {
  if (!bundledSkills.has(skill)) fail(`missing bundled skill: ${skill}`)
}
for (const skill of dirs) {
  if (!expectedSkills.has(skill)) fail(`unexpected bundled skill: ${skill}`)
}
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
let count = 0
for (const dir of dirs.sort()) {
  const text = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8')
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) { fail(`${dir}: no YAML frontmatter`); continue }
  const fm = yaml.load(m[1], { schema })
  if (typeof fm?.name !== 'string') { fail(`${dir}: frontmatter missing name`); continue }
  if (typeof fm?.description !== 'string') { fail(`${dir}: frontmatter missing description`); continue }
  if (!kebab.test(fm.name)) { fail(`${dir}: name "${fm.name}" is not kebab-case`); continue }
  if (fm.name !== dir) console.log(`  ! ${dir}: frontmatter name "${fm.name}" differs from directory name`)
  if (fm['disable-model-invocation'] === true) console.log(`  ! ${dir}: disable-model-invocation: true (model-invisible)`)
  ok(`${fm.name}`)
  count += 1
}
console.log(`  total: ${count} skills`)

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} problem(s))`)
process.exit(failures === 0 ? 0 : 1)
