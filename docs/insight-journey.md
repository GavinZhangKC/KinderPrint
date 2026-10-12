# Insight journey

Included in the frontend release code on `main`; production frontend updates are
deployed through Vercel. The current **Insight Journey** navigation opens the
Cesium experience at `/insight-journey` (also `/cesium-experiment`). This document
describes the older procedural Three.js journey, retained at
`/insight-journey-legacy`; it does not describe the current Cesium page.
As of 12 October 2026, the production frontend is configured to use
the team member's RDS-connected backend; frozen frontends retain the original
backend. See [deployment responsibilities](AWS_VKINDER.md). This update does not
claim a fresh online or browser verification of Insight.

The following implementation notes and browser results are historical records
from the original development work. At that time the reference demo redirected
to a ChatGPT login screen and could not be inspected. The implementation follows
the supplied experience requirements and existing KinderPrint visual system.

## Files and responsibilities

- `frontend/src/components/InsightPage.tsx` and `.css`: existing page entry, scoped glass styling, navigation, accessible progress and lazy scene lifecycle.
- `frontend/src/components/insight/JourneyScene.ts`: continuous procedural terrain, thin luminous route, seven permanent stations, moving light, camera, lighting and GPU disposal.
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

The following example was historically checked against the running backend and
`datascience/outputs/iteration_1/profiles.json`. It is not a promise that today's
production API returns the same record or values; the page follows the configured
API's statuses and provenance rather than these documented figures.

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

The seven-chapter route is 1,039.0 scene units long, extended beyond the previous 619.4-unit five-chapter route. Station elevations are approximately 4.6, 30.8, 82.4, 12.4, 11.2, 14.1 and 7.9: valley, climbing shoulder, high ridge, descent, open transition, clearing basin and final outlook. These are fictional scene units, not geographic elevations. The route wraps around the massif and continues through a second set of rolling hills; only nearby unobstructed station labels are shown.

Six narrative sections start at 280svh to give the longer route sufficient travel/read time; the compact seventh closing section remains a single viewport climax. Arrival is measured when the natural panel position reaches the reading line (46% of viewport height on desktop, 38% on mobile). One mapping controls active content, top number, vertical navigation, station illumination, travel and weather, with a six-pixel reverse dead band. Interior station lights sit slightly into their reading intervals so the moving point meets the light as the card settles into view. Normal scroll and keyboard navigation are retained. At the seventh arrival the scene stops while the final background remains visible and text continues scrolling. Replay restores focus to the first heading.

Three.js loads only when Insight needs its scene. Rendering is capped around 30fps with DPR ≤ 1.5, roughly 79,000 terrain triangles and instanced grove details. Cloud noise renders into a maximum 720×450 texture, refreshing around 11fps when stationary, with two drifting layers and shaded cloud bases. Rain uses one draw call, at most 240 streaks (100 on mobile), with independent deterministic placement, speed, length and depth variation. No ray-marched volumetric clouds or additional dependencies were introduced. Scroll frames update refs/DOM properties; React state changes only for chapter transitions. The animation loop, observers, listeners, materials, textures, render target, geometries and renderer are disposed on exit. Reduced-motion users get the still landscape without loading the 3D scene. WebGL initialization failure or context loss preserves the readable page.

## Historical verification performed

- `npm.cmd run build`: TypeScript and production bundling passed. Vite reports its size advisory for the existing main bundle and the separately loaded Three.js scene (~142 kB gzip).
- Revised browser regression script now covers forward/reverse reading-position state across all seven chapters, seven station states, terrain clearance, hysteresis, real values/years, final freeze, replay and overflow.
- Geometry verification: 1,201 samples on each of the desktop and mobile rails, zero out-of-frame/terrain-occluded traveller samples, minimum ground clearance 13.2 scene units, maximum adjacent height change 0.65 units, maximum adjacent heading change 0.90°. Equal arc-length samples measure 0.8654–0.8661 units apart. Exact reading-line transitions remain tested forward and backward in the browser script.
- Vertical navigation is centred at the right with no background card; keyboard Tab/Enter and visible focus were tested. Mobile targets measure 44×46 pixels, are clear of the text panel and do not create horizontal overflow at 320px.
- Visual checks at 1440×900, 1258×622, 390×844 and 320×568; 320px layout has no horizontal overflow.
- Intermediate route positions checked as well as station boundaries. Camera framing was adjusted to retain the current station as the moving light approaches the next.
- Native scroll down/up, navigation to map, live Brunswick East search/profile, return to menu and canvas removal checked.
- Reduced-motion preference checked: no scene canvas, seven readable chapters, immediate replay and heading focus.
- WebGL unavailability simulated: static fallback, no canvas, all content and actions remain.
- Delayed requests, blocked requests, retry recovery, empty collection, missing heat value and failed priority requests simulated in the verification browser only. No test values are shipped as evidence.
- Final comparison screenshots (1440 × 900): `.run-logs/insight-mountain-01.png`, `.run-logs/insight-mountain-03.png`, and `.run-logs/insight-mountain-05.png`.

To rerun the focused check, start the existing frontend and backend with the approved datasets, enter Insight in agent-browser, then from the repository root:

```powershell
Get-Content frontend/tests/insight.browser.js -Raw | npx.cmd --yes agent-browser eval --stdin
```

Limitations: browser verification used Chromium on this Windows workstation; no physical-phone or cross-browser GPU performance benchmark was performed. The landscape and weather are illustrative. External scientific datasets were not independently re-audited; displayed figures and provenance were verified against the project's approved files and live API.
