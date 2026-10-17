# Lategame + sample2 Fixture Bundle

- Source SFC: `presets/lategame.sfc`
- Shared gear DB fixture: `sample2` (`tests/fixtures/gear-db/sample2.sql`)

## Layout

- `recipes/`: one `.sfc` fixture per recipe from `lategame.sfc` (keep uniques removed).
- `keep-uniques/`: one `.sfc` fixture per Keep Uniques rule (full recipe list retained, single keep-unique rule retained).
- `manifest.json`: index mapping source ordinals/names to generated files.

## Counts

- Config fixtures: 194
- Keep Unique fixtures: 22
