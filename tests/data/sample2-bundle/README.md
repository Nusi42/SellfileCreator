# Example + sample2 Fixture Bundle

- Source SFC: `examples/example.sfc`
- Shared DB fixture: `tests/data/sample2.db`

## Layout

- `recipes/`: one `.sfc` fixture per recipe from `example.sfc` (keep uniques removed).
- `keep-uniques/`: one `.sfc` fixture per Keep Uniques rule (full recipe list retained, single keep-unique rule retained).
- `manifest.json`: index mapping source ordinals/names to generated files.

## Counts

- Config fixtures: 194
- Keep Unique fixtures: 22
