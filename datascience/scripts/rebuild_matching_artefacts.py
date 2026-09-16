"""Repair stable peer IDs and rebuild comparison artefacts from validated processed tables."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from kinderprint.api.build_artefacts import build_comparisons  # noqa: E402

PROC = ROOT / "data/processed"
OUT1 = ROOT / "outputs/iteration_1"
OUT2 = ROOT / "outputs/iteration_2"


def main() -> None:
    matched = pd.read_csv(PROC / "matched_table.csv")
    final = pd.read_csv(PROC / "final_table.csv")
    if matched.community_id.duplicated().any() or final.community_id.duplicated().any():
        raise ValueError("Community identifiers must be unique")

    matched["match_community_id"] = [
        matched.loc[int(index), "community_id"] if pd.notna(index) and int(index) >= 0 else ""
        for index in matched.match_idx
    ]
    paired = matched.match_community_id.fillna("").ne("")
    if matched.loc[paired, "community_id"].eq(matched.loc[paired, "match_community_id"]).any():
        raise ValueError("Processed matching table contains a self-match")

    stable = matched[["community_id", "match_community_id"]]
    final = final.drop(columns=["match_community_id"], errors="ignore").merge(
        stable, on="community_id", how="left", validate="one_to_one")
    matched.to_csv(PROC / "matched_table.csv", index=False)
    final.to_csv(PROC / "final_table.csv", index=False)

    comparisons = build_comparisons(final)
    (OUT1 / "comparisons.json").write_text(
        json.dumps(comparisons, separators=(",", ":")), encoding="utf-8")
    report = {
        "source": "validated processed matched_table.csv and final_table.csv",
        "community_rows": len(final),
        "matched_pairs": int(paired.sum()),
        "no_match": int((~paired).sum()),
        "self_matches": 0,
        "stable_peer_identifier": "match_community_id",
        "full_raw_refresh_status": "DEFERRED_RAW_AEDC_WORKBOOK_NOT_PRESENT",
    }
    (OUT2 / "matching_identifier_repair.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
