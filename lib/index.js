import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-superpower'

const PRESET_ID = 'superpowers'

export function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  if (!configured) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return join(homedir(), configured.slice(2))
  }
  return configured
}

export function bundledPresetRoot() {
  return fileURLToPath(new URL('../superpowers/', import.meta.url))
}

function assertCompletePreset(source) {
  for (const required of ['agent.cordis.yml', 'preset.yml']) {
    if (!existsSync(join(source, required))) {
      throw new Error(`preset source is missing ${required}: ${source}`)
    }
  }
}

function filesUnder(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error(`preset contains an unsupported filesystem entry: ${path}`)
    }
  }
  visit(root)
  return files
}

function sameBytes(left, right) {
  return readFileSync(left).equals(readFileSync(right))
}

function tightenPermissions(root) {
  const visit = (path) => {
    const info = lstatSync(path)
    if (info.isDirectory()) {
      chmodSync(path, 0o700)
      for (const entry of readdirSync(path)) visit(join(path, entry))
      return
    }
    if (!info.isFile()) throw new Error(`preset contains an unsupported filesystem entry: ${path}`)
    chmodSync(path, info.mode & 0o100 ? 0o700 : 0o600)
  }
  visit(root)
}

export function verifyPreset(source, target) {
  assertCompletePreset(source)
  if (!existsSync(target) || !lstatSync(target).isDirectory()) {
    return { status: 'missing', differing: [], extra: [] }
  }

  const sourceFiles = filesUnder(source)
  const targetFiles = filesUnder(target)
  const sourceSet = new Set(sourceFiles.map((file) => relative(source, file)))
  const targetSet = new Set(targetFiles.map((file) => relative(target, file)))
  const differing = []
  for (const file of sourceSet) {
    const installed = join(target, file)
    if (!targetSet.has(file) || !sameBytes(join(source, file), installed)) differing.push(file)
  }
  const extra = [...targetSet].filter((file) => !sourceSet.has(file))
  return {
    status: differing.length === 0 && extra.length === 0 ? 'ok' : 'stale',
    differing: differing.sort(),
    extra: extra.sort(),
  }
}

export function syncPreset(source, target) {
  assertCompletePreset(source)
  const report = verifyPreset(source, target)
  if (report.status === 'ok') {
    tightenPermissions(target)
    return 'current'
  }

  const parent = dirname(target)
  mkdirSync(parent, { recursive: true })
  const staging = join(parent, `.${basename(target)}.tmp-${process.pid}-${Date.now()}`)
  try {
    rmSync(staging, { recursive: true, force: true })
    cpSync(source, staging, { recursive: true, preserveTimestamps: true })
    tightenPermissions(staging)
    rmSync(target, { recursive: true, force: true })
    renameSync(staging, target)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return 'synced'
}

export function apply(ctx) {
  const source = bundledPresetRoot()
  const target = join(dshHome(), '.agent-presets', PRESET_ID)
  try {
    const status = syncPreset(source, target)
    if (status === 'synced') ctx.logger?.info?.(`dsh-superpower: preset synced into ${target}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn?.(`dsh-superpower: preset sync failed: ${message}`)
  }
}
