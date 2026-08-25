import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyBootstrap } from './bootstrap.mjs'
import { loadSkillDefinitions, registerSkills } from './skills.mjs'

export const name = 'dsh-superpower'
export const inject = ['skills', 'tools']

/** The legacy preset id this plugin used to own (directory under .agent-presets). */
const LEGACY_PRESET_ID = 'superpowers'

export function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  if (!configured) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return join(homedir(), configured.slice(2))
  }
  return configured
}

/** The bundled skills directory shipped with this plugin package. */
export function bundledSkillsRoot() {
  return fileURLToPath(new URL('../skills/', import.meta.url))
}

/**
 * One-time migration of the preset-based install the previous plugin version
 * maintained. The plugin OWNS this directory (old sync/install.sh wrote it),
 * so removal is safe; user files are never touched. A settings-default still
 * naming the removed preset is warned about — the plugin never edits settings.
 */
function migrateLegacyInstall(home, logger) {
  const legacy = join(home, '.agent-presets', LEGACY_PRESET_ID)
  if (existsSync(legacy)) {
    rmSync(legacy, { recursive: true, force: true })
    logger?.info?.(`dsh-superpower: removed legacy preset install at ${legacy}`)
  }
  const settings = join(home, 'settings.yaml')
  if (existsSync(settings)) {
    const text = readFileSync(settings, 'utf8')
    if (/\bdefault\s*:\s*['"]?superpowers['"]?\s*(?:,|\}|$)/m.test(text)) {
      logger?.warn?.(
        'dsh-superpower: settings.yaml still names "superpowers" as the default preset (agent-presets.default); ' +
        'select another preset (e.g. standard) in the GUI or edit the setting',
      )
    }
  }
}

export function apply(ctx) {
  try {
    migrateLegacyInstall(dshHome(), ctx.logger)
  } catch (error) {
    ctx.logger?.warn?.(`dsh-superpower: legacy migration failed: ${String(error?.message ?? error)}`)
  }

  try {
    const definitions = loadSkillDefinitions(bundledSkillsRoot())
    const count = registerSkills(ctx, definitions)
    ctx.logger?.info?.(`dsh-superpower: registered ${count} skills in the global skill layer`)
  } catch (error) {
    ctx.logger?.warn?.(`dsh-superpower: skill registration failed: ${String(error?.message ?? error)}`)
  }

  try {
    applyBootstrap(ctx)
  } catch (error) {
    ctx.logger?.warn?.(`dsh-superpower: bootstrap setup failed: ${String(error?.message ?? error)}`)
  }
}
