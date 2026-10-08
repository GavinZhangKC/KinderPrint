# DS-20 Pipeline reliability: reproducible acquisition, QA, lineage and KPIs

Iteration 3 added six public sources (hospital capability, Medicare costs, urgent
care clinics, notifiable illness seasons, food outlets and food composition). They
were first captured by hand in September 2026. This work makes them reproducible,
checked and traceable. Each processed number in the product can be regenerated
from its public source by one command, and a bad refresh cannot reach the dashboard.

## What runs

```
acquire_iteration3.py  ->  iteration3_qa.py  ->  six builders  ->  pytest gate  ->  pipeline_kpis.py
   fetch + parse            blocking rules       processed CSVs     266 tests         7 KPIs
   hash + change log        and warnings                            restore on fail
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

* `config/lineage.csv` gives each of the 60 processed files its producer script,
  its register source ids and its upstream processed files.
* `config/source_id_aliases.csv` resolves the six legacy ids still written by
  Iteration-2 scripts. Four are acquisition-register ids and two are combined
  ids. The alias file does this without rewriting published data.
* `tests/test_lineage.py` fails if a processed file has no lineage, if a producer
  is missing, or if any `source_id` value cannot be resolved to the register.

## KPIs (run of 29 September 2026)

| KPI | Definition | Target | Result |
|---|---|---|---|
| K1 validity | Reference files passing every blocking rule | 100% | 100% (9/9; 1 warning, explained above) |
| K2 join coverage | Scope SA2s (361) present in each SA2 table; scope SA3s (40) with cost rows | ≥ 95% | 100% for every table |
| K3 key integrity | Foreign keys that resolve (items → units, items → measures, compare → facilities) | 100% | 100% |
| K4 lineage | Processed files with complete, resolvable lineage | 100% | 100% (60/60) |
| K5 reproducibility | Builder outputs regenerated identically from committed references | 100% | 100% (9/9 files, including E2SFCA access) |
| K6 freshness | Reference files within their source's refresh cadence | 9/9 | 9/9 |
| K7 null resolution | Populated cells in columns the product displays | ≥ 90% | 98.0% |

K7 is lowest for hospital capability (89.4%). That is expected: most private
hospitals do not report emergency-department data. Missing values are never
imputed. They are shown as "not reported".

## Limitations

* The development sandbox cannot reach government hosts, so live fetches are
  exercised in GitHub Actions and verified against the live endpoints through the
  browser. The unit tests cover every parser offline.
* OpenStreetMap changes every day. Drift within 25% is expected and appears in the
  change log. It is not treated as an error.
* The MBS year is pinned to 2024-25 so that figures stay comparable. When a newer
  release appears, the configuration is changed deliberately, not automatically.
