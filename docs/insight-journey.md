# Insight journey

Implemented locally, without deployment. Enter through the existing landing page → menu → Insight. The reference demo redirected to a ChatGPT login screen; its content could not be inspected. The implementation follows the supplied experience requirements and existing KinderPrint visual system.

## Files and responsibilities

- `frontend/src/components/InsightPage.tsx` and `.css`: existing page entry, scoped glass styling, navigation, accessible progress and lazy scene lifecycle.
- `frontend/src/components/insight/JourneyScene.ts`: continuous procedural terrain, thin luminous route, five permanent stations, moving light, camera, lighting and GPU disposal.
- `frontend/src/components/insight/journey.ts`: shared narrative stations, reading-position scroll intervals, arrival pauses and weather interpolation.
- `frontend/src/components/insight/landscape.ts`: winding mountain route, three-dimensional arc-length lookup, matching terrain, anticipated camera clearance and smooth camera rails.
- `frontend/src/components/insight/JourneyWeather.ts`: layered procedural cloud texture and varied rain streaks, with bounded rendering cost.
- `frontend/src/components/insight/useJourney.ts`: native scroll measurement, one authoritative chapter/progress map, reverse hysteresis, resize and motion preference handling.
- `frontend/src/components/insight/useInsightData.ts`: stable example selection, source/unit/geography validation, cache, cancellation and retry states.
- `frontend/src/components/insight/ChapterEvidence.tsx`: English narrative and evidence rendered from the same profile values.
- `frontend/src/services/api.ts`: optional abort signals for profile/priority and a shared, bounded indicator collection cache. Explicit retries refresh that cache.
- `frontend/public/insight-landscape.svg`: static fallback illustration, not a geographic map.
- `frontend/public/insight-clouds.svg`: still cloud cover for fallback and reduced-motion mode.
- `frontend/tests/insight.browser.js`: focused browser assertions against the running application and live API.
- `frontend/tests/insight-landscape.browser.js`: full-route camera clearance/visibility, uniform arc-length motion and exact reading-boundary checks.
- `frontend/package.json` and lockfile: Three.js and its TypeScript types. No additional animation framework.

## Evidence

The first available AEDC vulnerability record by ascending neighbourhood ID is selected. No ranking, random selection, representative-sample claim or new priority calculation is introduced. Current data selects Brunswick East, ID `206011106`.

Only three initial business requests are made: the existing `/api/neighbourhoods/indicators` collection, one profile and that area's priority. The collection is shared with the map. Re-entry uses a five-minute evidence cache; explicit retry refreshes it.

Confirmed against the running backend and `datascience/outputs/iteration_1/profiles.json`:

| Indicator | Source / reference year | Unit | Current raw value |
| --- | --- | --- | --- |
| `census_children_0_4_pct` | ABS Census / 2021 | percent | 3.74 |
| `aedc_vulnerable_one_or_more` | AEDC / 2024 | percent | 23.75 |
| `seifa_irsd_decile` | ABS SEIFA / 2021 | national decile | 9 |
| `env_urban_heat` | DELWP Cooling & Greening Melbourne / VPA Open Space / 2018 | degrees Celsius, heat island effect | 8.6626 |
| `env_vegetation_cover` | DELWP Cooling & Greening Melbourne / VPA Open Space / 2018 | percent, API label: Tree canopy cover | 11.8387 |

Geography: **SA2 (ASGS Edition 3, 2021)**. Priority: **Moderate**, source **KinderPrint priority model V1 (weighted residual)**, reference **2024**. The display rounds percentages and heat to one decimal place and preserves the same formatting in narrative text. It does not interpret heat island effect as ambient air temperature.

The older handover README says environment is unavailable, but current files and API contain these available values. The page follows each API indicator's status and provenance instead of assuming that older statement still applies. Cross-year measures are explicitly contextual, not simultaneous exposures, trends or causal effects. No environmental intervention benefit is claimed. The sunny ending is symbolic.

## Interaction and resource bounds

The revised route is 619.4 scene units long, compared with the former 252.9 (2.45×). Station elevations are approximately 4.6, 31.9, 72.4, 33.6 and 7.3: valley, climbing shoulder, high saddle, descent and open basin. These are fictional scene units, not geographic elevations. The route wraps around the massif, and only nearby unobstructed station labels are shown.

Four sections now start at 280svh to give the longer route sufficient travel/read time; the compact closing section remains 125svh. Arrival is measured when the natural panel position reaches the reading line (46% of viewport height on desktop, 38% on mobile). One mapping controls active content, top number, vertical navigation, station illumination, travel and weather, with a six-pixel reverse dead band. A brief arrival pause occupies the first 18% of each interval. Normal scroll and keyboard navigation are retained. At the fifth arrival the scene stops while text continues scrolling. Replay restores focus to the first heading.

Three.js loads only when Insight needs its scene. Rendering is capped around 30fps with DPR ≤ 1.5, roughly 79,000 terrain triangles and instanced grove details. Cloud noise renders into a maximum 720×450 texture, refreshing around 11fps when stationary, with two drifting layers and shaded cloud bases. Rain uses one draw call, at most 240 streaks (100 on mobile), with independent deterministic placement, speed, length and depth variation. No ray-marched volumetric clouds or additional dependencies were introduced. Scroll frames update refs/DOM properties; React state changes only for chapter transitions. The animation loop, observers, listeners, materials, textures, render target, geometries and renderer are disposed on exit. Reduced-motion users get the still landscape without loading the 3D scene. WebGL initialization failure or context loss preserves the readable page.

## Verification performed

- `npm.cmd run build`: TypeScript and production bundling passed. Vite reports its size advisory for the existing main bundle and the separately loaded Three.js scene (~142 kB gzip).
- Revised browser regression: 77 assertions passed at 1440×900 and at 390×844, covering forward/reverse reading-position chapter state, all five station states, terrain clearance, hysteresis, real values/years, missing/zero/geographic compatibility, final freeze, replay and overflow.
- Revised geometry verification: 1,201 samples on each of the desktop and mobile rails, zero out-of-frame/terrain-occluded traveller samples, minimum ground clearance 14.7 scene units, maximum adjacent height change 0.43 units, maximum adjacent heading change 0.85°. Equal arc-length samples measure 0.5159–0.5164 units apart. Exact reading-line transitions were also tested forward and backward in the actual DOM.
- Vertical navigation is centred at the right with no background card; keyboard Tab/Enter and visible focus were tested. Mobile targets measure 44×46 pixels, are clear of the text panel and do not create horizontal overflow at 320px.
- Visual checks at 1440×900, 1258×622, 390×844 and 320×568; 320px layout has no horizontal overflow.
- Intermediate route positions checked as well as station boundaries. Camera framing was adjusted to retain the current station as the moving light approaches the next.
- Native scroll down/up, navigation to map, live Brunswick East search/profile, return to menu and canvas removal checked.
- Reduced-motion preference checked: no scene canvas, five readable chapters, immediate replay and heading focus.
- WebGL unavailability simulated: static fallback, no canvas, all content and actions remain.
- Delayed requests, blocked requests, retry recovery, empty collection, missing heat value and failed priority requests simulated in the verification browser only. No test values are shipped as evidence.
- Final comparison screenshots (1440 × 900): `.run-logs/insight-mountain-01.png`, `.run-logs/insight-mountain-03.png`, and `.run-logs/insight-mountain-05.png`.

To rerun the focused check, start the existing frontend and backend with the approved datasets, enter Insight in agent-browser, then from the repository root:

```powershell
Get-Content frontend/tests/insight.browser.js -Raw | npx.cmd --yes agent-browser eval --stdin
```

Limitations: browser verification used Chromium on this Windows workstation; no physical-phone or cross-browser GPU performance benchmark was performed. The landscape and weather are illustrative. External scientific datasets were not independently re-audited; displayed figures and provenance were verified against the project's approved files and live API.
