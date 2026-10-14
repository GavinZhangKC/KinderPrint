# Iteration 3 work and assignment reconciliation

Reviewed 13 October 2026 against pre-main 37e291b and LeanKit export 14. Scope is Iteration 3 only. No claim is made that Done means independently accepted.

## Assignment counts

| Type | Total | Karthika alone | Karthika jointly | Any Karthika assignment | No Karthika assignment |
|---|---:|---:|---:|---:|---:|
| User Story | 17 | 5 | 3 | 8 | 9 |
| Acceptance Criteria | 33 | 13 | 1 | 14 | 19 |

Joint stories: US 9.1 and US 12.2 with Guangze Zhang; US 13.2 with Guangze Zhang and Zhiyue Shen. Joint AC: 13.1.1 with Guangze Zhang and Zhiyue Shen. Counts use membership on the US/AC itself, not inherited task ownership. The 33 ACs include 32 numbered cards and the Siva-owned simulation acceptance card.

## Mentor feedback

Acceptance criteria must describe behavior for supported areas in general. Brunswick East, Box Hill or another named locality can be a test fixture, but must not define the whole product requirement. Use separate supported, unavailable and unsupported examples; the expected values belong to a versioned test dataset. Iteration 3 US/AC descriptions currently do not hard-code Brunswick East.

## Documentation verdict

The major recent deliveries are represented, but documentation was not complete enough to claim every contribution had direct evidence. The table below reconciles every Karthika-authored non-merge commit in pre-main since 25 September. The window includes late-September foundations that feed Iteration 3; a date alone does not reclassify older work. A topic mapping is weaker than an original explicit commit reference.

The following gaps remain meaningful:

- Eight Epic 9 to 16 Definition of Done cards copied unrelated comparison requirements. These have now been corrected to their own epic scope, with the geography feedback and an evidence requirement.
- Earlier frontend iterations, GP-preparation work, vaccine styling, dark theme and infrastructure changes were covered broadly, but many lacked exact commit references. This reconciliation adds those references without making duplicate delivery cards.
- Some late-September backend foundation commits are documented only in I2-DSBE cards. Treat these as reused dependencies of Iteration 3, and cross-reference them; do not claim them as new Iteration 3 deliveries.
- The data management plan is recorded in Iteration 1, not as a distinct Iteration 3 revision. No new revision is asserted without an artifact.
- I3-BG-01 through I3-BG-10 have duplicate titles/cards in the export. They should be reconciled before counting work totals; no duplicate was deleted in this review.
- Simulation had a broad implementation card with no description. The card now records radar, analogue, playback, waterfall and result-layout commits. Its acceptance card and two tasks cover verification, not the full build record.
- Accessibility, full cross-area acceptance, evidence-to-interface checks, independent refresh dry run and weighted opportunity ranking remain open. Existing cards already track these; they are not undocumented completed work.

## Commit-to-card evidence

| Commit | Date | Work | Existing LeanKit coverage | Original exact reference |
|---|---|---|---|---|
| [4780d5c](https://github.com/GavinZhangKC/KinderPrint/commit/4780d5c) | 2026-10-12 | Vaccines timeline for parents and practitioners; Seasons names the health issue | [[I3-CH-15] Build vaccine timelines and printable report](https://monashie.leankit.com/card/2529902917) | Yes |
| [37f290b](https://github.com/GavinZhangKC/KinderPrint/commit/37f290b) | 2026-10-11 | Close review findings: safe refresh promotion, full-search stability, honest forecast and explanation validation | [Build the Where to Live Family Fit engine](https://monashie.leankit.com/card/2529478669) | Yes |
| [bfa5f79](https://github.com/GavinZhangKC/KinderPrint/commit/bfa5f79) | 2026-10-11 | Child Health opens the map; area profile leads to the board or Where to live | [Build Where to Live and map navigation](https://monashie.leankit.com/card/2529478603) | Yes |
| [1573994](https://github.com/GavinZhangKC/KinderPrint/commit/1573994) | 2026-10-11 | Loader: renew the API login without naming SUPERUSER, which RDS admins may not alter | [Implement PostgreSQL storage and database infrastructure](https://monashie.leankit.com/card/2529478676) | Yes |
| [d855fb6](https://github.com/GavinZhangKC/KinderPrint/commit/d855fb6) | 2026-10-11 | Budget alerts through the vkinder-alerts topic so a new alert email no longer replaces the budget | [Implement PostgreSQL storage and database infrastructure](https://monashie.leankit.com/card/2529478676) | No, added by this reconciliation |
| [67897e9](https://github.com/GavinZhangKC/KinderPrint/commit/67897e9) | 2026-10-11 | In 2031, Play today and Plan a change: future demand, play conditions and area change views | [[I3-DS-24] Build future demand datasets and API](https://monashie.leankit.com/card/2529811277) | Yes |
| [a7aab2d](https://github.com/GavinZhangKC/KinderPrint/commit/a7aab2d) | 2026-10-11 | Child Health: Seasons and Care nearby pages for parents and practitioners | [[I3-CH-10] Build seasonal planner and evidence tabs](https://monashie.leankit.com/card/2529810204) | Yes |
| [0c59cb8](https://github.com/GavinZhangKC/KinderPrint/commit/0c59cb8) | 2026-10-10 | Vkinder PostgreSQL storage and AWS database stack with a daily credit guard | [Implement PostgreSQL storage and database infrastructure](https://monashie.leankit.com/card/2529478676) | No, added by this reconciliation |
| [98df382](https://github.com/GavinZhangKC/KinderPrint/commit/98df382) | 2026-10-10 | Child Health dark theme: one navy and periwinkle palette for parent and practitioner views | [Unify dashboard colours and dark theme](https://monashie.leankit.com/card/2529478854) | No, added by this reconciliation |
| [8b94c52](https://github.com/GavinZhangKC/KinderPrint/commit/8b94c52) | 2026-10-09 | Midnight Glass dark theme for Where to live, Child Health pages and the area chooser | [Unify dashboard colours and dark theme](https://monashie.leankit.com/card/2529478854) | No, added by this reconciliation |
| [2e7bdfe](https://github.com/GavinZhangKC/KinderPrint/commit/2e7bdfe) | 2026-10-09 | Map and Child Health: choose an area, open its board from the map | [Build Where to Live and map navigation](https://monashie.leankit.com/card/2529478603) | No, added by this reconciliation |
| [467e8e4](https://github.com/GavinZhangKC/KinderPrint/commit/467e8e4) | 2026-10-09 | Where to live: map labels and full-screen map, clearer unavailable-area states | [Build Where to Live and map navigation](https://monashie.leankit.com/card/2529478603) | No, added by this reconciliation |
| [21ec983](https://github.com/GavinZhangKC/KinderPrint/commit/21ec983) | 2026-10-09 | Where to live: model card, ADR-009, deployment log, data dictionary and API contract | [Document the Family Fit model and API](https://monashie.leankit.com/card/2529478395) | No, added by this reconciliation |
| [4d07dde](https://github.com/GavinZhangKC/KinderPrint/commit/4d07dde) | 2026-10-09 | Where to live: new page, navigation entry points and map deep link | [Build Where to Live and map navigation](https://monashie.leankit.com/card/2529478603) | No, added by this reconciliation |
| [436ef0f](https://github.com/GavinZhangKC/KinderPrint/commit/436ef0f) | 2026-10-09 | Where to live: family-fit API (setup, search, area details, shapes) | [Connect the Family Fit API](https://monashie.leankit.com/card/2529479055) | No, added by this reconciliation |
| [e6d14c9](https://github.com/GavinZhangKC/KinderPrint/commit/e6d14c9) | 2026-10-09 | Where to live: Family Fit S2 engine, 2027 school-entry forecast and gated refresh | [Build the Where to Live Family Fit engine](https://monashie.leankit.com/card/2529478669) | No, added by this reconciliation |
| [57054b5](https://github.com/GavinZhangKC/KinderPrint/commit/57054b5) | 2026-10-08 | Vaccines: stop coverage percentages overlapping the bar | [[I3-CH-08] Child Health visual and responsive styling](https://monashie.leankit.com/card/2528551698) | No, added by this reconciliation |
| [9cf4efd](https://github.com/GavinZhangKC/KinderPrint/commit/9cf4efd) | 2026-10-08 | Child Health: use one typeface (Manrope) for all headings, body, data and controls | [[I3-CH-08] Child Health visual and responsive styling](https://monashie.leankit.com/card/2528551698) | No, added by this reconciliation |
| [7e8908c](https://github.com/GavinZhangKC/KinderPrint/commit/7e8908c) | 2026-10-08 | Child Health: keep tab labels on one line so narrow screens scroll the tab row | [[I3-CH-08] Child Health visual and responsive styling](https://monashie.leankit.com/card/2528551698) | No, added by this reconciliation |
| [8dbce7b](https://github.com/GavinZhangKC/KinderPrint/commit/8dbce7b) | 2026-10-08 | Child Health: responsive type scale, clearer limitations, less density | [[I3-CH-08] Child Health visual and responsive styling](https://monashie.leankit.com/card/2528551698) | No, added by this reconciliation |
| [c5197c8](https://github.com/GavinZhangKC/KinderPrint/commit/c5197c8) | 2026-10-08 | Child Health: theme the site header and page background on hub pages | [Unify dashboard colours and dark theme](https://monashie.leankit.com/card/2529478854) | No, added by this reconciliation |
| [496ef84](https://github.com/GavinZhangKC/KinderPrint/commit/496ef84) | 2026-10-08 | Child Health: simplify Vaccines page and remove sensitive terms | [I3-BG-04: Develop the Vaccination Planning and Reminder Workflow](https://monashie.leankit.com/card/2523712738) | No, added by this reconciliation |
| [8087c56](https://github.com/GavinZhangKC/KinderPrint/commit/8087c56) | 2026-10-08 | Child Health: Vaccines page with nearby places finder and kinder readiness | [I3-BG-04: Develop the Vaccination Planning and Reminder Workflow](https://monashie.leankit.com/card/2523712738) | No, added by this reconciliation |
| [587b4e3](https://github.com/GavinZhangKC/KinderPrint/commit/587b4e3) | 2026-10-08 | Child Health: redesign Health topics page for parents and practitioners | [[I3-CH-05] Health topic navigation and hotspots](https://monashie.leankit.com/card/2528551174) | Yes |
| [d5d094e](https://github.com/GavinZhangKC/KinderPrint/commit/d5d094e) | 2026-10-08 | Child Health: redesign Healthy day check in the parent green theme | [[I3-CH-03] Healthy day inputs and saved answers](https://monashie.leankit.com/card/2528548902) | Yes |
| [bedf48d](https://github.com/GavinZhangKC/KinderPrint/commit/bedf48d) | 2026-10-08 | Child Health: new Today page for parents and practitioners on latest pre-main | [[I3-CH-01] Parent Today overview and daily routine](https://monashie.leankit.com/card/2528374931) | Yes |
| [bf92e75](https://github.com/GavinZhangKC/KinderPrint/commit/bf92e75) | 2026-09-28 | Redesign the child health dashboard with parent and practitioner views | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [0fbb6cb](https://github.com/GavinZhangKC/KinderPrint/commit/0fbb6cb) | 2026-09-28 | Add Vaccinations, Nutrition and Prevention pages to the child health dashboard | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [9a2a7a8](https://github.com/GavinZhangKC/KinderPrint/commit/9a2a7a8) | 2026-09-28 | Add nutrition and prevention context endpoints | [I2-DSBE-50: Add Nutrition and Prevention Context Endpoints](https://monashie.leankit.com/card/2523599674) | Yes |
| [1ae2c61](https://github.com/GavinZhangKC/KinderPrint/commit/1ae2c61) | 2026-09-28 | Restore VCAMS area table to Department-area rows only | [I2-DSBE-49: Restore VCAMS Department Area Rows](https://monashie.leankit.com/card/2523599670) | Yes |
| [32eb6c1](https://github.com/GavinZhangKC/KinderPrint/commit/32eb6c1) | 2026-09-28 | Bridge SA2s to VCAMS Department areas and keep Victorian totals | [I2-DSBE-48: Bridge SA2s to VCAMS Department Areas and Keep Victorian Totals](https://monashie.leankit.com/card/2523599270) | Yes |
| [a9fadc5](https://github.com/GavinZhangKC/KinderPrint/commit/a9fadc5) | 2026-09-28 | Add PHA immunisation coverage endpoint with pooled Victorian reference | [I2-DSBE-47: Add PHA Immunisation Coverage Endpoint with Pooled Victorian Reference](https://monashie.leankit.com/card/2523599266) | Yes |
| [b2864d4](https://github.com/GavinZhangKC/KinderPrint/commit/b2864d4) | 2026-09-28 | Expand parent observations into nine-page guided assessment | [[I3-CH-06] Parent health checklists and care actions](https://monashie.leankit.com/card/2528550794) | No, added by this reconciliation |
| [714cc6e](https://github.com/GavinZhangKC/KinderPrint/commit/714cc6e) | 2026-09-28 | Turn parent preparation checklist into actionable care workflow | [[I3-CH-06] Parent health checklists and care actions](https://monashie.leankit.com/card/2528550794) | No, added by this reconciliation |
| [bc00f59](https://github.com/GavinZhangKC/KinderPrint/commit/bc00f59) | 2026-09-28 | Add direct single-locality child health entry | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [f6bc0cd](https://github.com/GavinZhangKC/KinderPrint/commit/f6bc0cd) | 2026-09-28 | Build locality-aware child health preparation journeys | [[I3-CH-06] Parent health checklists and care actions](https://monashie.leankit.com/card/2528550794) | No, added by this reconciliation |
| [c25de49](https://github.com/GavinZhangKC/KinderPrint/commit/c25de49) | 2026-09-28 | Add accessible motion dependencies for health journeys | [[I3-CH-06] Parent health checklists and care actions](https://monashie.leankit.com/card/2528550794) | No, added by this reconciliation |
| [39656c9](https://github.com/GavinZhangKC/KinderPrint/commit/39656c9) | 2026-09-26 | Route map comparisons into child health dashboard | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [bb72e81](https://github.com/GavinZhangKC/KinderPrint/commit/bb72e81) | 2026-09-26 | Build audience-specific child health comparison | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [79ba213](https://github.com/GavinZhangKC/KinderPrint/commit/79ba213) | 2026-09-26 | Make digital health dashboards locality aware | [[I3-CH-09] Integrate Child Health pages and data](https://monashie.leankit.com/card/2528551297) | No, added by this reconciliation |
| [c218191](https://github.com/GavinZhangKC/KinderPrint/commit/c218191) | 2026-09-26 | Expose locality-resolved child health evidence | [I2-DSBE-46: Expose Locality-resolved Child Health Evidence](https://monashie.leankit.com/card/2523599666) | Yes |

Commit inventory: 41 commits; 14 had an exact short-hash reference in the exported description or external-link field. The other 27 were mapped by work scope here. Comments and attachments were not part of this field-level exact-reference count.

## Corrections prepared on 13 October

Branch fix/iteration3-acceptance restores the in-context area picker, separates audience from matching/scenario navigation, restores seasonal topic titles, invalidates simulation state on replacement queries, labels Healthy day sliders, distinguishes care loading/unavailable states, corrects the Play today link and qualifies forecast intervals. These are post-deadline corrections; the original Monday 12 October coding deadline is not rewritten.

The production build and all 13 frontend tests pass, including two new invalid-query/race regression tests. Local browser checks verified Box Hill to Carlton selection with age retained, named Healthy day sliders, a Water safety dialog with the matching title, and Parent scenario access with an honest unsupported result. Map rendering was not verified locally because the checkout has no Mapbox token. These changes are not yet merged or deployed.

AC 16.2.1 now explicitly distinguishes supported comparisons from honest refusal, without making one locality the requirement. All eight corrected epic definitions were verified in a fresh board export. The QA report attachment is the initial reconciliation snapshot; this committed document includes subsequent corrections.
