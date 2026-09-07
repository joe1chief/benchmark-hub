import unittest
import json
from pathlib import Path
from unittest.mock import patch
from scripts import validate_benchmarks as validator


class HtmlAssetValidationTest(unittest.TestCase):
    def test_optional_exports_can_be_absent_but_html_sources_cannot(self):
        with patch.object(validator, 'errors', []), patch.object(Path, 'exists', return_value=False):
            validator.validate_drawio_assets({'drawio_flowchart_en': 'drawio/X/X.en.svg', 'drawio_source_en': 'drawio/X/X.en.drawio'}, 'X', html=True)
            self.assertEqual(validator.errors, [])
            validator.validate_drawio_assets({'drawio_arch_en': 'drawio/X/X.en.arch.json'}, 'X', html=True)
            self.assertEqual(len(validator.errors), 1)
            validator.validate_drawio_assets({'drawio_spec_en': 'drawio/X/X.en.spec.yaml'}, 'X', html=True)
            self.assertEqual(len(validator.errors), 2)

    def test_export_validation_remains_strict_in_legacy_mode(self):
        with patch.object(validator, 'errors', []), patch.object(Path, 'exists', return_value=False):
            validator.validate_drawio_assets({'drawio_flowchart_en': 'drawio/X/X.en.svg'}, 'X')
            self.assertEqual(len(validator.errors), 1)

    def test_html_mode_still_rejects_malformed_optional_links(self):
        with patch.object(validator, 'errors', []):
            validator.validate_drawio_assets({'drawio_flowchart_en': 42}, 'X', html=True)
            self.assertEqual(len(validator.errors), 1)

from scripts.validate_benchmarks import (
    build_related_reference_index,
    canonicalize_openness,
    related_reference_resolves,
    validate_identity_record,
)

ROOT = Path(__file__).resolve().parents[1]


class OpennessValidationTest(unittest.TestCase):
    def test_canonicalizes_supported_openness_variants(self):
        cases = {
            "public": "public",
            "公开": "public",
            "公开平台": "public",
            "数据公开；仓库及数据无许可证文件": "public",
            "public, noncommercial license": "public",
            "partly": "partly public",
            "部分公开": "partly public",
            "public subset": "partly public",
            "mixed": "partly public",
            "公开密码归档；当前镜像自动门控": "partly public",
            "公开评测平台；完整快照与数据许可证未披露": "partly public",
            "private": "in-house",
            "内部数据集": "in-house",
            "未披露": "",
            "": "",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(canonicalize_openness(value), expected)

    def test_rejects_unrecognized_or_non_string_openness(self):
        for value in ("restricted pending review", None, [], 17):
            with self.subTest(value=value):
                self.assertIsNone(canonicalize_openness(value))

    def test_all_catalog_openness_values_have_a_canonical_category(self):
        catalog = json.loads(
            (ROOT / "client" / "public" / "benchmarks.json").read_text(
                encoding="utf-8"
            )
        )

        unresolved = [
            (entry.get("id"), entry.get("openness"))
            for entry in catalog
            if canonicalize_openness(entry.get("openness", "")) is None
        ]

        self.assertEqual(unresolved, [])


class RelatedBenchmarkReferenceTest(unittest.TestCase):
    def setUp(self):
        records = [
            {"id": "PixMo_Count", "name": "PixMo-Count"},
            {"id": "First", "name": "Shared display name"},
            {"id": "Second", "name": "Shared display name"},
        ]
        self.catalog_id_counts, self.display_name_counts = build_related_reference_index(records)

    def test_accepts_catalog_id(self):
        self.assertTrue(
            related_reference_resolves(
                "PixMo_Count",
                self.catalog_id_counts,
                self.display_name_counts,
            )
        )

    def test_accepts_unique_display_name(self):
        self.assertTrue(
            related_reference_resolves(
                "PixMo-Count",
                self.catalog_id_counts,
                self.display_name_counts,
            )
        )

    def test_rejects_ambiguous_display_name(self):
        self.assertFalse(
            related_reference_resolves(
                "Shared display name",
                self.catalog_id_counts,
                self.display_name_counts,
            )
        )

    def test_rejects_missing_reference(self):
        self.assertFalse(
            related_reference_resolves(
                "Missing",
                self.catalog_id_counts,
                self.display_name_counts,
            )
        )

    def test_rejects_malformed_reference_without_crashing(self):
        for reference in (None, "", "   ", [], {}, 17):
            with self.subTest(reference=reference):
                self.assertFalse(
                    related_reference_resolves(
                        reference,
                        self.catalog_id_counts,
                        self.display_name_counts,
                    )
                )

    def test_rejects_duplicate_catalog_id(self):
        records = [
            {"id": "Duplicate", "name": "First", "related_benchmarks": []},
            {"id": "Duplicate", "name": "Second", "related_benchmarks": []},
        ]
        id_counts, name_counts = build_related_reference_index(records)

        self.assertFalse(related_reference_resolves("Duplicate", id_counts, name_counts))
        issues = validate_identity_record(records[0], 0, id_counts, name_counts)
        self.assertTrue(any("duplicate id" in issue for issue in issues))

    def test_reports_non_string_name_and_reference(self):
        records = [{"id": "Alpha", "name": 123, "related_benchmarks": [[]]}]
        id_counts, name_counts = build_related_reference_index(records)

        issues = validate_identity_record(records[0], 0, id_counts, name_counts)

        self.assertTrue(any("name must be a non-empty string" in issue for issue in issues))
        self.assertTrue(any("reference must be a non-empty string" in issue for issue in issues))

    def test_reports_whitespace_only_identity_fields(self):
        records = [{"id": "   ", "name": "\t", "related_benchmarks": []}]
        id_counts, name_counts = build_related_reference_index(records)

        issues = validate_identity_record(records[0], 0, id_counts, name_counts)

        self.assertTrue(any("id must be a non-empty string" in issue for issue in issues))
        self.assertTrue(any("name must be a non-empty string" in issue for issue in issues))

    def test_reports_unresolved_reference_as_identity_error(self):
        records = [{"id": "Alpha", "name": "Alpha", "related_benchmarks": ["Missing"]}]
        id_counts, name_counts = build_related_reference_index(records)

        issues = validate_identity_record(records[0], 0, id_counts, name_counts)

        self.assertTrue(any("does not resolve" in issue for issue in issues))

    def test_reports_non_list_related_benchmarks(self):
        records = [{"id": "Alpha", "name": "Alpha", "related_benchmarks": "Beta"}]
        id_counts, name_counts = build_related_reference_index(records)

        issues = validate_identity_record(records[0], 0, id_counts, name_counts)

        self.assertTrue(any("must be a list" in issue for issue in issues))


if __name__ == "__main__":
    unittest.main()
