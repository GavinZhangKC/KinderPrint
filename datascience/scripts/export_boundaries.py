"""
KinderPrint -- export Greater Melbourne SA2 boundaries.

This is the GEOMETRY export. It is different from sa2_ed3_lookup.csv, which has
names and codes but no shapes. The backend needs GeoJSON, so that is the primary
output; a GeoPackage copy is written too in case QGIS or PostGIS is wanted later.

Setup:
    pip install geopandas

Run (from anywhere):
    python export_boundaries.py

It searches for the national ASGS .gpkg under the current folder, your Desktop
and Downloads. If it cannot find it, set GPKG_PATH near the top by hand.
"""

import sys
from pathlib import Path

try:
    import geopandas as gpd
except ImportError:
    sys.exit("geopandas is not installed. Run:  pip install geopandas")

GPKG_PATH = None          # e.g. Path("/Users/you/Desktop/ASGS_2021.gpkg")
SA2_LAYER = "SA2_2021_AUST_GDA2020"
TARGET_GCCSA = "Greater Melbourne"
EXPECTED_SA2 = 361


def find_gpkg() -> Path:
    if GPKG_PATH:
        return Path(GPKG_PATH)
    home = Path.home()
    roots = [Path.cwd(), home / "Desktop", home / "Downloads", home]
    seen = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*.gpkg"):
            if path.stat().st_size > 50_000_000:      # the national file is large
                return path
            seen.append(path)
    if seen:
        print("Found .gpkg files, but none look like the national ASGS file:")
        for p in seen[:10]:
            print(f"   {p}  ({p.stat().st_size / 1e6:.1f} MB)")
    sys.exit("Could not find the national ASGS .gpkg. Set GPKG_PATH at the top of this file.")


src = find_gpkg()
out_dir = src.parent
print(f"Source: {src}")
print(f"        {src.stat().st_size / 1e6:.0f} MB\n")

print("Reading SA2 layer with geometry (takes a minute)...")
sa2 = gpd.read_file(src, layer=SA2_LAYER)
print(f"National SA2 records: {len(sa2)}")
print(f"CRS: {sa2.crs}")

if "geometry" not in sa2.columns or sa2.geometry.isna().all():
    sys.exit("No geometry was read. Check the layer name is correct.")

mel = sa2[sa2["GCCSA_NAME_2021"] == TARGET_GCCSA].copy()
print(f"\n{TARGET_GCCSA} SA2s: {len(mel)}  (expected {EXPECTED_SA2})")
if len(mel) != EXPECTED_SA2:
    print("  NOTE: count differs from expected -- report this before uploading.")

empty = mel.geometry.is_empty | mel.geometry.isna()
if empty.any():
    print(f"Dropping {int(empty.sum())} records with no geometry (special-purpose areas)")
    mel = mel[~empty].copy()

invalid = ~mel.geometry.is_valid
if invalid.any():
    print(f"Repairing {int(invalid.sum())} invalid geometries")
    mel.loc[invalid, "geometry"] = mel.loc[invalid, "geometry"].make_valid()
else:
    print("All geometries valid")

keep = [c for c in ["SA2_CODE_2021", "SA2_NAME_2021", "SA3_CODE_2021", "SA3_NAME_2021",
                    "SA4_CODE_2021", "SA4_NAME_2021", "GCCSA_NAME_2021",
                    "STATE_NAME_2021", "geometry"] if c in mel.columns]
mel = mel[keep]

# GeoPackage copy, kept in the native GDA2020 CRS.
gpkg_out = out_dir / "sa2_ed3_greater_melbourne.gpkg"
mel.to_file(gpkg_out, driver="GPKG")
print(f"\nWrote {gpkg_out.name}  ({gpkg_out.stat().st_size / 1e6:.1f} MB)")

# GeoJSON for the backend. Must be WGS 84 lon/lat.
geo = mel.to_crs(4326)
geojson_out = out_dir / "sa2_melbourne.geojson"
geo.to_file(geojson_out, driver="GeoJSON")
size = geojson_out.stat().st_size / 1e6
print(f"Wrote {geojson_out.name}  ({size:.1f} MB)")

if size > 80:
    simple = geo.copy()
    simple["geometry"] = simple.to_crs(3577).simplify(15).to_crs(4326)
    small = out_dir / "sa2_melbourne_simplified.geojson"
    simple.to_file(small, driver="GeoJSON")
    print(f"Wrote {small.name}  ({small.stat().st_size / 1e6:.1f} MB)  <-- upload this one instead")

print(f"\nDONE. {len(mel)} SA2s. Upload the .geojson file.")
