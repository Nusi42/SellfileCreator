# Example + sample2 Fixture Bundle

- Source SFR: `examples/example.sfr`
- Shared DB fixture: `tests/data/sample2.db`

## Layout

- `configs/`: one `.sfr` fixture per config from `example.sfr` (keep uniques removed).
- `keep-uniques/`: one `.sfr` fixture per Keep Uniques rule (full config list retained, single keep-unique rule retained).
- `manifest.json`: index mapping source ordinals/names to generated files.

## Counts

- Config fixtures: 194
- Keep Unique fixtures: 22
