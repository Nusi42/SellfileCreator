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

export function championIconUrl(id?: number | null): string | undefined {
  if (id === undefined || id === null) return undefined;
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return CHAMPION_ICON_MAP.get(numeric);
}
