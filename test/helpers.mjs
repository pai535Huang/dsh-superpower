import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

export async function copyValidationProject(destination) {
  await mkdir(destination, { recursive: true })
  await cp(join(repoRoot, 'validate.mjs'), join(destination, 'validate.mjs'))
  await cp(join(repoRoot, 'skill-names.mjs'), join(destination, 'skill-names.mjs'))
  await cp(join(repoRoot, 'superpowers'), join(destination, 'superpowers'), { recursive: true })
  await installLocalJsYamlProxy(destination)
}

export async function installLocalJsYamlProxy(projectRoot) {
  const require = createRequire(import.meta.url)
  const realJsYaml = require.resolve('js-yaml')
  const packageRoot = join(projectRoot, 'node_modules', 'js-yaml')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: 'js-yaml',
    version: '0.0.0-test-proxy',
    main: 'index.cjs',
  }))
  await writeFile(join(packageRoot, 'index.cjs'), [
    "process.stdout.write('LOCAL_JS_YAML_PROXY_LOADED\\n')",
    `module.exports = require(${JSON.stringify(realJsYaml)})`,
    '',
  ].join('\n'))
}
