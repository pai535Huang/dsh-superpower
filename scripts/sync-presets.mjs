#!/usr/bin/env node
import { join } from 'node:path'

import { bundledPresetRoot, dshHome, syncPreset } from '../lib/index.js'

const target = process.argv[2] ?? join(dshHome(), '.agent-presets', 'superpowers')
try {
  const status = syncPreset(bundledPresetRoot(), target)
  console.log(`superpowers: ${status} at ${target}`)
} catch (error) {
  console.error(`superpowers: sync failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
