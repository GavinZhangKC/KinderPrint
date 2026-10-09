# Family Fit ("Where to live"): build and deployment issue log

Each issue was found during the build and is fixed. Each one has a test or gate
that would catch it if it returned.

| # | Issue | How it showed | Root cause | Fix | Guard |
|---|---|---|---|---|---|
| 1 | API and data science disagreed on one shortlist | Pre-teen reference search: 62 eligible areas in the API, 61 in the engine | A need score of 49.99999999999999 against the threshold of 50 (floating-point sum of two percentiles) | Round need scores to 4 decimals (`SCORE_DECIMALS`) in the engine and the artefact | `backend/tests/test_family_fit.py::test_rankings_match_the_data_science_reference_scenarios` |
| 2 | Pipeline KPI K5 (reproducibility) at 0.82 | Rebuilt `child_nutrient_foods` and `care_compare` differed byte-for-byte | Unstable sort on tied values | Stable tie-breaks: mergesort on (value, name); `np.lexsort` on (id, rounded distance) | `scripts/pipeline_kpis.py` K5 now 1.0 |
| 3 | Forecast drifted toward the long-run mean | Early ridge forecasts sat near 2012 levels | Model fitted absolute shares across cycles with different Melbourne levels | Predict position relative to Melbourne and carry the level forward | Holdout MAE and Spearman in `school_entry_forecast.json` |
| 4 | 80% intervals under-covered | Holdout coverage 0.58–0.70 | Melbourne fell 3.5 pp in 2024, a shock no earlier cycle showed | Add a cycle-shock variance from all transitions. Coverage reported honestly | `test_forecast_*` tests; model card |
| 5 | Ridge alpha chosen at the edge of the grid | Selected alpha equal to the grid maximum | Grid too narrow | Widened the grid to 1–100,000 | Selection reported in the forecast report |
| 6 | `log(0)` warning in features | Runtime warning during fitting | Areas with zero children assessed | Use log of children only where the count is above 0 | Test run is warning-free |
| 7 | S0 mixed scales | GP and pharmacy were 94% of variance | Raw percentages mixed with ranks | Percentiles for every measure | Gate: each measure 15–35% |
| 8 | Areas with no GP inside their border scored 0 | 20 areas | Count limited to inside the border | E2SFCA across borders | Validation `of_which_have_gp_access_nearby` |
| 9 | numpy unavailable in the Lambda | Import error in the packaged function | Lambda bundle excludes numpy | Pure-Python scorer in `loaders/family_fit.py` | `test_loader_has_no_numpy_or_pandas_dependency` |
| 10 | Saved-areas tray did not hide in the prototype | Tray stayed visible after removing the last area | A CSS `display` rule overrode `[hidden]` | Render the tray only when an area is saved | Playwright state screenshots |
| 11 | Dialogs closed immediately in development | Area details flashed and closed | `dialog.close()` in a React effect cleanup fired `onClose` under StrictMode | Open once on mount; never close in cleanup | Manual and Playwright check |
| 12 | Header links collided at tablet width | "Vkinder" overlapped "Home" at 820 px after the sixth nav item | Fixed-width brand and nav | Hide the wordmark and allow nav scrolling below 1040 px | Screenshot at 820 px |
| 13 | Map pins overlapped | Rank 1 and 9 pins stacked in dense inner suburbs | Close area centroids | Spread overlapping pins; text halo on labels | Map screenshot |
| 14 | Accessibility: nested interactive and unfocusable scroll region | axe: `nested-interactive`, `scrollable-region-focusable` | Map `svg role="img"` contained buttons; compare table wrapper had no tab stop | `role="group"` on the map; table wrapper focusable with a label | axe-core WCAG 2.2 AA run: 0 violations on every state |
| 15 | Forecast limitation text quoted a stale figure | It said "about 3.8 points"; the computed shift was 3.45 | Hard-coded text | Text computed from `melbourne_level_shift_2021_2024_pp` | Report regenerated on every build |

## Deployment configuration

* Environment variables: `KINDERPRINT_FAMILY_FIT_DATA_PATH` and
  `KINDERPRINT_FAMILY_FIT_SHAPES_DATA_PATH`. They are set in `template.yaml`,
  `run_local_backend.sh` and `prepare_lambda_package.sh`.
* If the artefact is missing or invalid, the API returns an `unavailable`
  envelope (`family_fit_dataset_not_configured` / `family_fit_dataset_invalid`)
  and does not raise. The page shows an error with a retry button.
* The artefact is cached by path and modification time, so a refresh is picked
  up without a restart (tested).
