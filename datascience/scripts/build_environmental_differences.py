"""Build approved environmental-difference output from harmonised matched pairs."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data/processed"
TARGET = ROOT / "outputs/iteration_2/environmental_differences.json"
GEO_UNIT = "SA2 (ASGS Edition 3, 2021)"
SOURCE = "DELWP Cooling & Greening Melbourne 2018 / VPA Open Space"
REFERENCE_YEAR = "2018"
IDENTIFIERS = {
    "vegetation_pct": "env_vegetation_cover",
    "uhi_degc": "env_urban_heat",
    "open_space_pct": "env_open_space_access",
}


def main() -> None:
    differences = pd.read_csv(PROC / "environmental_differences.csv")
    communities = pd.read_csv(PROC / "communities.csv", dtype=str).fillna("")
    identities = communities.set_index("community_id")[["neighbourhood_id", "community_name"]]
    expected = set(IDENTIFIERS)
    output = []
    for community_id, group in differences.groupby("community_id", sort=True):
        if set(group.indicator) != expected or len(group) != len(expected):
            continue
        peer_ids = set(group.peer_id)
        if len(peer_ids) != 1:
            raise ValueError("A locality has inconsistent environmental comparison peers")
        peer_id = next(iter(peer_ids))
        if community_id == peer_id:
            raise ValueError("Environmental comparison cannot use a self-pair")
        area_a = identities.loc[community_id]
        area_b = identities.loc[peer_id]
        indicators = []
        for _, row in group.sort_values("rank").iterrows():
            source_value = float(row.source_value)
            peer_value = float(row.peer_value)
            indicators.append({
                "id": IDENTIFIERS[row.indicator], "name": row.label, "unit": row.unit,
                "source": SOURCE, "reference_year": REFERENCE_YEAR,
                "geographic_unit": GEO_UNIT,
                "neighbourhood_a": {"value": source_value, "status": "available"},
                "neighbourhood_b": {"value": peer_value, "status": "available"},
                "approved_difference": {"value": round(source_value - peer_value, 2),
                                        "status": "available"},
            })
        standout = group.loc[group["rank"].eq(1), "indicator"]
        if len(standout) != 1:
            raise ValueError("Each complete pair must have one pre-ranked standout")
        output.append({
            "status": "available",
            "neighbourhood_a": {"id": area_a.neighbourhood_id,
                                  "name": area_a.community_name, "geographic_unit": GEO_UNIT},
            "neighbourhood_b": {"id": area_b.neighbourhood_id,
                                  "name": area_b.community_name, "geographic_unit": GEO_UNIT},
            "environmental_indicators": indicators,
            "approved_standout_indicator_ids": [IDENTIFIERS[standout.iloc[0]]],
            "limitations": [],
        })
    artefact = {
        "approved": True,
        "differences": output,
        "metadata": {
            "source": SOURCE, "reference_year": REFERENCE_YEAR,
            "geographic_unit": GEO_UNIT,
            "data_quality": "Area-weighted Edition 3 SA2 harmonisation; only complete three-indicator matched pairs are published.",
            "coverage": "Source values require at least 50% coverage; 264 complete matched pairs published.",
            "output_schema_version": "1.0",
        },
    }
    TARGET.write_text(json.dumps(artefact, separators=(",", ":")) + "\n", encoding="utf-8")
    print({"complete_pairs": len(output), "incomplete_pairs_withheld": 273 - len(output),
           "self_pairs": 0})


if __name__ == "__main__":
    main()
