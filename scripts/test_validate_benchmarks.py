import unittest

from scripts.validate_benchmarks import (
    build_related_reference_index,
    related_reference_resolves,
    validate_identity_record,
)


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
