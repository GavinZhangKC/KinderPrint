# KinderPrint themes

Light remains the original CSS baseline. All Midnight Glass adaptations are scoped to `html[data-theme='dark']`; the only new Light UI is the header theme switch.

## Figma source

[KinderPrint](https://www.figma.com/design/M962PwNrTU4I1sJtJwMabo/KinderPrint)

- `125:6`: KinderPrint – Midnight Glass Concept, including profile `125:62` and detailed comparison `125:349`.
- `134:2`: 04B — KinderPrint UI Kit / Midnight Glass, including semantic colours `134:18`, glass elevation `134:60`, status colours `134:75`, buttons `135:11`, and inputs `136:11`.

The kit supplies navy canvas stops (`#091525`, `#10233e`, `#172b47`), 22/32/65% navy surfaces, pale primary/secondary text, periwinkle actions, cyan highlights, semantic green/amber/coral statuses, 18px glass blur and 30px overlay blur. Its borderless default surfaces establish hierarchy through tone and elevation. Opaque navy popovers and subtle separators extend these tokens for legibility over maps and imagery.

## Implementation

- `frontend/src/styles/midnight-tokens.css`: Figma semantic tokens and shared legacy aliases.
- `frontend/src/styles/midnight-components.css`: scoped colour/surface declarations corresponding to the existing component CSS. Layout, typography dimensions, animations and media queries stay in the original files.
- `frontend/src/styles/midnight-glass.css`: deliberate kit treatments for shared surfaces, inputs, overlays and data visualisation.
- `frontend/src/theme/ThemeProvider.tsx`: shared theme state. `kinderprint-theme` in localStorage contains `light` or `dark`; absent or invalid preferences default to Light. Storage events sync open tabs. The script in `frontend/index.html` restores the preference before React renders.
- `frontend/src/components/ThemeSwitcher.tsx`: sun/moon buttons, sliding indicator, native keyboard activation plus Left/Right and Home/End selection. View transitions provide a brief page colour crossfade where supported, with reduced motion respected.

`frontend/src/components/mapTheme.ts` adapts the Mapbox basemap to the shared
theme without replacing its style. The current custom style has no Standard
`basemap` import, so its existing colour paint properties are saved and recoloured
in Dark (navy land, blue water and pale labels). Light restores the exact original
values, including expressions. Layers using the neighbourhood overlay source are
excluded: indicator, hover and selection colours are not changed. Styles with a
Standard `basemap` import continue to use the supported day/night lighting preset.

`NeighbourhoodMap.tsx` applies the adapter after style load and on theme changes.
The map is not recreated, preserving its camera, geometry and selection. Globe
atmosphere and Cesium background retain their existing shared-token behaviour.
The homepage ripple keeps its original timing and geometry, with a cyan trail only
in Dark. Existing images and videos are retained.

The neighbourhood search has no purple container or input focus outline in Dark,
as requested after local preview. This is scoped to `.search-input-shell`; other
inputs and select controls keep their existing focus indicators. The search
remains keyboard-operable, but these outlines no longer indicate focus there.

Homepage sections below the sticky hero use opaque midnight backgrounds so the underlying video and text do not show through. Their decorative gradients are deliberately subdued; glass translucency remains on floating panels rather than full-page sections.

Concern chart fills and below-standard habit bars use a shared bright coral `--kp-status-concern-fill` (`#ff947c`) for visibility. Status backplates use a subdued tint of that same colour so labels remain readable; no dark brown fill is used for data bars. Habit standard markers are pale with a dark outline.

For subsequent styling changes, leave the Light CSS intact and add or update the matching dark selector using semantic tokens. Keep separate chart-series colours and status meanings. Avoid introducing theme changes into layout or data logic.

## Verification record — 12 October 2026

- `npm run build` passed TypeScript and production bundling for the map adapter;
  the existing large-chunk advisory remains.
- `node --test tests/map-theme.test.cjs tests/map-data.test.cjs tests/simulation-selection.test.cjs`:
  8 tests passed, covering dark/light colour restoration, Standard configuration,
  overlay exclusion, missing-value handling and simulation selection behaviour.
- The owner previewed and accepted the map theme change locally. The search
  outline changes passed `git diff --check`; no automated visual or accessibility
  audit was performed for those CSS changes.

The original Midnight Glass implementation recorded no verification at that time;
the checks above concern the later map-theme update, not a complete theme audit.
