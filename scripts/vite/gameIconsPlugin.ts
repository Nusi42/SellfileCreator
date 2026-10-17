import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { searchForWorkspaceRoot, type Plugin } from 'vite'

/**
 * gameIconsPlugin — serves `virtual:game-icons`, the ONLY place the build touches game art.
 *
 * The game's artwork (champion portraits, faction crests, set and set-slot icons, slot
 * glyphs) is not part of the repository. It lives in an
 * asset pack whose root is named by `SFC_GAME_ASSETS_DIR` (usually set in the
 * gitignored `.env.local`). The pack mirrors the old in-repo layout:
 *
 *   <pack>/ico/champs/<heroId>.webp     champion portraits
 *   <pack>/ico/faction/<stem>.webp      faction crests
 *   <pack>/ico/sets/<Set_Name>.webp     set icons (plus Spider.webp, the no-set marker)
 *   <pack>/ico/sets/slots/<Key>.webp    set x slot icons (e.g. Speed_Boots)
 *   <pack>/ico/slots/slot-glyphs.json   slot glyph SVG data: { Weapon: { viewBox, path }, ... }
 *
 * With a pack, the module statically imports every image, so Vite inlines (app build) or
 * emits (web build, `ico/<group>/` → `img/<group>/`) them exactly like regular assets.
 * Without one, it exports empty maps and `configured = false`; the icon maps then fall
 * back to the project's own placeholder art (src/lib/iconMaps/gameIcons.ts).
 */
export const GAME_ICONS_MODULE_ID = 'virtual:game-icons'
// Rollup convention: a leading NUL marks a virtual module so other plugins leave it alone.
const RESOLVED_ID = `\0${GAME_ICONS_MODULE_ID}`

// Image groups: export name → pack subfolder (posix, relative to <pack>/ico).
const IMAGE_GROUPS = {
  champions: 'champs',
  factions: 'faction',
  sets: 'sets',
  setSlots: 'sets/slots',
} as const

const IMAGE_EXT = /\.(webp|png|svg)$/i

export type GameIconsPluginOptions = {
  /** Pack root (the folder that contains `ico/`); `undefined`/empty ⇒ placeholder build. */
  assetsDir: string | undefined
  /** Fail the build when no pack is configured (release builds). */
  require?: boolean
}

// Image files of one pack group, sorted so the generated module is stable across runs.
const listImages = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE_EXT.test(f)).sort() : []

// Generate the module source for a configured pack.
function packModule(icoDir: string): string {
  const imports: string[] = []
  const groups: string[] = []
  let n = 0
  for (const [exportName, sub] of Object.entries(IMAGE_GROUPS)) {
    const entries: string[] = []
    for (const file of listImages(join(icoDir, sub))) {
      const local = `i${n++}`
      // Forward slashes keep the absolute import valid on Windows too.
      imports.push(`import ${local} from ${JSON.stringify(join(icoDir, sub, file).replace(/\\/g, '/'))}`)
      entries.push(`${JSON.stringify(basename(file, extname(file)))}: ${local}`)
    }
    // Pure, so a bundle that never reads a group drops it (and its image imports) entirely.
    groups.push(`export const ${exportName} = /* @__PURE__ */ Object.freeze({ ${entries.join(', ')} })`)
  }
  const glyphFile = join(icoDir, 'slots', 'slot-glyphs.json')
  const glyphs = existsSync(glyphFile) ? readFileSync(glyphFile, 'utf8') : '{}'
  return [
    ...imports,
    'export const configured = true',
    ...groups,
    `export const slotGlyphs = /* @__PURE__ */ Object.freeze(${glyphs.trim()})`,
  ].join('\n')
}

// Module source for a clone without the pack: empty maps, placeholders take over.
const EMPTY_MODULE = [
  'export const configured = false',
  ...Object.keys(IMAGE_GROUPS).map((name) => `export const ${name} = Object.freeze({})`),
  'export const slotGlyphs = Object.freeze({})',
].join('\n')

export function gameIconsPlugin({ assetsDir, require = false }: GameIconsPluginOptions): Plugin {
  const icoDir = assetsDir ? join(assetsDir, 'ico') : undefined
  const configured = icoDir !== undefined && existsSync(icoDir)
  return {
    name: 'game-icons',
    config(userConfig) {
      if (!configured) return undefined
      // The dev server only serves files under fs.allow; an explicit list replaces Vite's
      // default, so keep the workspace root next to the pack.
      const allow = userConfig.server?.fs?.allow ?? [searchForWorkspaceRoot(process.cwd())]
      return { server: { fs: { allow: [...allow, icoDir] } } }
    },
    configResolved(config) {
      if (require && !configured) {
        throw new Error('[game-icons] SFC_GAME_ASSETS_DIR must name the asset pack for this build '
          + `(got ${assetsDir ? `"${assetsDir}", which has no ico/ folder` : 'nothing'}).`)
      }
      config.logger.info(`[game-icons] ${configured ? 'using the asset pack' : 'no asset pack configured: placeholder icons'}`)
    },
    resolveId(id) {
      return id === GAME_ICONS_MODULE_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      return configured ? packModule(icoDir) : EMPTY_MODULE
    },
  }
}
