import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import update_readme_stats as updater

ROOT = Path(__file__).resolve().parents[1]
RECORDS = [
    {"default_l1": "Agents & Tool Use", "widely_tested": True, "family": "F"},
    {"l1": "Agents & Tool Use", "family": "F"},
    {"default_l1": "Multimodal", "family": "G"},
]
TEXT = """[![Benchmarks](https://img.shields.io/badge/Benchmarks-99-purple)](x)
**99 LLM evaluation benchmarks** across 9 capability dimensions
- **99 Benchmarks** across 9 capability dimensions
benchmarks.json          # 99 benchmark entries
Agent Capability (99), Multimodal (99)
Unrelated prose must stay unchanged.
"""


class ReadmeStatsTest(unittest.TestCase):
    def test_injected_records_and_text_are_pure_and_idempotent(self):
        records = copy.deepcopy(RECORDS)
        with patch.object(Path, "read_text", side_effect=AssertionError("unexpected read")), \
             patch.object(Path, "write_text", side_effect=AssertionError("unexpected write")):
            stats = updater.load_stats(data=records)
            self.assertEqual(stats, {
                "total": 3, "dims": 2,
                "cats": {"Agents & Tool Use": 2, "Multimodal": 1},
                "widely_tested": 1, "families": 2,
            })
            output, changed = updater.update_readme(stats, text=TEXT)
            self.assertTrue(changed)
            self.assertEqual(output, TEXT.replace("Benchmarks-99-", "Benchmarks-3-")
                             .replace("99 LLM", "3 LLM").replace("99 Benchmarks", "3 Benchmarks")
                             .replace("9 capability", "2 capability").replace("99 benchmark", "3 benchmark")
                             .replace("Agent Capability (99)", "Agent Capability (2)")
                             .replace("Multimodal (99)", "Multimodal (1)"))
            self.assertEqual(updater.update_readme(stats, text=output), (output, False))
            self.assertEqual(updater.update_readme(stats, text=""), ("", False))
            self.assertEqual(updater.load_stats(data=[])["total"], 0)
        self.assertEqual(records, RECORDS)

    def test_root_cli_only_updates_staging_and_second_generation_does_not_write(self):
        originals = [ROOT / "README.md", ROOT / "client/public/benchmarks.json"]
        original_state = [(p.read_bytes(), p.stat().st_mtime_ns) for p in originals]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "isolated repo"
            data_file = root / "client/public/benchmarks.json"
            data_file.parent.mkdir(parents=True)
            data_file.write_text(json.dumps(RECORDS), encoding="utf-8")
            readme_file = root / "README.md"
            readme_file.write_text(TEXT, encoding="utf-8")
            expected, _ = updater.update_readme(updater.load_stats(root=root), root=root)
            self.assertEqual(readme_file.read_text(encoding="utf-8"), TEXT)
            command = [sys.executable, str(ROOT / "scripts/update_readme_stats.py")]
            # Keep the old optional summary positional argument, before or after --root.
            result = subprocess.run(command + ["summary.env", "--root", str(root)],
                                    cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(readme_file.read_text(encoding="utf-8"), expected)
            summary = Path(tmp) / "summary.env"
            self.assertEqual(summary.read_text(),
                             "BENCHMARK_TOTAL=3\nBENCHMARK_DIMS=2\nBENCHMARK_CHANGED=true\n")
            snapshot = {p: (p.read_bytes(), p.stat().st_mtime_ns)
                        for p in root.rglob("*") if p.is_file()}
            result = subprocess.run(command + ["--root", str(root)],
                                    cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("already up to date", result.stdout)
            self.assertEqual(snapshot, {p: (p.read_bytes(), p.stat().st_mtime_ns)
                                       for p in root.rglob("*") if p.is_file()})
            result = subprocess.run(command + ["--root", str(root), str(summary)],
                                    cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(summary.read_text().endswith("BENCHMARK_CHANGED=false\n"))
        self.assertEqual(original_state, [(p.read_bytes(), p.stat().st_mtime_ns) for p in originals])

    def test_legacy_no_root_api_and_summary_argument_remain_compatible(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "benchmarks.json"
            readme = root / "README.md"
            summary = root / "summary.env"
            data.write_text(json.dumps(RECORDS), encoding="utf-8")
            readme.write_text(TEXT, encoding="utf-8")
            with patch.object(updater, "DATA_FILE", data), patch.object(updater, "README_FILE", readme):
                expected, _ = updater.update_readme(updater.load_stats())
                self.assertEqual(updater.main([str(summary)]), 0)
                self.assertEqual(readme.read_text(encoding="utf-8"), expected)
                self.assertEqual(updater.main([]), 0)
                self.assertIn("BENCHMARK_TOTAL=3", summary.read_text())


if __name__ == "__main__":
    unittest.main()
