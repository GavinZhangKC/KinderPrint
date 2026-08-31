"""
Export Greater Melbourne SA2 polygons as GeoJSON.

This is the GEOMETRY export. It is separate from sa2_ed3_lookup.csv, which
carries names and codes but no shapes.

Output feeds boundaries.geojson for the backend. Dissolving the 13 merged AEDC
reporting areas, assigning neighbourhood_id and adding the required properties
all happen downstream -- this script only needs to get the shapes out.

Run:
    python export_melbourne_geojson.py
"""

import geopandas as gpd
from pathlib import Path

SRC = Path("/Users/karthikapillaikumar/Desktop/KinderPrint/data/ASGS_2021_Main_Structure_GDA2020.gpkg")
OUT = Path("/Users/karthikapillaikumar/Desktop/KinderPrint/data/sa2_melbourne.geojson")

# Adjust SRC above if your national .gpkg has a different filename.

print("Reading SA2 layer (this takes a minute)...")
sa2 = gpd.read_file(SRC, layer="SA2_2021_AUST_GDA2020")
print(f"National SA2 records: {len(sa2)}   CRS: {sa2.crs}")

mel = sa2[sa2["GCCSA_NAME_2021"] == "Greater Melbourne"].copy()
print(f"Greater Melbourne SA2s: {len(mel)}   (expect 361)")

# Drop the special-purpose areas that carry no real geometry.
empty = mel.geometry.is_empty | mel.geometry.isna()
if empty.any():
    print(f"Dropping {int(empty.sum())} records with no geometry")
    mel = mel[~empty].copy()

# Repair rather than discard any invalid rings.
invalid = ~mel.geometry.is_valid
if invalid.any():
    print(f"Repairing {int(invalid.sum())} invalid geometries")
    mel.loc[invalid, "geometry"] = mel.loc[invalid, "geometry"].make_valid()
else:
    print("All geometries valid")

# GeoJSON must be WGS 84 lon/lat. GDA2020 (EPSG:7844) is close but convert
# explicitly so the backend's -180..180 / -90..90 checks are unambiguous.
mel = mel.to_crs(4326)

keep = ["SA2_CODE_2021", "SA2_NAME_2021", "SA3_NAME_2021",
        "SA4_NAME_2021", "GCCSA_NAME_2021", "geometry"]
mel = mel[[c for c in keep if c in mel.columns]]

mel.to_file(OUT, driver="GeoJSON")
size_mb = OUT.stat().st_size / 1e6
print(f"\nWrote {OUT.name}  ({size_mb:.1f} MB)")

# If the file is very large, write a simplified copy as well and upload that
# one instead. 10 m tolerance is invisible at Melbourne-wide zoom levels.
if size_mb > 60:
    simple = mel.copy()
    simple["geometry"] = simple.to_crs(3577).simplify(10).to_crs(4326)
    alt = OUT.with_name("sa2_melbourne_simplified.geojson")
    simple.to_file(alt, driver="GeoJSON")
    print(f"Also wrote {alt.name} ({alt.stat().st_size / 1e6:.1f} MB) -- upload this one")

print("\nUpload the .geojson file.")
