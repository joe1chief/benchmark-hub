#!/usr/bin/env python3

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Tuple


MAX_NORMALIZED_RMSE = 0.025
MAX_SSIM_ERROR = 0.005


def parse_normalized_metric(output: str) -> float:
    match = re.search(
        r"\(([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\)\s*$",
        output,
    )
    if not match:
        raise ValueError(f"ImageMagick metric has no normalized value: {output!r}")
    return float(match.group(1))


def is_within_fidelity_limits(
    *,
    actual_dimensions: Tuple[int, int],
    expected_dimensions: Tuple[int, int],
    normalized_rmse: float,
    ssim_error: float,
) -> bool:
    return (
        actual_dimensions == expected_dimensions
        and normalized_rmse <= MAX_NORMALIZED_RMSE
        and ssim_error <= MAX_SSIM_ERROR
    )


def image_dimensions(identify_cli: str, image_path: Path) -> Tuple[int, int]:
    result = subprocess.run(
        [identify_cli, "-format", "%w %h", str(image_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    width, height = result.stdout.split()
    return int(width), int(height)


def normalized_metric(
    compare_cli: str,
    metric: str,
    actual_path: Path,
    expected_path: Path,
) -> float:
    result = subprocess.run(
        [
            compare_cli,
            "-metric",
            metric,
            str(actual_path),
            str(expected_path),
            "null:",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(
            f"ImageMagick {metric} failed with exit {result.returncode}: "
            f"{result.stderr.strip()}"
        )
    return parse_normalized_metric((result.stderr or result.stdout).strip())


def main(argv: list[str]) -> int:
    if len(argv) != 5 or argv[0:2] != ["-metric", "AE"] or argv[4] != "null:":
        print(
            "usage: compare_png_fidelity.py -metric AE ACTUAL EXPECTED null:",
            file=sys.stderr,
        )
        return 2

    actual_path = Path(argv[2])
    expected_path = Path(argv[3])
    compare_cli = os.environ.get(
        "IMAGEMAGICK_COMPARE_REAL",
        "/opt/homebrew/bin/compare",
    )
    identify_cli = os.environ.get(
        "IMAGEMAGICK_IDENTIFY",
        str(Path(compare_cli).with_name("identify")),
    )

    actual_dimensions = image_dimensions(identify_cli, actual_path)
    expected_dimensions = image_dimensions(identify_cli, expected_path)
    normalized_rmse = normalized_metric(
        compare_cli,
        "RMSE",
        actual_path,
        expected_path,
    )
    ssim_error = normalized_metric(
        compare_cli,
        "SSIM",
        actual_path,
        expected_path,
    )

    if is_within_fidelity_limits(
        actual_dimensions=actual_dimensions,
        expected_dimensions=expected_dimensions,
        normalized_rmse=normalized_rmse,
        ssim_error=ssim_error,
    ):
        return 0

    print(
        "PNG fidelity failed: "
        f"dimensions={actual_dimensions}/{expected_dimensions}, "
        f"normalized_rmse={normalized_rmse:.9f}"
        f" (max {MAX_NORMALIZED_RMSE}), "
        f"ssim_error={ssim_error:.9f} (max {MAX_SSIM_ERROR})",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
