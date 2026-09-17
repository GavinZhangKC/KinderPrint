"""Synchronise approved AEDC domain measures into Iteration 2 runtime artefacts.

This repairs published artefacts without rerunning the raw-data pipeline or
changing scores for any other suitability criterion.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from kinderprint.analytics.suitability import build_criterion_scores


AEDC_DOMAINS = {
    "physical_health_on_track": "aedc_physical_on_track",
    "social_competence_on_track": "aedc_social_on_track",
    "emotional_maturity_on_track": "aedc_emotional_on_track",
    "language_cognitive_on_track": "aedc_language_on_track",
    "communication_knowledge_on_track": "aedc_communication_on_track",
}


def synchronise(iteration_1: dict, iteration_2: dict, suitability: dict) -> tuple[dict, dict]:
    source_profiles = {item["neighbourhood"]["id"]: item for item in iteration_1["profiles"]}
    target_profiles = iteration_2["profiles"]
    rows = suitability["localities"]
    target_ids = {item["neighbourhood"]["id"] for item in target_profiles}
    result_ids = {item["id"] for item in rows}
    if (len(source_profiles) != len(iteration_1["profiles"])
            or len(target_ids) != len(target_profiles)
            or len(result_ids) != len(rows)
            or target_ids != source_profiles.keys()
            or target_ids != result_ids):
        raise ValueError("Iteration 1, Iteration 2 and suitability locality IDs must match exactly")

    indicator_ids = set(AEDC_DOMAINS.values())
    for profile in target_profiles:
        identifier = profile["neighbourhood"]["id"]
        source_domain = next(domain for domain in source_profiles[identifier]["domains"]
                             if domain["name"] == "Child Development")
        target_domain = next(domain for domain in profile["domains"]
                             if domain["name"] == "Child Development")
        source_indicators = {item["id"]: item for item in source_domain["indicators"]
                             if item["id"] in indicator_ids}
        if source_indicators.keys() != indicator_ids:
            raise ValueError(f"Missing approved AEDC domain indicators for {identifier}")
        target_domain["indicators"] = [item for item in target_domain["indicators"]
                                       if item["id"] not in indicator_ids]
        target_domain["indicators"].extend(source_indicators[item] for item in AEDC_DOMAINS.values())

    calculated = {item["id"]: item for item in build_criterion_scores(target_profiles)}
    for row in rows:
        source = calculated[row["id"]]
        for criterion in AEDC_DOMAINS:
            row["scores"][criterion] = source["scores"][criterion]
            row["measures"][criterion] = source["measures"][criterion]
    return iteration_2, suitability


def main() -> None:
    first_path = ROOT / "outputs/iteration_1/profiles.json"
    second_path = ROOT / "outputs/iteration_2/profiles.json"
    suitability_path = ROOT / "outputs/iteration_2/suitability.json"
    first = json.loads(first_path.read_text(encoding="utf-8"))
    second = json.loads(second_path.read_text(encoding="utf-8"))
    suitability = json.loads(suitability_path.read_text(encoding="utf-8"))
    second, suitability = synchronise(first, second, suitability)
    second_path.write_text(json.dumps(second, separators=(",", ":")), encoding="utf-8")
    suitability_path.write_text(json.dumps(suitability, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
