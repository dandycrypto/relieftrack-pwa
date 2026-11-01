#!/usr/bin/env python3
"""Validate a ReliefTrack Supabase REST backup directory."""
import json
import os
import sys
from pathlib import Path

REQUIRED_TABLES = [
    "profiles",
    "records",
    "settings",
    "drive_connections",
    "lhdn_categories",
]


def main(backup_dir: str) -> int:
    path = Path(backup_dir)
    if not path.is_dir():
        print(f"FAIL: not a directory: {path}")
        return 1

    failures = 0

    for table in REQUIRED_TABLES:
        f = path / f"{table}.json"
        if not f.exists():
            print(f"FAIL {table}: missing file")
            failures += 1
            continue
        try:
            data = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"FAIL {table}: invalid JSON ({e})")
            failures += 1
            continue
        if not isinstance(data, list):
            print(f"FAIL {table}: expected a JSON array, got {type(data).__name__}")
            failures += 1
            continue
        print(f"OK   {table}: {len(data)} rows")

    # auth users (nested under "users")
    f = path / "auth_users.json"
    if not f.exists():
        print("FAIL auth_users: missing file")
        failures += 1
    else:
        try:
            data = json.loads(f.read_text())
            users = data.get("users", []) if isinstance(data, dict) else data
            print(f"OK   auth_users: {len(users)} users")
        except json.JSONDecodeError as e:
            print(f"FAIL auth_users: invalid JSON ({e})")
            failures += 1

    if failures:
        print(f"\nRESULT: {failures} failure(s)")
        return 1

    print("\nRESULT: all files valid")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
