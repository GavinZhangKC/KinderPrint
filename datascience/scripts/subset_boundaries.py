"""
Extract what KinderPrint needs from the national ASGS Edition 3 GeoPackage.

Layer and column names below are the REAL ones, confirmed by inspection on
2026-08-28. ABS uses the long form (SA2_CODE_2021), not the short form.

Run:
    python scripts/subset_boundaries.py

Reads:  data/raw/asgs/2026-08-28/<national>.gpkg   (immutable)
Writes: data/reference/sa2_ed3_lookup.csv                 <- small, upload this
        data/reference/sa2_ed3_greater_melbourne.gpkg     <- Melbourne geometry
        data/reference/mb_ed3_greater_melbourne.csv       <- MB -> SA2 allocation
"""

import geopandas as gpd
import pandas as pd
from pathlib import Path

RAW = Path("data/raw/asgs/2026-08-28")
OUT = Path("data/reference")
OUT.mkdir(parents=True, exist_ok=True)

SRC = next(RAW.glob("*.gpkg"))
SA2_LAYER = "SA2_2021_AUST_GDA2020"
MB_LAYER = "MB_2021_AUST_GDA2020"
GCCSA = "Greater Melbourne"

print(f"Source: {SRC.name} ({SRC.stat().st_size / 1e6:.0f} MB)\n")

# --------------------------------------------------------------------------
# 1. National SA2 lookup, no geometry. This is all that is needed to validate
#    the AEDC codes, and it is small enough to move around freely.
# --------------------------------------------------------------------------
sa2 = gpd.read_file(SRC, layer=SA2_LAYER)
print(f"National SA2 records: {len(sa2)}   CRS: {sa2.crs}")

lookup = pd.DataFrame(sa2.drop(columns="geometry"))[[
    "SA2_CODE_2021", "SA2_NAME_2021",
    "SA3_CODE_2021", "SA3_NAME_2021",
    "SA4_CODE_2021", "SA4_NAME_2021",
    "GCCSA_CODE_2021", "GCCSA_NAME_2021",
    "STATE_CODE_2021", "STATE_NAME_2021",
    "AREA_ALBERS_SQKM",
    "CHANGE_FLAG_2021", "CHANGE_LABEL_2021",
]]
lookup.to_csv(OUT / "sa2_ed3_lookup.csv", index=False)
print(f"Wrote sa2_ed3_lookup.csv ({(OUT / 'sa2_ed3_lookup.csv').stat().st_size / 1e6:.1f} MB)")

# Special-purpose areas have no real geometry. Log them; never drop silently.
empty = sa2[sa2.geometry.is_empty | sa2.geometry.isna()]
print(f"\nSpecial-purpose SA2s with no geometry: {len(empty)}")
if len(empty):
    print(empty[["SA2_CODE_2021", "SA2_NAME_2021"]].to_string(index=False))

# --------------------------------------------------------------------------
# 2. Greater Melbourne SA2 geometry
# --------------------------------------------------------------------------
mel = sa2[sa2["GCCSA_NAME_2021"] == GCCSA].copy()
print(f"\n{GCCSA} SA2s: {len(mel)}")

mel = mel[~(mel.geometry.is_empty | mel.geometry.isna())].copy()

invalid = ~mel.geometry.is_valid
if invalid.any():
    print(f"Repairing {int(invalid.sum())} invalid geometries")
    mel.loc[invalid, "geometry"] = mel.loc[invalid, "geometry"].make_valid()
else:
    print("All geometries valid")

changed = mel[mel["CHANGE_FLAG_2021"].astype(str) != "0"]
print(f"SA2s changed since ASGS Edition 2 (2016): {len(changed)}")

dest = OUT / "sa2_ed3_greater_melbourne.gpkg"
mel.to_file(dest, driver="GPKG")
print(f"Wrote {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")

# --------------------------------------------------------------------------
# 3. Mesh Block -> SA2 allocation for Greater Melbourne, attributes only.
#    Needed later for population-weighted zonal statistics. Census Mesh Block
#    population counts are a separate download; this is only the mapping.
# --------------------------------------------------------------------------
mb = gpd.read_file(SRC, layer=MB_LAYER, ignore_geometry=True)
mb_mel = mb[mb["GCCSA_NAME_2021"] == GCCSA][[
    "MB_CODE_2021", "MB_CATEGORY_2021", "SA1_CODE_2021",
    "SA2_CODE_2021", "AREA_ALBERS_SQKM",
]]
mb_mel.to_csv(OUT / "mb_ed3_greater_melbourne.csv", index=False)
print(f"\nMesh Blocks in {GCCSA}: {len(mb_mel)}")
print("Wrote mb_ed3_greater_melbourne.csv")

print("\nUpload sa2_ed3_lookup.csv next -- that is what validates the AEDC codes.")
