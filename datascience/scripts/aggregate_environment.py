"""
Step 2 of 3 — aggregate the DataVic environment data to 2021 SA2s.

Produces ONE small CSV (361 rows) that you upload. The 3.45 GB stays on your disk.

Method notes (these matter, and go in the methodology):
  * The heat/vegetation file is on 2016 mesh blocks; our communities are 2021
    SA2s. Rather than chase an ABS correspondence table, we overlay the polygons
    directly and area-weight. That is more accurate than a code-based crosswalk
    and it quantifies its own information loss.
  * All areas are computed in EPSG:3577 (Australian Albers, equal-area). The
    open space file arrives in EPSG:3857 (Web Mercator), where areas near
    Melbourne are inflated by roughly 60%. Its HA column is NOT trusted.
  * Open space is filtered to genuinely usable public space and dissolved before
    intersection, because one park appears as several land parcels.

Setup:
    pip install geopandas pyogrio

Run:
    python aggregate_environment.py \
        --heat  "/path/to/HEAT_URBAN_HEAT_2018.shp" \
        --open  "/path/to/VPA_Draft_Open_Space_Data.shp" \
        --sa2   "/path/to/sa2_melbourne.geojson" \
        --out   environment_by_sa2.csv
"""

import argparse
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ALBERS = 3577  # equal-area, correct for Australian area maths

VEG_COLS = ["PERANYVEG", "PERANYTREE", "PERSHRBTRE", "PERSHRUB", "PERGRASS",
            "PERTR03_10", "PERTR10_15", "PERTR15PL", "UHI18_M"]

# Open space we count as usable by young children. Recorded in ADR-005.
OPEN_SPACE_TYPES = {"Public open space"}
OPEN_SPACE_ACCESS = {"Open"}
EXCLUDE_CATEGORIES = {"Golf courses", "Tertiary institutions", "Schools",
                      "Cemeteries and crematoria", "Utilities"}


def log(msg):
    print(msg, flush=True)


def load_sa2(path: Path) -> gpd.GeoDataFrame:
    sa2 = gpd.read_file(path)
    sa2["SA2_CODE_2021"] = sa2["SA2_CODE_2021"].astype(str)
    sa2 = sa2[["SA2_CODE_2021", "SA2_NAME_2021", "geometry"]].to_crs(ALBERS)
    sa2["sa2_area_m2"] = sa2.geometry.area
    log(f"  SA2 polygons: {len(sa2)}  (expected 361)")
    return sa2


def aggregate_heat_veg(path: Path, sa2: gpd.GeoDataFrame) -> pd.DataFrame:
    log("\n[1/2] Heat and vegetation")
    mb = gpd.read_file(path)
    log(f"  mesh blocks read: {len(mb):,}  CRS {mb.crs}")

    present = [c for c in VEG_COLS if c in mb.columns]
    missing = set(VEG_COLS) - set(present)
    if missing:
        log(f"  NOTE columns absent from this file: {sorted(missing)}")

    mb = mb[present + ["MB_CODE16", "geometry"]].to_crs(ALBERS)
    mb = mb[~(mb.geometry.is_empty | mb.geometry.isna())]
    invalid = ~mb.geometry.is_valid
    if invalid.any():
        log(f"  repairing {int(invalid.sum())} invalid mesh block geometries")
        mb.loc[invalid, "geometry"] = mb.loc[invalid, "geometry"].make_valid()

    log("  overlaying mesh blocks onto SA2s (this is the slow part)...")
    inter = gpd.overlay(mb, sa2[["SA2_CODE_2021", "geometry"]], how="intersection",
                        keep_geom_type=True)
    inter["w"] = inter.geometry.area
    inter = inter[inter.w > 0]
    log(f"  intersection pieces: {len(inter):,}")

    rows = []
    for code, g in inter.groupby("SA2_CODE_2021"):
        rec = {"SA2_CODE_2021": code, "env_area_m2": float(g.w.sum())}
        for c in present:
            v = pd.to_numeric(g[c], errors="coerce")
            m = v.notna()
            rec[c.lower()] = round(float((v[m] * g.w[m]).sum() / g.w[m].sum()), 4) if m.any() else None
        rec["n_mesh_blocks"] = int(g.MB_CODE16.nunique())
        rows.append(rec)

    out = pd.DataFrame(rows).merge(sa2[["SA2_CODE_2021", "sa2_area_m2"]], on="SA2_CODE_2021", how="right")
    # How much of each SA2 the environment layer actually covers. Below ~90% the
    # value is an extrapolation from part of the area, so it gets flagged.
    out["env_coverage_pct"] = (out.env_area_m2 / out.sa2_area_m2 * 100).round(2)
    log(f"  SA2s with heat/veg data: {int(out['peranyveg'].notna().sum()) if 'peranyveg' in out.columns else 0} of {len(out)}")
    log(f"  median areal coverage: {out.env_coverage_pct.median():.1f}%")
    return out


def aggregate_open_space(path: Path, sa2: gpd.GeoDataFrame) -> pd.DataFrame:
    log("\n[2/2] Open space")
    os_gdf = gpd.read_file(path)
    log(f"  polygons read: {len(os_gdf):,}  CRS {os_gdf.crs}")

    before = len(os_gdf)
    if "OS_TYPE" in os_gdf.columns:
        log(f"  OS_TYPE values: {dict(os_gdf.OS_TYPE.value_counts().head(8))}")
        os_gdf = os_gdf[os_gdf.OS_TYPE.isin(OPEN_SPACE_TYPES)]
    if "OS_ACCESS" in os_gdf.columns:
        os_gdf = os_gdf[os_gdf.OS_ACCESS.isin(OPEN_SPACE_ACCESS)]
    if "OS_STATUS" in os_gdf.columns:
        os_gdf = os_gdf[os_gdf.OS_STATUS.astype(str).str.strip().str.lower() == "existing"]
    if "OS_CATEGOR" in os_gdf.columns:
        os_gdf = os_gdf[~os_gdf.OS_CATEGOR.isin(EXCLUDE_CATEGORIES)]
    log(f"  retained after filtering: {len(os_gdf):,} of {before:,}")

    # Web Mercator -> Albers. The file's HA column is not used.
    os_gdf = os_gdf.to_crs(ALBERS)
    os_gdf = os_gdf[~(os_gdf.geometry.is_empty | os_gdf.geometry.isna())]
    invalid = ~os_gdf.geometry.is_valid
    if invalid.any():
        log(f"  repairing {int(invalid.sum())} invalid open space geometries")
        os_gdf.loc[invalid, "geometry"] = os_gdf.loc[invalid, "geometry"].make_valid()

    log("  intersecting with SA2s...")
    inter = gpd.overlay(os_gdf[["geometry"]], sa2[["SA2_CODE_2021", "geometry"]],
                        how="intersection", keep_geom_type=True)
    log("  dissolving per SA2 so overlapping parcels are not double counted...")
    diss = inter.dissolve(by="SA2_CODE_2021").reset_index()
    diss["open_space_m2"] = diss.geometry.area

    out = sa2[["SA2_CODE_2021", "sa2_area_m2"]].merge(
        diss[["SA2_CODE_2021", "open_space_m2"]], on="SA2_CODE_2021", how="left")
    out["open_space_m2"] = out.open_space_m2.fillna(0.0)
    out["open_space_pct"] = (out.open_space_m2 / out.sa2_area_m2 * 100).round(3)
    out["open_space_ha"] = (out.open_space_m2 / 10_000).round(3)
    log(f"  SA2s with any open space: {int((out.open_space_m2 > 0).sum())} of {len(out)}")
    log(f"  median open space share: {out.open_space_pct.median():.2f}%")
    return out[["SA2_CODE_2021", "open_space_ha", "open_space_pct"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--heat", required=True)
    ap.add_argument("--open", dest="open_space", required=False)
    ap.add_argument("--sa2", required=True)
    ap.add_argument("--out", default="environment_by_sa2.csv")
    a = ap.parse_args()

    log("Loading SA2 boundaries")
    sa2 = load_sa2(Path(a.sa2))

    result = aggregate_heat_veg(Path(a.heat), sa2)

    if a.open_space:
        os_df = aggregate_open_space(Path(a.open_space), sa2)
        result = result.merge(os_df, on="SA2_CODE_2021", how="left")
    else:
        log("\n[2/2] Open space skipped (no --open given)")

    result = result.drop(columns=["env_area_m2", "sa2_area_m2"], errors="ignore")
    result.to_csv(a.out, index=False)
    size_kb = Path(a.out).stat().st_size / 1024
    log(f"\nWrote {a.out}  ({size_kb:.0f} KB, {len(result)} rows)")
    log("Upload that file.")


if __name__ == "__main__":
    main()
