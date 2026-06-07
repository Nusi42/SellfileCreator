const CHAMPION_ICON_MODULES = import.meta.glob('../../../ico/champs/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const CHAMPION_ICON_MAP = new Map<number, string>();

for (const [path, src] of Object.entries(CHAMPION_ICON_MODULES)) {
  const match = path.match(/\/(\d+)\.webp$/);
  if (!match) continue;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) continue;
  CHAMPION_ICON_MAP.set(id, src);
}

// Sheep easter egg: ~10% of champ icons swapped to a sheep, decided once at startup
// so the set stays stable for the whole session.
// Active on: Feb 4, Apr 1, Apr 2, Apr 19, Apr 20.
const SHEEP_CHAMP_ID = 700000;
const _today = new Date();
const _m = _today.getMonth(); // 0-based
const _d = _today.getDate();
const _isSheepDay =
  (_m === 1 && _d === 4) || // Feb 4
  (_m === 3 && (_d === 1 || _d === 2 || _d === 19 || _d === 20)); // Apr 1/2/19/20
if (_isSheepDay) {
  const sheepUrl = CHAMPION_ICON_MAP.get(SHEEP_CHAMP_ID);
  if (sheepUrl) {
    for (const [id] of CHAMPION_ICON_MAP) {
      // leave the sheep entry itself alone so it resolves normally
      if (id !== SHEEP_CHAMP_ID && Math.random() < 0.1) {
        CHAMPION_ICON_MAP.set(id, sheepUrl);
      }
    }
  }
}

export function championIconUrl(id?: number | null): string | undefined {
  if (id === undefined || id === null) return undefined;
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return CHAMPION_ICON_MAP.get(numeric);
}
