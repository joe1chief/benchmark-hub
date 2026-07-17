import unittest

from scripts.validate_benchmarks import build_related_reference_index, related_reference_resolves


class RelatedBenchmarkReferenceTest(unittest.TestCase):
    def setUp(self):
        records = [
            {"id": "PixMo_Count", "name": "PixMo-Count"},
            {"id": "First", "name": "Shared display name"},
            {"id": "Second", "name": "Shared display name"},
        ]
        self.catalog_ids, self.display_name_counts = build_related_reference_index(records)

    def test_accepts_catalog_id(self):
        self.assertTrue(
            related_reference_resolves(
                "PixMo_Count",
                self.catalog_ids,
                self.display_name_counts,
            )
        )

    def test_accepts_unique_display_name(self):
        self.assertTrue(
            related_reference_resolves(
                "PixMo-Count",
                self.catalog_ids,
                self.display_name_counts,
            )
        )

    def test_rejects_ambiguous_display_name(self):
        self.assertFalse(
            related_reference_resolves(
                "Shared display name",
                self.catalog_ids,
                self.display_name_counts,
            )
        )

    def test_rejects_missing_reference(self):
        self.assertFalse(
            related_reference_resolves(
                "Missing",
                self.catalog_ids,
                self.display_name_counts,
            )
        )


if __name__ == "__main__":
    unittest.main()
