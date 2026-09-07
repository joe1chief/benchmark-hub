#!/usr/bin/env python3
"""
update_readme_stats.py
─────────────────────
从 client/public/benchmarks.json 读取最新统计数据，
自动更新 README.md 中的硬编码数字：
  - Benchmarks Badge 数量
  - 正文中的 benchmark 总数
  - 分类数量（capability dimensions）
  - 各分类的条目数
  - 项目结构注释中的数量
"""

import argparse
import json
import re
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "client" / "public" / "benchmarks.json"
README_FILE = ROOT / "README.md"


def load_stats(data=None, *, root=None) -> dict:
    """Compute existing statistics from records, or read the selected repository.

    Supplying data (including an empty list) performs no filesystem access.
    """
    if data is None:
        data_file = Path(root) / "client" / "public" / "benchmarks.json" if root is not None else DATA_FILE
        data = json.loads(data_file.read_text(encoding="utf-8"))
    total = len(data)
    cats = Counter(b.get("default_l1") or b.get("l1", "Unknown") for b in data)
    dims = len(cats)
    widely_tested = sum(1 for b in data if b.get("widely_tested"))
    families = len({b["family"] for b in data if b.get("family")})
    return {
        "total": total,
        "dims": dims,
        "cats": dict(cats.most_common()),
        "widely_tested": widely_tested,
        "families": families,
    }


def update_readme(stats: dict, text=None, *, root=None) -> tuple[str, bool]:
    """Return updated text and a changed flag without writing any files.

    Supplying text makes the transformation pure; otherwise read README at root.
    """
    total = stats["total"]
    dims = stats["dims"]
    readme_file = Path(root) / "README.md" if root is not None else README_FILE
    readme = readme_file.read_text(encoding="utf-8") if text is None else text
    original = readme

    # 1. 更新 shields.io Badge 中的数字
    #    [![Benchmarks](https://img.shields.io/badge/Benchmarks-378-purple...
    readme = re.sub(
        r"(img\.shields\.io/badge/Benchmarks-)\d+(-)",
        rf"\g<1>{total}\2",
        readme,
    )

    # 2. 更新正文中的 "378 LLM evaluation benchmarks"
    readme = re.sub(
        r"\*\*\d+ LLM evaluation benchmarks\*\*",
        f"**{total} LLM evaluation benchmarks**",
        readme,
    )

    # 3. 更新 "across N capability dimensions"
    readme = re.sub(
        r"across \d+ capability dimensions",
        f"across {dims} capability dimensions",
        readme,
    )

    # 4. 更新 "- **378 Benchmarks** across N capability dimensions" 行
    readme = re.sub(
        r"- \*\*\d+ Benchmarks\*\* across \d+ capability dimensions",
        f"- **{total} Benchmarks** across {dims} capability dimensions",
        readme,
    )

    # 5. 更新项目结构注释中的数量
    #    └── benchmarks.json          # 378 benchmark entries
    readme = re.sub(
        r"(benchmarks\.json\s+# )\d+( benchmark entries)",
        rf"\g<1>{total}\2",
        readme,
    )

    # 6. 更新 Features 行中各分类的括号数量
    #    例如：Agent Capability (73), General Language (79), ...
    cats = stats["cats"]
    # 映射 README 中的显示名称 -> benchmarks.json 中的 default_l1 键
    name_map = {
        "Agent Capability": "Agents & Tool Use",
        "General Language": "General Language Capability",
        "Multimodal": "Multimodal",
        "Code": "Code & Software Engineering",
        "Science & Reasoning": "Mathematical Reasoning",  # 近似
        "Safety & Alignment": "Safety & Alignment",
        "Medical & Health": "Domain Expertise",  # 近似
    }
    for display_name, json_key in name_map.items():
        count = cats.get(json_key, 0)
        if count > 0:
            readme = re.sub(
                rf"{re.escape(display_name)} \(\d+\)",
                f"{display_name} ({count})",
                readme,
            )

    changed = readme != original
    return readme, changed


def main(argv=None):
    parser = argparse.ArgumentParser(description="Update README benchmark statistics")
    parser.add_argument('--root', type=Path, help="Repository root (defaults to this script's repository)")
    parser.add_argument('summary_file', nargs='?', type=Path, help="Append CI summary here (relative paths use the current working directory)")
    args = parser.parse_args(argv)
    root = args.root.resolve() if args.root is not None else None
    readme_file = root / "README.md" if root is not None else README_FILE
    print("📊 Loading stats from benchmarks.json...")
    stats = load_stats(root=root)
    print(f"   Total: {stats['total']} benchmarks")
    print(f"   Dims:  {stats['dims']} capability dimensions")
    print(f"   Widely tested: {stats['widely_tested']}")
    print(f"   Families: {stats['families']}")
    print(f"   Categories: {list(stats['cats'].keys())}")

    print("\n📝 Updating README.md...")
    new_content, changed = update_readme(stats, root=root)

    if changed:
        readme_file.write_text(new_content, encoding="utf-8")
        print("✅ README.md updated successfully.")
    else:
        print("ℹ️  README.md is already up to date, no changes needed.")

    # 输出供 CI 使用的环境变量
    summary_file = args.summary_file
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as f:
            f.write(f"BENCHMARK_TOTAL={stats['total']}\n")
            f.write(f"BENCHMARK_DIMS={stats['dims']}\n")
            f.write(f"BENCHMARK_CHANGED={'true' if changed else 'false'}\n")

    return 0 if changed else 0  # always success


if __name__ == "__main__":
    sys.exit(main())
