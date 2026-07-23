#!/usr/bin/env python3
"""
Validate client/public/benchmarks.json for structural integrity.

Checks:
  1. Valid JSON
  2. Required fields present (id, name, l1, year)
  3. IDs and names are non-empty strings and unique
  4. l1 values are from the allowed set (Chinese values as used in data)
  5. year format is YYYY or YYYY-MM
  6. related_benchmarks reference existing IDs or unique display names
  7. mermaid_flowchart is a string or null
  8. openness is from the allowed set (lowercase as used in data)
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).parent.parent / "client" / "public" / "benchmarks.json"
PUBLIC_DIR = DATA_PATH.parent
DETAIL_DIR = PUBLIC_DIR / "benchmarks_detail"

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

REQUIRED_FIELDS = ["l1", "year"]

YEAR_RE = re.compile(r"^\d{4}(-\d{2})?$")
URL_RE = re.compile(r"^(https?:)?//")

DRAWIO_ASSET_FIELDS = {
    "drawio_flowchart_en": ".svg",
    "drawio_flowchart_zh": ".svg",
    "drawio_source_en": ".drawio",
    "drawio_source_zh": ".drawio",
    "drawio_spec_en": ".spec.yaml",
    "drawio_spec_zh": ".spec.yaml",
    "drawio_arch_en": ".arch.json",
    "drawio_arch_zh": ".arch.json",
}

errors = []
warnings = []


def err(msg: str):
    errors.append(msg)
    print(f"  ❌ ERROR: {msg}")


def warn(msg: str):
    warnings.append(msg)
    print(f"  ⚠️  WARN:  {msg}")


def resolve_public_asset_path(value: str) -> Optional[Path]:
    if URL_RE.match(value) or value.startswith(("data:", "blob:")):
        return None
    normalized = value.lstrip("/") if value.startswith("/") else value
    normalized = normalized[2:] if normalized.startswith("./") else normalized
    return PUBLIC_DIR / normalized


def validate_drawio_assets(entry: dict, prefix: str):
    for field, suffix in DRAWIO_ASSET_FIELDS.items():
        value = entry.get(field)
        if value in (None, ""):
            continue
        if not isinstance(value, str):
            err(f"{prefix} {field} must be a string, got: {type(value).__name__}")
            continue
        if not value.endswith(suffix):
            err(f"{prefix} {field} must end with '{suffix}', got: '{value}'")
            continue
        asset_path = resolve_public_asset_path(value)
        if asset_path is not None and not asset_path.exists():
            err(f"{prefix} {field} points to missing public asset: '{value}'")

    review_note = entry.get("drawio_review_note")
    if review_note is not None and not isinstance(review_note, str):
        err(f"{prefix} drawio_review_note must be a string, got: {type(review_note).__name__}")


def build_related_reference_index(data):
    catalog_id_counts = Counter(
        entry.get("id")
        for entry in data
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("id"), str)
            and entry.get("id").strip()
        )
    )
    display_name_counts = Counter(
        entry.get("name")
        for entry in data
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("name"), str)
            and entry.get("name").strip()
        )
    )
    return catalog_id_counts, display_name_counts


def related_reference_resolves(reference, catalog_id_counts, display_name_counts):
    if not isinstance(reference, str) or not reference.strip():
        return False
    return (
        catalog_id_counts.get(reference, 0) == 1
        or display_name_counts.get(reference, 0) == 1
    )


def validate_identity_record(entry, index, catalog_id_counts, display_name_counts):
    issues = []
    if not isinstance(entry, dict):
        return [f"[entry #{index}] must be an object, got: {type(entry).__name__}"]

    benchmark_id = entry.get("id")
    name = entry.get("name")
    prefix_value = name if isinstance(name, str) and name.strip() else f"entry #{index}"
    prefix = f"[{prefix_value}]"

    if not isinstance(benchmark_id, str) or not benchmark_id.strip():
        issues.append(f"{prefix} id must be a non-empty string")
    elif catalog_id_counts.get(benchmark_id, 0) > 1:
        issues.append(f"{prefix} duplicate id: '{benchmark_id}'")

    if not isinstance(name, str) or not name.strip():
        issues.append(f"{prefix} name must be a non-empty string")
    elif display_name_counts.get(name, 0) > 1:
        issues.append(f"{prefix} duplicate name: '{name}'")

    related = entry.get("related_benchmarks", [])
    if related is None:
        related = []
    if not isinstance(related, list):
        issues.append(f"{prefix} related_benchmarks must be a list")
        return issues

    for reference in related:
        if not isinstance(reference, str) or not reference.strip():
            issues.append(f"{prefix} related_benchmarks reference must be a non-empty string")
        elif not related_reference_resolves(
            reference,
            catalog_id_counts,
            display_name_counts,
        ):
            issues.append(
                f"{prefix} related_benchmarks reference does not resolve to a unique "
                f"catalog id or display name: '{reference}'"
            )

    return issues


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

    # Build identity indexes for cross-reference checks.
    catalog_id_counts, display_name_counts = build_related_reference_index(data)

    # 2. Per-entry validation
    for i, entry in enumerate(data):
        if not isinstance(entry, dict):
            err(f"[entry #{i}] must be an object, got: {type(entry).__name__}")
            continue

        for identity_issue in validate_identity_record(
            entry,
            i,
            catalog_id_counts,
            display_name_counts,
        ):
            err(identity_issue)

        raw_name = entry.get("name")
        name = raw_name if isinstance(raw_name, str) and raw_name.strip() else f"<entry #{i}>"
        prefix = f"[{name}]"

        # Required fields
        for field in REQUIRED_FIELDS:
            if not entry.get(field):
                err(f"{prefix} missing required field: '{field}'")

        # l1 value
        l1 = entry.get("l1", "")
        if l1 and (not isinstance(l1, str) or l1 not in VALID_L1):
            err(f"{prefix} invalid l1 value: '{l1}'. Must be one of: {sorted(VALID_L1)}")

        # year format
        year = str(entry.get("year", ""))
        if year and not YEAR_RE.match(year):
            err(f"{prefix} invalid year format: '{year}'. Expected YYYY or YYYY-MM")

        # openness
        openness = entry.get("openness", "")
        if not isinstance(openness, str) or openness not in VALID_OPENNESS:
            warn(f"{prefix} unexpected openness value: '{openness}'")

        # mermaid_flowchart
        flowchart = entry.get("mermaid_flowchart")
        if flowchart is not None and not isinstance(flowchart, str):
            err(f"{prefix} mermaid_flowchart must be a string or null, got: {type(flowchart).__name__}")

        validate_drawio_assets(entry, prefix)

    detail_count = 0
    if DETAIL_DIR.exists():
        for detail_path in sorted(DETAIL_DIR.glob("*.json")):
            detail_count += 1
            try:
                with open(detail_path, encoding="utf-8") as f:
                    detail = json.load(f)
            except json.JSONDecodeError as e:
                err(f"[{detail_path.name}] invalid detail JSON: {e}")
                continue
            if not isinstance(detail, dict):
                err(f"[{detail_path.name}] detail JSON root must be an object")
                continue
            validate_drawio_assets(detail, f"[{detail.get('name', detail_path.stem)}]")

    # Summary
    print()
    print(f"{'='*50}")
    print(f"Total entries: {len(data)}")
    print(f"Detail files:  {detail_count}")
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
