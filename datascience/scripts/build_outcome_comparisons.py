"""Build backend-ready AEDC outcome comparisons from approved matched pairs."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs/iteration_1/comparisons.json"
TARGET = ROOT / "outputs/iteration_2/outcome_comparisons.json"
INDICATOR_ID = "aedc_vulnerable_one_or_more"


def value(value: object, status: str) -> dict:
    return {"value": value if status == "available" else None, "status": status}


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if source.get("approved") is not True:
        raise ValueError("Input comparison output is not approved")
    output = []
    self_pairs_excluded = 0
    for comparison in source["comparisons"]:
        if (comparison["source_neighbourhood"]["id"]
                == comparison["comparison_neighbourhood"]["id"]):
            self_pairs_excluded += 1
            continue
        indicator = next((item for item in comparison["side_by_side"]
                          if item["id"] == INDICATOR_ID), None)
        if indicator is None:
            raise ValueError("Approved comparison is missing the AEDC outcome")
        status_a = indicator["source_status"]
        status_b = indicator["comparison_status"]
        both_available = status_a == status_b == "available"
        difference = (round(indicator["source_value"] - indicator["comparison_value"], 4)
                      if both_available else None)
        limitations = [item for item in comparison.get("limitations", [])
                       if item["code"] == "difference_not_significant"]
        if not both_available:
            limitations.append({
                "code": "outcome_value_unavailable",
                "message": "One selected community has no published AEDC outcome value; no difference has been created.",
                "affected_fields": [INDICATOR_ID],
            })
        geographic_unit = comparison["source_neighbourhood"]["geographic_unit"]
        output.append({
            "status": "available" if both_available else "unavailable",
            "neighbourhood_a": comparison["source_neighbourhood"],
            "neighbourhood_b": comparison["comparison_neighbourhood"],
            "outcome_indicators": [{
                "id": INDICATOR_ID,
                "name": indicator["name"],
                "unit": "percent",
                "source": "AEDC 2024",
                "reference_year": "2024",
                "geographic_unit": geographic_unit,
                "neighbourhood_a": value(indicator["source_value"], status_a),
                "neighbourhood_b": value(indicator["comparison_value"], status_b),
                "approved_difference": value(difference, "available" if both_available else "unavailable"),
            }],
            "limitations": limitations,
        })
    artefact = {
        "approved": True,
        "comparisons": output,
        "metadata": {
            "source": "AEDC 2024 approved KinderPrint matched-pair output",
            "reference_year": "2024",
            "geographic_unit": source["metadata"]["geographic_unit"],
            "data_quality": "Differences are precomputed for approved matched pairs; non-significance and unavailable values are preserved.",
            "output_schema_version": "1.0",
            "self_comparison_pairs_excluded": self_pairs_excluded,
        },
    }
    TARGET.write_text(json.dumps(artefact, separators=(",", ":")) + "\n", encoding="utf-8")
    print({"comparisons": len(output),
           "self_pairs_excluded": self_pairs_excluded,
           "available": sum(item["status"] == "available" for item in output),
           "unavailable": sum(item["status"] == "unavailable" for item in output),
           "non_significant": sum(any(limitation["code"] == "difference_not_significant"
                                      for limitation in item["limitations"]) for item in output)})


if __name__ == "__main__":
    main()
