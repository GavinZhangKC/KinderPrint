# DS-20 Pipeline reliability: reproducible acquisition, QA, lineage and KPIs

Iteration 3 added six public sources (hospital capability, Medicare costs, urgent
care clinics, notifiable illness seasons, food outlets and food composition). They
were first captured by hand in September 2026. This work makes them reproducible,
checked and traceable. Each processed number in the product can be regenerated
from its public source by one command, and a bad refresh cannot reach the dashboard.

## What runs

```
acquire_iteration3.py  ->  iteration3_qa.py  ->  builders      ->  pytest gate  ->  pipeline_kpis.py
   fetch + parse            blocking rules       processed CSVs     test suite        7 KPIs
   hash + change log        and warnings                            restore on any fail
```

| Command | What it does |
|---|---|
| `python scripts/refresh_iteration3.py` | Live refresh: acquire, QA, build, test gate and KPIs |
| `python scripts/refresh_iteration3.py --offline` | Same run without network: re-verifies the committed files |
| `python scripts/acquire_iteration3.py --source <id> --dry-run` | Fetch and QA one source without writing anything |
| `python scripts/pipeline_kpis.py` | KPIs only |

`.github/workflows/data-refresh.yml` runs the live refresh every Monday at 05:17
Melbourne time and on demand. On pull requests it runs the offline gate. The
workflow never pushes. Refreshed files, QA reports and change logs are uploaded
as an artifact, and a person reviews and commits them on a feature branch.

## Sources and extraction rules

| Source id | Endpoint | Selection reproduced |
|---|---|---|
| aihw_myhospitals_api_2026 | MyHospitals API v1: `reporting-units`, `reported-measures`, `datasets`, `reported-measures/{code}/data-items` | Units mapped to state `Vic`. Data items are kept for the 11 pinned ED and elective-surgery reported measures plus every MYH0039 specialised-unit measure. Only the latest period per unit and measure is kept, and closed units are excluded. |
| aihw_phc_019_mbs_local_areas_2024_25 | AIHW data page, then the CSV zip that contains 2024-25 | Victorian SA3 and national rows; 16 services; 7 measures; `All persons` and `0-24`. `$`, `,` and `%` are removed; `n.p.` stays missing. |
| betterhealth_urgent_care_clinics_2026 | Better Health map feed `map-data?pid=29639` | Every record. HTML is stripped from the phone and the healthdirect link. |
| nndss_public_datasets_2025 | CDC publication pages, then the influenza and salmonella xlsx | Record-level rows for `Vic`, counted by week-ending month and age group across all year sheets. |
| osm_overpass_food_outlets_2026 | Overpass API | 8 food shop types, marketplaces and any `organic=yes/only`. Search box: the SA2 geojson bbox. Kept: points within Greater Melbourne SA2s. |
| fsanz_afcd_release_3 | FSANZ data-files page, then the Nutrient profiles xlsx | Sheet `All solids & liquids per 100 g`; 22 named columns. Multi-line headers are normalised. |

Download links are found on each landing page at run time rather than hard-coded,
because agencies rename files when they republish. Fetches retry with back-off.
The MyHospitals API sometimes answers a large request with an HTML error page;
that answer is retried, not parsed.

## Reconciliation with the hand-captured snapshot

The rules were checked against the live sources on 30 September 2026.

* **MyHospitals.** The rules reproduce all 1,580 committed data items exactly,
  including value, reporting period and suppression code. The only difference
  before the closed-unit rule was added was 19 rows from two LHNs merged in 2022
  (Ballarat Health Services and Wimmera Health Care Group). This is why closed
  units are excluded.
* **AIHW MBS.** The filter returns 8,316 Victorian SA3 rows and 238 national rows,
  the same as the snapshot.
* **The other four sources.** Parsers are tested on fixtures that copy the live
  payload shapes. The first scheduled run writes a row-level change log against
  the snapshot. That log is the acceptance evidence for these four sources.

## QA rules (`scripts/iteration3_qa.py`)

Every file gets five rule families:

* schema: exact columns
* volume: a minimum row count, and row drift within 10-30% of the previous file
* key: primary key populated and unique
* geography: coordinates inside the Victorian or Greater Melbourne envelope
* domain rules for the file

Domain examples:

* ED percentages are between 0 and 100.
* Every data item has a value or a suppression code.
* Provider fees are not below Medicare benefits.
* NNDSS months are `YYYY-MM` and all seasonal reference years are present.
* AFCD nutrients are non-negative and energy is at most 3,800 kJ per 100 g.
* Every food outlet is in scope.

Blocking rules stop a source from being published, and its previous files stay
in place. Warnings are reported and handled downstream. Each run writes
`reports/iteration3/qa_<file>.json` with the evidence for every rule.

### What the rules found in the hand-captured data

1. **Duplicate national rows.** AIHW publishes the national rows in both Table 2
   and Table 3, so the snapshot held 112 exact duplicates. They are now removed
   (8,554 → 8,442 rows). Downstream figures do not change, because the builder
   took the first value.
2. **A negative out-of-pocket cost reached the product.** For the national 0-24 GP
   row, AIHW publishes provider fees of $838m but Medicare benefits of $1,585m.
   Our derived "patient contribution per service" was therefore **-$25.23**. The
   compare-care API served that value as the national comparison, and the Compare
   care cost table displays that field. The builder now
   derives no gap when fees are below benefits, and the QA rule reports it as a
   warning. A regression test covers the case.

## Change detection

`data/reference/iteration3/manifest.json` records these fields for each file:

* source
* capture time and last verification time
* row count
* columns
* file SHA-256
* a canonical content hash (rows sorted by key, numbers normalised)

The canonical hash ignores row order and formatting. For example, `1,234` and
`1234` hash the same, so only real content changes trigger a new version. When the
content changes, `reports/iteration3/changes/<date>_<file>.csv` lists every added,
removed and changed row, and names the changed columns.

## Lineage

* `config/lineage.csv` gives each of the 67 processed files its producer script,
  its register source ids and its upstream processed files.
* `config/source_id_aliases.csv` resolves the six legacy ids still written by
  Iteration-2 scripts. Four are acquisition-register ids and two are combined
  ids. The alias file does this without rewriting published data.
* `tests/test_lineage.py` fails if a processed file has no lineage, if a producer
  is missing, or if any `source_id` value cannot be resolved to the register.

## Promotion rule (corrected 12 October 2026)

An independent review found that a missed KPI target still published the new
files (`published; KPI target missed`). Now:

* Before stage 1 the refresh snapshots every file it can write: the Iteration-3
  reference files and manifest, every builder output and every served artefact,
  noting which files did not exist yet.
* Any failure, including a missed KPI target, restores each file exactly and
  removes files created during the run. The outcome reads
  `stopped: …; previous version kept` (exit 2 for a missed KPI, 1 otherwise).
* `tests/test_refresh_rollback.py` injects a failure at each stage (acquire,
  build, test gate, KPI) and on a first run with no previous version.
* `reports/iteration3/refresh_rejected_run.json` records a real run on the
  repository: builders ran, a bad served artefact was written, a KPI was missed,
  and all 25 tracked files were byte-identical afterwards.
* The refresh runs on a CI checkout or a working copy, never on files the API is
  serving. A person reviews and commits the result, so no reader sees a partial run.

## Scope

The refresh rebuilds 11 builders and 13 processed files: the six Iteration-3
sources, E2SFCA access, and everything downstream of access (practitioner
context and In 2031 future demand), the school-entry outlook and Family Fit.
Priority V2 (`model_expected_vulnerability.py`) is rebuilt by its own command:
its inputs (AEDC, SEIFA, Census) change only with new releases, not weekly.
K6 tracks freshness of the nine Iteration-3 reference files only.

## KPIs (latest run, 11 October 2026, after the corrections)

| KPI | Definition | Target | Result |
|---|---|---|---|
| K1 validity | Reference files passing every blocking rule | 100% | 100% |
| K2 join coverage | Scope SA2s (361) present in each SA2 table; scope SA3s (40) with cost rows | ≥ 95% | 100% for every table |
| K3 key integrity | Foreign keys that resolve | 100% | 100% |
| K4 lineage | Processed files with complete, resolvable lineage | 100% | 100% (67/67) |
| K5 reproducibility | Builder outputs regenerated identically from committed references | 100% | 100% (13/13 files) |
| K6 freshness | Reference files within their source's refresh cadence | 9/9 | 9/9 |
| K7 display completeness | Populated cells in the columns the product displays (mean of per-table shares) | ≥ 90% | 98.67%: 71,085 of 71,346 cells populated, 261 missing kept, 0 imputed |

K7 was previously called "null resolution". It does not measure nulls resolved
by cleaning: missing values (suppressed, not published, not applicable, no
service in range) stay missing and are counted. It is completeness, not accuracy.
K7 is lowest for hospital capability: most private hospitals do not report
emergency-department data, shown as "not reported".

## Workflow runs

The scheduled and on-demand jobs run from the default branch, so they will start
once this workflow is merged there. Until then, the offline gate runs on any pull
request that touches `datascience/`, and the local evidence is
`reports/iteration3/refresh_run.json` (successful offline run) and
`refresh_rejected_run.json` (rejected run).

## Limitations

* The development sandbox cannot reach government hosts, so live fetches are
  exercised in GitHub Actions and verified against the live endpoints through the
  browser. The unit tests cover every parser offline.
* OpenStreetMap changes every day. Drift within 25% is expected and appears in the
  change log. It is not treated as an error.
* The MBS year is pinned to 2024-25 so that figures stay comparable. When a newer
  release appears, the configuration is changed deliberately, not automatically.
