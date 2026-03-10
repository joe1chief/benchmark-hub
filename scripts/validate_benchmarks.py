#!/usr/bin/env python3
"""
Validate client/public/benchmarks.json for structural integrity.

Checks:
  1. Valid JSON
  2. Required fields present (name, l1, year)
  3. No duplicate names
  4. l1 values are from the allowed set (Chinese values as used in data)
  5. year format is YYYY or YYYY-MM
  6. related_benchmarks only reference existing names
  7. mermaid_flowchart is a string or null
  8. openness is from the allowed set (lowercase as used in data)
"""

import json
import re
import sys
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "client" / "public" / "benchmarks.json"

# Data uses Chinese l1 values; these are the canonical values
VALID_L1 = {
    "通用语言能力",
    "Agent能力",
    "多模态理解",
    "代码能力",
    "科学推理",
    "安全对齐",
    "数学推理",
    "长文本理解",
    "医疗健康",
    "视频理解",
    "图表与文档理解",
    "空间与3D理解",
}

# Data uses lowercase openness values
VALID_OPENNESS = {"public", "partly public", "in-house", ""}

REQUIRED_FIELDS = ["name", "l1", "year"]

YEAR_RE = re.compile(r"^\d{4}(-\d{2})?$")

errors = []
warnings = []


def err(msg: str):
    errors.append(msg)
    print(f"  ❌ ERROR: {msg}")


def warn(msg: str):
    warnings.append(msg)
    print(f"  ⚠️  WARN:  {msg}")


def main():
    print(f"Validating {DATA_PATH} ...")

    # 1. Valid JSON
    try:
        with open(DATA_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ FATAL: Invalid JSON — {e}")
        sys.exit(1)

    if not isinstance(data, list):
        print("❌ FATAL: Root element must be a JSON array")
        sys.exit(1)

    print(f"  Loaded {len(data)} entries")

    # Build name set for cross-reference checks
    all_names = set()
    duplicate_names = set()
    for entry in data:
        name = entry.get("name", "")
        if name in all_names:
            duplicate_names.add(name)
        all_names.add(name)

    # 2. Per-entry validation
    for i, entry in enumerate(data):
        name = entry.get("name", f"<entry #{i}>")
        prefix = f"[{name}]"

        # Required fields
        for field in REQUIRED_FIELDS:
            if not entry.get(field):
                err(f"{prefix} missing required field: '{field}'")

        # Duplicate names
        if name in duplicate_names:
            err(f"{prefix} duplicate name: '{name}'")

        # l1 value
        l1 = entry.get("l1", "")
        if l1 and l1 not in VALID_L1:
            err(f"{prefix} invalid l1 value: '{l1}'. Must be one of: {sorted(VALID_L1)}")

        # year format
        year = str(entry.get("year", ""))
        if year and not YEAR_RE.match(year):
            err(f"{prefix} invalid year format: '{year}'. Expected YYYY or YYYY-MM")

        # openness
        openness = entry.get("openness", "")
        if openness not in VALID_OPENNESS:
            warn(f"{prefix} unexpected openness value: '{openness}'")

        # mermaid_flowchart
        flowchart = entry.get("mermaid_flowchart")
        if flowchart is not None and not isinstance(flowchart, str):
            err(f"{prefix} mermaid_flowchart must be a string or null, got: {type(flowchart).__name__}")

        # related_benchmarks cross-reference
        related = entry.get("related_benchmarks", [])
        if related and isinstance(related, list):
            for ref in related:
                if ref not in all_names:
                    warn(f"{prefix} related_benchmarks references non-existent entry: '{ref}'")

    # Summary
    print()
    print(f"{'='*50}")
    print(f"Total entries: {len(data)}")
    print(f"Errors:   {len(errors)}")
    print(f"Warnings: {len(warnings)}")

    if errors:
        print("\n❌ Validation FAILED")
        sys.exit(1)
    else:
        print("\n✅ Validation PASSED")
        if warnings:
            print(f"   ({len(warnings)} warnings — review recommended)")
        sys.exit(0)


if __name__ == "__main__":
    main()
