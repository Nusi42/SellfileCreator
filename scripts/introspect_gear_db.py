#!/usr/bin/env python3
"""
Utility for inspecting the RSL Helper gear SQLite database.

The script dumps table schemas, index metadata, and a limited sample of rows
so we can map the raw fields onto Sellfile Creator domain models.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Sequence


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect a gear SQLite database and emit a JSON summary.",
    )
    parser.add_argument("db_path", type=Path, help="Path to the SQLite database file.")
    parser.add_argument(
        "--sample",
        type=int,
        default=10,
        help="Maximum number of sample rows to capture per table (default: 10).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("tmp/gear-db-inspection"),
        help="Directory to store the inspection output (default: tmp/gear-db-inspection).",
    )
    return parser.parse_args()


def serialize_value(value: Any) -> Any:
    """Convert SQLite values into JSON-serializable structures."""
    if isinstance(value, bytes):
        preview = base64.b64encode(value[:24]).decode("ascii")
        return {"__type": "bytes", "length": len(value), "preview_b64": preview}
    if isinstance(value, memoryview):
        return serialize_value(bytes(value))
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    return value


def normalize_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert a sqlite3.Row into a plain dict while preserving column order."""
    return {key: serialize_value(row[key]) for key in row.keys()}


def fetch_all(cursor: sqlite3.Cursor) -> List[Dict[str, Any]]:
    rows = cursor.fetchall()
    return [normalize_dict(row) for row in rows]


def escape_identifier(identifier: str) -> str:
    """Escape single quotes inside identifiers used in string SQL statements."""
    return identifier.replace("'", "''")


def collect_table_details(
    conn: sqlite3.Connection,
    name: str,
    sample_size: int,
) -> Dict[str, Any]:
    table: Dict[str, Any] = {"name": name}

    escaped_name = escape_identifier(name)

    pragma_stmt = f"PRAGMA table_info('{escaped_name}')"
    columns_cursor = conn.execute(pragma_stmt)
    table["columns"] = fetch_all(columns_cursor)

    count_stmt = f"SELECT COUNT(1) AS row_count FROM '{escaped_name}'"
    table["row_count"] = conn.execute(count_stmt).fetchone()[0]

    sample_stmt = f"SELECT * FROM '{escaped_name}' LIMIT ?"
    sample_cursor = conn.execute(sample_stmt, (sample_size,))
    table["sample_rows"] = fetch_all(sample_cursor)

    index_list_stmt = f"PRAGMA index_list('{escaped_name}')"
    index_rows = fetch_all(conn.execute(index_list_stmt))
    enriched_indexes: List[Dict[str, Any]] = []
    for index in index_rows:
        index_name = index.get("name")
        if not index_name:
            continue
        info_stmt = f"PRAGMA index_info('{escape_identifier(index_name)}')"
        info_rows = fetch_all(conn.execute(info_stmt))
        index["columns"] = [info_row.get("name") for info_row in info_rows]
        enriched_indexes.append(index)
    table["indexes"] = enriched_indexes

    fk_list_stmt = f"PRAGMA foreign_key_list('{escaped_name}')"
    table["foreign_keys"] = fetch_all(conn.execute(fk_list_stmt))

    return table


def resolve_views(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cursor = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type = 'view' ORDER BY name",
    )
    return fetch_all(cursor)


def resolve_tables(conn: sqlite3.Connection) -> Sequence[str]:
    cursor = conn.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    return [row["name"] for row in cursor.fetchall()]


def build_summary(
    conn: sqlite3.Connection,
    db_path: Path,
    sample_size: int,
) -> Dict[str, Any]:
    tables = [
        collect_table_details(conn, name, sample_size) for name in resolve_tables(conn)
    ]
    views = resolve_views(conn)
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "database_path": str(db_path.resolve()),
        "database_size_bytes": db_path.stat().st_size,
        "sqlite_version": conn.execute("SELECT sqlite_version()").fetchone()[0],
        "tables": tables,
        "views": views,
    }


def main() -> None:
    args = parse_args()
    if not args.db_path.exists():
        raise SystemExit(f"Database not found: {args.db_path}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(f"file:{args.db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        summary = build_summary(conn, args.db_path, sample_size=args.sample)
    finally:
        conn.close()

    output_path = args.out_dir / (args.db_path.stem + ".schema.json")
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print(f"Wrote inspection summary to {output_path}")


if __name__ == "__main__":
    main()
