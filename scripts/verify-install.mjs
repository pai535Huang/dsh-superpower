#!/usr/bin/env node
import { join } from 'node:path'

import { bundledPresetRoot, dshHome, verifyPreset } from '../lib/index.js'

const target = process.argv[2] ?? join(dshHome(), '.agent-presets', 'superpowers')
const report = verifyPreset(bundledPresetRoot(), target)
if (report.status === 'ok') {
  console.log(`✓ superpowers: current at ${target}`)
} else if (report.status === 'missing') {
  console.error(`✗ superpowers: missing at ${target}`)
  process.exitCode = 1
} else {
  console.error(`✗ superpowers: stale at ${target}`)
  for (const file of report.differing) console.error(`  differs: ${file}`)
  for (const file of report.extra) console.error(`  extra: ${file}`)
  process.exitCode = 1
}
