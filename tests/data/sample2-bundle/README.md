# Example + sample2 Fixture Bundle

- Source HSFC: `examples/example.hsfc`
- Shared DB fixture: `tests/data/sample2.db`

## Layout

- `configs/`: one `.hsfc` fixture per config from `example.hsfc` (keep uniques removed).
- `keep-uniques/`: one `.hsfc` fixture per Keep Uniques rule (full config list retained, single keep-unique rule retained).
- `manifest.json`: index mapping source ordinals/names to generated files.

## Counts

- Config fixtures: 194
- Keep Unique fixtures: 22
