"""Reproducibly acquire public Iteration-2 source snapshots.

Raw files stay git-ignored. The structured register and generated EDA profile carry
the provenance needed to reproduce a snapshot. A failed public download is reported
as a barrier; it is never replaced by synthetic data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "config" / "iteration_2_datasets.json"
RAW = ROOT / "data" / "raw"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def destination(source: dict, accessed: str) -> Path:
    filename = source.get("local_filename")
    if not filename:
        suffix = Path(urllib.parse.urlparse(source["download_url"]).path).suffix or ".data"
        filename = f"{source['source_id']}{suffix}"
    return RAW / source["source_id"] / accessed / filename


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "KinderPrint-data-pipeline/2.0"})
    temporary = target.with_suffix(target.suffix + ".part")
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="append", help="source_id to acquire; repeatable")
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()
    register = json.loads(REGISTER.read_text())
    selected = set(args.source or [])
    results = []
    for source in register["datasets"]:
        if selected and source["source_id"] not in selected:
            continue
        url = source.get("download_url")
        if not url:
            results.append({"source_id": source["source_id"], "status": "not_downloadable"})
            continue
        target = destination(source, args.date)
        try:
            download(url, target)
            results.append({"source_id": source["source_id"], "status": "downloaded",
                            "path": str(target.relative_to(ROOT)), "bytes": target.stat().st_size,
                            "sha256": sha256(target)})
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            results.append({"source_id": source["source_id"], "status": "blocked",
                            "error": f"{type(error).__name__}: {error}"})
    print(json.dumps(results, indent=2))
    return 1 if any(item["status"] == "blocked" for item in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
