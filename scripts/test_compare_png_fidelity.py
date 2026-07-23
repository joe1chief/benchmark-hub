import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "ci" / "compare_png_fidelity.py"
SPEC = importlib.util.spec_from_file_location("compare_png_fidelity", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ComparePngFidelityTests(unittest.TestCase):
    def test_parses_normalized_metric(self):
        self.assertEqual(
            MODULE.parse_normalized_metric("39.4857 (0.000602514)"),
            0.000602514,
        )

    def test_accepts_runner_antialiasing_drift_within_strict_limits(self):
        self.assertTrue(
            MODULE.is_within_fidelity_limits(
                actual_dimensions=(2447, 809),
                expected_dimensions=(2447, 809),
                normalized_rmse=0.010294,
                ssim_error=0.000602514,
            )
        )

    def test_rejects_dimension_drift(self):
        self.assertFalse(
            MODULE.is_within_fidelity_limits(
                actual_dimensions=(2448, 809),
                expected_dimensions=(2447, 809),
                normalized_rmse=0.0,
                ssim_error=0.0,
            )
        )

    def test_rejects_excessive_pixel_drift(self):
        self.assertFalse(
            MODULE.is_within_fidelity_limits(
                actual_dimensions=(2447, 809),
                expected_dimensions=(2447, 809),
                normalized_rmse=0.025001,
                ssim_error=0.005001,
            )
        )


if __name__ == "__main__":
    unittest.main()
