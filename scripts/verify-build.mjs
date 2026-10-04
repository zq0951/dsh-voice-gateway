import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const requiredFiles = [
  'lib/index.js',
  'lib/client.js',
  'lib/client.js.map',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
]

console.log('[check] Verifying build artifacts on disk...')

// 1. Verify disk artifacts
for (const file of requiredFiles) {
  const abs = resolve(process.cwd(), file)
  if (!existsSync(abs)) {
    console.error(`[error] Missing expected artifact on disk: "${file}"`)
    process.exit(1)
  }
  const stat = statSync(abs)
  if (stat.size === 0) {
    console.error(`[error] Artifact on disk is empty (0 bytes): "${file}"`)
    process.exit(1)
  }
  console.log(`  [ok] disk: ${file} (${stat.size} bytes)`)
}

// 2. Verify node stub importability
try {
  // Absolute Windows paths must go through pathToFileURL: the ESM loader rejects
  // a bare "E:\..." specifier with ERR_UNSUPPORTED_ESM_URL_SCHEME.
  const nodeModule = await import(pathToFileURL(resolve(process.cwd(), 'lib/index.js')).href)
  if (typeof nodeModule.apply !== 'function') {
    console.error('[error] lib/index.js does not export apply function')
    process.exit(1)
  }
  console.log('  [ok] import: lib/index.js exports apply function')
} catch (err) {
  console.error('[error] Unable to import lib/index.js:', err)
  process.exit(1)
}

// 3. Verify tarball inclusion via npm pack --dry-run --json
console.log('[check] Verifying tarball package manifest (files whitelist)...')
try {
  // On Windows `npm` is a .cmd shim that execFileSync cannot spawn directly, so
  // prefer the npm CLI entry point that npm itself exports while running scripts.
  const npmCli = process.env.npm_execpath
  const file = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  const args = [
    ...(npmCli ? [npmCli] : []),
    'pack',
    '--dry-run',
    '--json',
  ]
  const rawPackJson = execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const packInfo = JSON.parse(rawPackJson)
  const tarballFiles = new Set((packInfo[0]?.files ?? []).map(f => f.path))

  for (const file of requiredFiles) {
    if (!tarballFiles.has(file)) {
      console.error(`[error] Artifact "${file}" exists on disk but is MISSING from the npm tarball! Check package.json "files" field.`)
      process.exit(1)
    }
    console.log(`  [ok] tarball: ${file}`)
  }
} catch (err) {
  console.error('[error] Failed to inspect npm pack tarball:', err)
  process.exit(1)
}

console.log('[ok] All build and package verifications passed successfully.')
