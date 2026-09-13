"""Acquire the pinned official G-NAF release used for ACECQA geocoding."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data/raw/gnaf/2026-08/g-naf_aug26_allstates_gda2020_psv_110.zip"
URL = ("https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/"
       "resource/b023544a-5836-4d43-b6d8-da2f73e8d2bf/download/"
       "g-naf_aug26_allstates_gda2020_psv_110.zip")
EXPECTED_SHA256 = "16820cc91c3ea32a3997b88024c8d0e576c1db10fe8645380be49b457e952df5"


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if not TARGET.exists() and not args.verify_only:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        partial = TARGET.with_suffix(".zip.part")
        request = urllib.request.Request(URL, headers={"User-Agent": "KinderPrint-data-pipeline/2.0"})
        with urllib.request.urlopen(request, timeout=180) as response, partial.open("wb") as output:
            shutil.copyfileobj(response, output)
        partial.replace(TARGET)
    if not TARGET.exists():
        raise FileNotFoundError(TARGET)
    actual = checksum(TARGET)
    if actual != EXPECTED_SHA256:
        raise ValueError(f"G-NAF checksum mismatch: {actual}")
    print(json.dumps({"source_id": "open_gnaf_aug_2026_gda2020", "path": str(TARGET),
                      "bytes": TARGET.stat().st_size, "sha256": actual, "status": "verified"}, indent=2))


if __name__ == "__main__":
    main()
