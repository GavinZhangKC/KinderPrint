"""
Step 1 of 3 — inspect the DataVic files without loading them.

Reads only metadata and the first few rows, so a 3.45 GB folder is fine.
Prints a short report. Paste that output back and I will write the
aggregation script using the real column names.

Setup:
    pip install geopandas pyogrio

Run:
    python inspect_datavic.py /path/to/folder/containing/the/downloads
"""

import sys
from pathlib import Path

try:
    import geopandas as gpd
    import pyogrio
except ImportError:
    sys.exit("Run:  pip install geopandas pyogrio")

SEARCH = ("*.shp", "*.gdb", "*.gpkg", "*.TAB", "*.tab", "*.mif", "*.MIF")


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def folder_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def inspect(path: Path):
    print("=" * 78)
    print(f"FILE: {path.name}")
    print(f"PATH: {path}")
    size = folder_size(path) if path.is_dir() else path.stat().st_size
    print(f"SIZE: {human(size)}")

    try:
        layers = pyogrio.list_layers(path)
    except Exception as e:
        print(f"  could not list layers: {e}")
        return

    for layer_name, geom_type in layers:
        print(f"\n  LAYER: {layer_name}   geometry: {geom_type}")
        try:
            info = pyogrio.read_info(path, layer=layer_name)
            print(f"  ROWS: {info['features']:,}")
            print(f"  CRS:  {info['crs']}")
            print(f"  COLUMNS ({len(info['fields'])}):")
            for f, d in zip(info["fields"], info["dtypes"]):
                print(f"     {f:<32} {d}")
        except Exception as e:
            print(f"  could not read info: {e}")
            continue

        try:
            sample = gpd.read_file(path, layer=layer_name, rows=3)
            print("  SAMPLE ROWS:")
            for i, row in sample.drop(columns="geometry", errors="ignore").iterrows():
                vals = {k: (str(v)[:28]) for k, v in row.items()}
                print(f"     {vals}")
        except Exception as e:
            print(f"  could not read sample: {e}")


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python inspect_datavic.py /path/to/downloads/folder")
    root = Path(sys.argv[1]).expanduser()
    if not root.exists():
        sys.exit(f"Not found: {root}")

    print(f"Searching {root}\n")
    found = []
    for pattern in SEARCH:
        found.extend(root.rglob(pattern))
    # .gdb is a directory; drop anything nested inside one
    found = [p for p in found if not any(a.suffix.lower() == ".gdb" for a in p.parents)]
    found = sorted(set(found))

    if not found:
        print("No spatial files found. Are the downloads still zipped?")
        print("Unzip them first, then run this again.")
        print("\nFiles present:")
        for f in sorted(root.rglob("*"))[:40]:
            print("   ", f.relative_to(root))
        return

    print(f"Found {len(found)} spatial file(s)\n")
    for p in found:
        inspect(p)

    print("\n" + "=" * 78)
    print("Done. Copy everything above and paste it back.")


if __name__ == "__main__":
    main()
