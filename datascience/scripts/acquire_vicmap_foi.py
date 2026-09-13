"""Download relevant Vicmap Features of Interest without server truncation."""
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Features_of_Interest/FeatureServer/1/query"
PAGE_SIZE = 2000
WHERE = " OR ".join([
    "(feature_type='care facility' AND feature_subtype='child care')",
    "(feature_type='health facility' AND feature_subtype IN ('maternal/child health centre','community health centre'))",
    "(feature_type='hospital' AND feature_subtype IN ('general hospital','day procedure centre','bush nursing hospital'))",
    "(feature_type='recreational resource' AND feature_subtype IN ('playground','trailhead','picnic site','day visitor area'))",
    "(feature_type='sport facility' AND feature_subtype='swimming pool')",
])


def page(offset: int) -> dict:
    parameters = urllib.parse.urlencode({
        "where": WHERE, "outFields": "*", "returnGeometry": "true", "outSR": "4326",
        "f": "geojson", "resultOffset": offset, "resultRecordCount": PAGE_SIZE,
        "orderByFields": "OBJECTID",
    })
    request = urllib.request.Request(f"{SERVICE}?{parameters}", headers={"User-Agent": "KinderPrint-data-pipeline/2.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        document = json.load(response)
    if "error" in document:
        raise RuntimeError(document["error"])
    return document


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()
    features, offset = [], 0
    while True:
        document = page(offset)
        batch = document.get("features", [])
        features.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += len(batch)
    object_ids = [feature["properties"]["OBJECTID"] for feature in features]
    if len(object_ids) != len(set(object_ids)):
        raise ValueError("Vicmap pagination returned duplicate OBJECTIDs")
    target = ROOT / "data/raw/vicmap_foi" / args.date / "child_health_active_living_foi.geojson"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"Wrote {len(features)} features to {target}")


if __name__ == "__main__":
    main()
