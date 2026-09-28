"""Bridge Victorian SA2s to their LGA and VCAMS Department area.

Inputs
------
data/reference/sa2_lga_2023_vic.csv
    Every Victorian ASGS Edition 3 SA2 with the ABS LGA 2023 polygon that
    contains the SA2's official label point. Built from the ABS ArcGIS services
    ASGS2021/SA2 (layer SA2_PT) and ASGS2023/LGA (layer LGA) on 28 September 2026.
    SA2s are not nested within LGAs; a label-point allocation assigns each SA2 to
    exactly one LGA and is recorded as such.
config/dffh_department_area_lgas.csv
    The 79 Victorian LGAs in the 17 Department of Families, Fairness and Housing
    areas used by VCAMS, transcribed from the DFFH "divisions and areas" map
    (October 2021, publication 21009100). The map labels the Loddon Campaspe area
    "Loddon"; the VCAMS publication name is used so the bridge joins VCAMS data.

Output
------
data/processed/sa2_department_area_bridge.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SA2_LGA = ROOT / "data" / "reference" / "sa2_lga_2023_vic.csv"
AREA_LGAS = ROOT / "config" / "dffh_department_area_lgas.csv"
OUTPUT = ROOT / "data" / "processed" / "sa2_department_area_bridge.csv"
EXPECTED_AREAS = 17
EXPECTED_LGAS = 79


def normalise_lga(name: str) -> str:
    """Drop ABS and VCAMS disambiguation suffixes such as '(Vic.)' or '(C)'."""
    return name.split(" (")[0].strip().casefold()


def build(sa2_lga: pd.DataFrame, area_lgas: pd.DataFrame) -> pd.DataFrame:
    if area_lgas.department_area.nunique() != EXPECTED_AREAS:
        raise ValueError("Department area configuration must list 17 areas")
    if area_lgas.lga_name.nunique() != EXPECTED_LGAS:
        raise ValueError("Department area configuration must list 79 LGAs")
    lookup = {normalise_lga(row.lga_name): row.department_area for row in area_lgas.itertuples()}
    frame = sa2_lga.copy()
    frame["sa2_code_2021"] = frame["sa2_code_2021"].astype(str).str.zfill(9)
    frame["department_area"] = frame["lga_name_2023"].map(lambda name: lookup.get(normalise_lga(str(name))))
    unmatched = frame[frame.department_area.isna() & ~frame.lga_name_2023.str.startswith("Unincorporated")]
    if not unmatched.empty:
        raise ValueError(f"LGAs without a Department area: {sorted(unmatched.lga_name_2023.unique())}")
    frame = frame[frame.department_area.notna()]
    frame["allocation_method"] = "sa2_label_point_in_lga_2023"
    frame["source_id"] = "abs_asgs_sa2_lga_label_point_2023;dffh_divisions_areas_map_2021"
    return frame[[
        "sa2_code_2021", "sa2_name_2021", "lga_code_2023", "lga_name_2023",
        "department_area", "allocation_method", "source_id",
    ]].sort_values("sa2_code_2021").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(pd.read_csv(SA2_LGA, dtype=str), pd.read_csv(AREA_LGAS, dtype=str))
    result.to_csv(args.output, index=False)
    print(f"{len(result)} SA2s bridged to {result.department_area.nunique()} Department areas")


if __name__ == "__main__":
    main()
