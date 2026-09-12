/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve as resolvePath } from 'node:path'
import process from 'node:process'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const PLUGIN_ID = '@xp1024/dsh-voice-gateway'

/**
 * DSH 8 official baseline external modules provided by host module loader:
 * react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
 * dsh-client-store, dsh-client-ui-slots, dsh-client-ui-primitives.
 */
const BASELINE_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'dsh-client-store',
  'dsh-client-ui-slots',
  'dsh-client-ui-primitives',
])

function isExternal(specifier: string): boolean {
  if (BASELINE_EXTERNALS.has(specifier)) return true
  for (const base of BASELINE_EXTERNALS) {
    if (specifier.startsWith(`${base}/`)) return true
  }
  return false
}

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const cssFiles = new Map<string, string>()

function styleInjectionModule(
  id: string,
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/** 1. Node host stub build configuration (lib/index.js) */
const nodeHostConfig: UserConfig = {
  name: `${PLUGIN_ID}/host`,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

/** 2. Browser client bundle build configuration (lib/client.js) */
const browserClientConfig: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  sourcemap: true,
  dts: false,
  clean: false,
  deps: {
    neverBundle: isExternal,
    alwaysBundle: (specifier: string) => !isExternal(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [
    {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? resolvePath(dirname(importer), source) : resolvePath(source)
        const rel = relative(process.cwd(), abs).split('\\').join('/')
        cssFiles.set(rel, abs)
        return CSS_VIRTUAL_PREFIX + rel + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const rel = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const fileId = cssFiles.get(rel) ?? resolvePath(process.cwd(), rel)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        const exportEntries = Object.entries(cssExports ?? {})
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        for (const [local, exp] of exportEntries) {
          classMap[local] = exp.name
        }
        return styleInjectionModule(PLUGIN_ID, fileId, code.toString(), classMap)
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([nodeHostConfig, browserClientConfig])
