# Data access — how to run this on another machine

Raw source files are **not committed**. They are 3.45 GB, immutable, and freely
re-downloadable from the publishers. What travels in git instead is their SHA-256
checksums, so any published figure can be traced to the exact bytes that produced it.

---

## What you can do without any raw data

Everything except rebuilding from source. The derived tables in `data/processed/`
and the reference geography in `data/reference/` are committed.

```bash
git clone <repo>
cd KinderPrint/datascience
pip install -r requirements.txt
python -m pytest tests/ -q          # 55 passed
```

This is what a marker or reviewer needs. No downloads, no credentials, no AWS.

---

## Rebuilding from source

### 1. Tell the pipeline where the raw data lives

Raw data can sit anywhere. Point at it with an environment variable:

```bash
export KINDERPRINT_RAW_DIR=/absolute/path/to/data/raw
python -m scripts.refresh_data
```

Or place it at `datascience/data/raw/`, which is the default and is gitignored.

To make it permanent, add the export to `~/.zshrc` or `~/.bashrc`.

### 2. Expected layout

The pipeline searches recursively, so subdirectory names are flexible. It needs
to find these three filename patterns:

```
<raw>/
  aedc/2026-08-28/sa2-2009-24.xlsx
  seifa/2026-08-30/Statistical_Area_Level_2__Indexes__SEIFA_2021.xlsx
  census/2026-08-30/2021 Census GCP Statistical Area 2 for VIC/
      2021Census_G01_VIC_SA2.csv
      2021Census_G02_VIC_SA2.csv
      2021Census_G32_VIC_SA2.csv
      2021Census_G46B_VIC_SA2.csv
      2021Census_G49B_VIC_SA2.csv
```

Date-stamped folders record when the file was accessed. Keep them; never
overwrite a previous download in place.

### 3. Environment data

`data/interim/environment_by_sa2.csv` (about 40 KB) is produced from the two
DataVic spatial files by `scripts/aggregate_environment.py`. That step needs
~3 GB of shapefiles and takes several minutes, so the small output is committed
and the pipeline reads it directly.

If it is absent the pipeline still runs; the Environment domain reports
`unavailable` rather than failing. Regenerating it:

```bash
python scripts/aggregate_environment.py \
    --heat "<path>/HEAT_URBAN_HEAT_2018.shp" \
    --open "<path>/VPA_Draft_Open_Space_Data.shp" \
    --sa2  data/reference/sa2_melbourne.geojson \
    --out  data/interim/environment_by_sa2.csv
```

---

## Where to download each source

| Source | Where | Format |
|---|---|---|
| AEDC by SA2 2009–2024 | https://www.aedc.gov.au/data-hub/public-data/additional-data → "Data by Statistical Areas Level 2 (SA2s) (2009-24)" | xlsx |
| SEIFA 2021, SA2 indexes | https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/latest-release → Data downloads → SA2 | xlsx |
| Census 2021 GCP, SA2, Victoria | https://www.abs.gov.au/census/find-census-data/datapacks → 2021 → General Community Profile → SA2 → VIC | zip of CSVs |
| ASGS Edition 3 boundaries | https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files | GeoPackage |
| Cooling & Greening: UHI + urban vegetation 2018 | https://datashare.maps.vic.gov.au/search?md=ea69bd5e-3682-5326-b1ec-8e2964baa6a0 | SHP |
| Open Space (VPA) | https://discover.data.vic.gov.au/dataset/open-space | SHP / GeoJSON |

**Use ASGS Edition 3, not "latest release".** Edition 4 became the ABS default in
July 2026. Its SA2 codes partially match Edition 3, so a naive join succeeds and is
silently wrong. The URL must contain `edition-3-july-2021-june-2026`.

Full provenance, licensing and known limitations for every source are in
`config/data_source_register.csv`, including four sources assessed and rejected.

---

## Verifying you have the right files

Checksums from the reference run (`outputs/iteration_1/run_manifest.json`):

| File | Bytes | SHA-256 |
|---|---|---|
| `sa2-2009-24.xlsx` | 6,023,948 | `4ffd8d5882f8e2f35d59eb2dae4d2bd0dab0e2afe4ac118b5913a6110c6ae8f9` |
| `Statistical_Area_Level_2__Indexes__SEIFA_2021.xlsx` | 1,316,059 | `372124bbf1044e03216f87188f98b82d39a5a03a5138ed05e8f222abf8faf4f0` |
| `sa2_ed3_lookup.csv` | 268,861 | `b8fbadfbd688a710da581e2e870adac9df87c8005478f0d468e7746f1a8e594e` |
| `sa2_melbourne.geojson` | 10,178,933 | `cf99a5c24a46393cad4aed4acc502a96fa54708c89bce6e44a54e88efdc582a2` |

Check one:

```bash
shasum -a 256 /path/to/sa2-2009-24.xlsx      # macOS
sha256sum  /path/to/sa2-2009-24.xlsx         # Linux
```

A different hash means a different file. That is a finding, not a nuisance — the
publisher may have reissued the data, and any result computed from it needs
re-checking rather than assuming.

Every run writes its own checksums to `outputs/iteration_1/run_manifest.json`, so
each published artefact carries the fingerprint of the exact inputs behind it.

---

## Sharing raw data within the team

Options, in order of preference:

1. **Each person downloads from the publishers.** Slowest, but guarantees everyone
   has authentic files, and the checksums above confirm it.
2. **Shared cloud folder** (Google Drive, OneDrive). Mirror the layout above.
   Record the link here so it is discoverable.
3. **S3 bucket** with versioning enabled, if the project deploys to AWS.

Do not commit raw data to git. It is large, it never changes, and the repository
would carry it forever in its history.

---

## Two derived files worth knowing about

Both are committed, both are regenerated by scripts:

| File | Made by | Why committed |
|---|---|---|
| `data/reference/sa2_melbourne.geojson` | `scripts/export_boundaries.py` | Derived from a 500 MB national GeoPackage that is impractical to share |
| `data/interim/environment_by_sa2.csv` | `scripts/aggregate_environment.py` | Derived from ~3 GB of shapefiles; the output is 40 KB |

Both scripts are in the repository, so the derivation is reproducible even though
the inputs are not distributed.
