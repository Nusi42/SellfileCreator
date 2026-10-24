/**
 * roster-anonymizer — strip champion identity from committed test data.
 *
 * Gear-DB fixtures and endpoint captures come from real accounts. Their gear is what the
 * tests exercise, but their champions would tell anyone (a PvP opponent, say) which
 * champions an account owns, how far they are built, and — through the gear they wear —
 * how fast they are. So every champion keeps only what keep/sell decisions read:
 *
 *   kept     : instance id, storage location (Vault / RVault / inStorage / inBathhouse),
 *              the gear links (artifact cID, slot maps, ArtifactByHeroID), lock/marker flags
 *   replaced : type, name, rarity, affinity, faction, ascension, stars, level, empowerment,
 *              blessing, masteries, skills, stats, power, timestamps, team-usage history
 *
 * Replacement values are drawn from a PRNG seeded with the instance id alone, so they say
 * nothing about the real champion, and the same champion gets the same fake identity in a
 * gear DB and in a capture of the same account. Fake champions are synthetic ("Champion
 * 0412" with a random type id), never drawn from a list of real champions. Running the
 * anonymizer twice gives the same result.
 *
 * Used by scripts/test/gear-db-fixtures.mjs (dump) and scripts/test/capture-fixtures.mjs
 * (pack); nothing in the app imports it.
 */
import { DatabaseSync } from 'node:sqlite'

// 32-bit FNV-1a: a stable string hash for seeding (same result on every platform).
function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// mulberry32: tiny deterministic PRNG returning floats in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Integer in [min, max], inclusive.
const intIn = (rand, min, max) => min + Math.floor(rand() * (max - min + 1))
// Pick from weighted [value, weight] pairs.
function weighted(rand, pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0)
  let roll = rand() * total
  for (const [value, w] of pairs) {
    roll -= w
    if (roll < 0) return value
  }
  return pairs[pairs.length - 1][0]
}

// Rough real-roster shapes so analytics views still see a plausible spread.
const RARITY_WEIGHTS = [[1, 4], [2, 8], [3, 32], [4, 30], [5, 23], [6, 3]]
const GRADE_WEIGHTS = [[1, 2], [2, 3], [3, 15], [4, 15], [5, 15], [6, 50]]
// Game ticks (100 ns since 0001-01-01) between 2021 and 2026, kept at 15 significant
// digits so a JSON round trip through a double never changes them.
const TICKS_MIN = 637_450_000_000_000_000
const TICKS_SPAN = 1_800_000_000_000_000
const fakeTicks = (rand) => Math.floor((TICKS_MIN + rand() * TICKS_SPAN) / 10_000) * 10_000

/**
 * The fake identity of champion instance `id`. Every field is derived from the id alone,
 * so it is stable across files and independent of the real champion.
 */
export function fakeChampion(id) {
  const rand = mulberry32(fnv1a(`sfc-roster:${id}`))
  // Base type ids are multiples of 10; the last digit is the ascension level.
  const baseId = intIn(rand, 1, 999) * 10
  const ascension = intIn(rand, 0, 6)
  const grade = weighted(rand, GRADE_WEIGHTS)
  // Level cap is grade × 10; built champions sit at the cap most of the time.
  const level = rand() < 0.7 ? grade * 10 : intIn(rand, 1, grade * 10)
  const rarity = weighted(rand, RARITY_WEIGHTS)
  const blessingGrade = rarity >= 4 && rand() < 0.4 ? intIn(rand, 1, 6) : 0
  return {
    baseId,
    heroId: baseId + ascension,
    name: `Champion ${String(baseId / 10).padStart(4, '0')}`,
    rarity,
    affinity: intIn(rand, 1, 4),
    faction: intIn(rand, 1, 16),
    grade,
    level,
    empower: rarity >= 4 && rand() < 0.3 ? intIn(rand, 1, 4) : 0,
    blessingGrade,
    // Blessing ids look like 1101…4302 (group, blessing, variant).
    blessingId: blessingGrade > 0 ? intIn(rand, 1, 4) * 1000 + intIn(rand, 1, 3) * 100 + intIn(rand, 1, 2) : 0,
    role: intIn(rand, 0, 4),
    stats: {
      HP: intIn(rand, 9_000, 55_000),
      ATK: intIn(rand, 600, 4_000),
      DEF: intIn(rand, 600, 4_000),
      CritRate: intIn(rand, 15, 25),
      CritDamage: intIn(rand, 50, 160),
      ACC: intIn(rand, 0, 300),
      RES: intIn(rand, 30, 300),
      SPD: intIn(rand, 85, 135),
    },
    power: intIn(rand, 20_000, 120_000),
    battleTicks: fakeTicks(rand),
    rand,
  }
}

// ── RSL Helper gear DB (`Champs` table) ─────────────────────────────────────────

// Champs columns that only describe who the champion is; anything not listed (ID, the
// location flags, the per-slot gear columns) is kept as exported.
const champsColumnValues = (fake, row) => ({
  HeroID: fake.heroId,
  BaseHeroID: fake.baseId,
  Name: fake.name,
  Rang: fake.grade,
  Lvl: fake.level,
  EmpLvl: fake.empower,
  Rarity: fake.rarity,
  Affinity: fake.affinity,
  Fraction: fake.faction,
  BGrade: fake.blessingGrade,
  BId: fake.blessingId,
  Br: 0,
  Role: fake.role,
  ...fake.stats,
  // Zero means "never" in these columns; keep that, replace real values.
  Power: row.Power ? fake.power : row.Power,
  RecentBattleTicks: row.RecentBattleTicks ? BigInt(fake.battleTicks) : row.RecentBattleTicks,
  // How often the champion was used in team slots says which champions are played.
  UsedT1: 0, UsedT2: 0, UsedT3: 0,
})

/** Anonymize the `Champs` table of the gear DB at `dbPath` in place; returns the row count. */
export function anonymizeGearDbChampions(dbPath) {
  const db = new DatabaseSync(dbPath, { readBigInts: true })
  try {
    const hasChamps = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Champs'").get()
    if (!hasChamps) return 0
    const columns = new Set(db.prepare('PRAGMA table_info(Champs)').all().map((c) => c.name))
    // rowid addresses each row even in exports whose ID column is not the primary key.
    const rows = db.prepare('SELECT rowid AS sfc_rowid, * FROM Champs').all()
    db.exec('BEGIN')
    for (const row of rows) {
      const fake = fakeChampion(Number(row.ID))
      // Older exports lack some columns; only write the ones this table has.
      const values = Object.entries(champsColumnValues(fake, row)).filter(([col]) => columns.has(col))
      const sets = values.map(([col]) => `"${col}" = ?`).join(', ')
      db.prepare(`UPDATE Champs SET ${sets} WHERE rowid = ?`).run(...values.map(([, v]) => v), row.sfc_rowid)
    }
    db.exec('COMMIT')
    return rows.length
  } finally {
    db.close()
  }
}

// ── Endpoint captures (`champions` JSON-RPC frames) ─────────────────────────────

// Mastery ids look like 500<tree 1-3><tier 1-6><slot 1-4>.
const fakeMasteryId = (rand) => 500_000 + intIn(rand, 1, 3) * 100 + intIn(rand, 1, 6) * 10 + intIn(rand, 1, 4)

/** Anonymize one champion object of a `champions` frame; fields it lacks stay absent. */
export function anonymizeWsChampion(champion) {
  const fake = fakeChampion(champion.id)
  const out = { ...champion }
  // Replace only the keys the frame carries, so sparse and rich frames keep their shape.
  const replace = (key, value) => { if (key in out) out[key] = value }
  replace('typeId', fake.heroId)
  replace('grade', fake.grade)
  replace('level', fake.level)
  replace('empower', fake.empower)
  replace('Name', fake.name)
  replace('Rarity', fake.rarity)
  replace('Affinity', fake.affinity)
  replace('exp', 0)
  replace('fullExp', fake.level * 60_000)
  replace('power', out.power == null ? out.power : fake.power)
  replace('recentBattleTicks', out.recentBattleTicks ? fake.battleTicks : out.recentBattleTicks)
  // Live-arena and claim times say when (and whether) a champion is played.
  replace('recentLiveArenaBattleTicks', null)
  replace('claimDateTicks', null)
  if (Array.isArray(out.skills)) {
    // Skill type ids are derived from the champion type (2060 → 20601…); levels are build info.
    out.skills = out.skills.map((s, i) => ({ ...s, t: fake.baseId * 10 + i + 1, l: intIn(fake.rand, 1, 6) }))
  }
  if (out.mastery && Array.isArray(out.mastery.m)) {
    // Same number of masteries (keeps frame sizes realistic), random picks.
    out.mastery = { ...out.mastery, m: out.mastery.m.map(() => fakeMasteryId(fake.rand)) }
  }
  if (out.doubleAscend && typeof out.doubleAscend === 'object') {
    out.doubleAscend = { ...out.doubleAscend, grade: fake.blessingGrade, blessingId: fake.blessingId }
  }
  return out
}

// Indentation of a JSON text as written (frames are 2-space pretty or minified).
function jsonIndentOf(text) {
  const match = /^\{\r?\n( +|\t+)/.exec(text)
  return match ? match[1] : 0
}

/**
 * Anonymize one capture file's text. `champions` frames get fake champions (re-serialized
 * with their original indentation); the console log loses champion type ids; every other
 * frame is returned unchanged, byte for byte.
 */
export function anonymizeCaptureText(fileName, text) {
  if (fileName.endsWith('.log')) {
    // Diagnostics such as "[champion-static] … baseHeroId=10660 (heroId=10660)" name types.
    return text.replace(/\b(baseHeroId|heroId|typeId)=\d+/gi, '$1=0')
  }
  if (!/^\s*\{/.test(text) || !/"champions"\s*:\s*\[/.test(text)) return text
  const frame = JSON.parse(text)
  const champions = frame?.params?.champions
  if (!Array.isArray(champions)) return text
  frame.params.champions = champions.map((c) => (c && typeof c === 'object' && 'id' in c ? anonymizeWsChampion(c) : c))
  return JSON.stringify(frame, null, jsonIndentOf(text)) + (text.endsWith('\n') ? '\n' : '')
}
