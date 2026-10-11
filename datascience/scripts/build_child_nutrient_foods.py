"""Everyday foods richest in the nutrients children most need, from AFCD Release 3.

Inputs
------
data/reference/iteration3/afcd_r3_selected_per100g.csv
    Selected nutrient columns (per 100 g, edible portion) from "AFCD Release 3 -
    Nutrient profiles.xlsx", Food Standards Australia New Zealand, December 2025,
    CC BY 4.0.
config/child_nutrient_targets.csv
    Nutrient Reference Values for Australia and New Zealand (NHMRC, via
    eatforhealth.gov.au) for ages 1-3, 4-8 and 9-13.

Method
------
Foods are limited to the five food groups in the Australian Dietary Guidelines,
using the two-digit AUSNUT 2023 classification: cereals (12), fish and seafood
(15), fruit (16), eggs (17), meat and poultry (18), milk products (19), nuts and
seeds (22), vegetables (24) and legumes (25). Dried, powdered, dehydrated and raw
meat or fish entries are excluded so that values reflect foods as eaten, and
ingredients used in small amounts (herbs, spices, pastes, brans, flours, seeds such
as poppy and linseed) are excluded because they are not a realistic main source. For each
nutrient the eight foods with the highest amount per 100 g are listed. Per 100 g
is not a serve size.

Output
------
data/processed/child_nutrient_foods.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "reference" / "iteration3" / "afcd_r3_selected_per100g.csv"
TARGETS = ROOT / "config" / "child_nutrient_targets.csv"
OUTPUT = ROOT / "data" / "processed" / "child_nutrient_foods.csv"
GROUPS = {
    "12": "Grains and cereals", "15": "Lean meat, fish, eggs, nuts and legumes", "16": "Fruit",
    "17": "Lean meat, fish, eggs, nuts and legumes", "18": "Lean meat, fish, eggs, nuts and legumes",
    "19": "Milk, yoghurt and cheese", "22": "Lean meat, fish, eggs, nuts and legumes",
    "24": "Vegetables and legumes", "25": "Vegetables and legumes",
}
COLUMNS = {
    "iron": "Iron (Fe) (mg)", "calcium": "Calcium (Ca) (mg)", "fibre": "Total dietary fibre (g)",
    "vitamin_c": "Vitamin C (mg)", "zinc": "Zinc (Zn) (mg)", "iodine": "Iodine (I) (ug)",
    "vitamin_d": "Vitamin D3 equivalents (ug)",
}
EXCLUDE = r"dried|powder|dehydrated|freeze|concentrate|infant"
# Ingredients eaten in small amounts would top any per-100 g list without being a
# realistic source for a child, so they are left out.
SMALL_AMOUNT = (r"paste|psyllium|poppy|wattle|hemp|flour|bran, unprocessed|salted|peel|chilli|garlic|parsley|"
                r"thyme|basil|coriander|dill|chives|mint|separable fat|yolk|native|lupin|germ|linseed|flaxseed|"
                r"ginger|seaweed|anchov|guava|oregano|marjoram|rosemary|sage|tarragon|bay leaf|currant|coconut, grated|teff|amaranth|triticale")
TOP_N = 8


def build(foods: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    missing = set(COLUMNS.values()) - set(foods.columns)
    if missing:
        raise ValueError(f"AFCD columns missing: {sorted(missing)}")
    if set(targets.nutrient_id) != set(COLUMNS):
        raise ValueError("Nutrient targets and AFCD columns must list the same nutrients")
    foods = foods.copy()
    foods["group_code"] = foods.Classification.astype(str).str[:2]
    foods = foods[foods.group_code.isin(GROUPS)]
    name = foods["Food Name"].str.lower()
    raw_animal = foods.group_code.isin(["15", "18"]) & name.str.contains(r"\braw\b")
    foods = foods[~name.str.contains(EXCLUDE) & ~name.str.contains(SMALL_AMOUNT) & ~raw_animal]
    rows = []
    for nutrient_id, column in COLUMNS.items():
        ranked = foods[pd.to_numeric(foods[column], errors="coerce") > 0] \
            .assign(value=lambda f: pd.to_numeric(f[column])) \
            .sort_values(["value", foods.columns[0]], ascending=[False, True], kind="mergesort")  # food key breaks ties
        # One entry per food stem so the list is varied (e.g. not five cuts of liver).
        ranked = ranked.assign(stem=ranked["Food Name"].str.split(",").str[0].str.strip().str.lower()) \
            .drop_duplicates("stem").head(TOP_N)
        target = targets.set_index("nutrient_id").loc[nutrient_id]
        for rank, row in enumerate(ranked.itertuples(), start=1):
            rows.append({"nutrient_id": nutrient_id, "nutrient": target.nutrient, "unit": target.unit, "rank": rank,
                         "food_key": row._1, "food_name": row._3, "food_group": GROUPS[row.group_code],
                         "amount_per_100g": round(float(row.value), 2)})
    out = pd.DataFrame(rows)
    out["source_id"] = "fsanz_afcd_release_3"
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = build(pd.read_csv(SOURCE), pd.read_csv(TARGETS))
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} rows to {args.output}")


if __name__ == "__main__":
    main()
