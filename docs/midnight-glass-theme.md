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

The existing Mapbox style receives an in-place day/night lighting change; globe atmosphere and Cesium background use the shared tokens. Maps are not recreated on theme switches, and cameras, geometry, data layers and scene materials retain their existing behaviour. The homepage ripple keeps its original timing and geometry, with a cyan trail only in Dark. Existing images and videos are retained.

Homepage sections below the sticky hero use opaque midnight backgrounds so the underlying video and text do not show through. Their decorative gradients are deliberately subdued; glass translucency remains on floating panels rather than full-page sections.

Concern chart fills and below-standard habit bars use a shared bright coral `--kp-status-concern-fill` (`#ff947c`) for visibility. Status backplates use a subdued tint of that same colour so labels remain readable; no dark brown fill is used for data bars. Habit standard markers are pale with a dark outline.

For subsequent styling changes, leave the Light CSS intact and add or update the matching dark selector using semantic tokens. Keep separate chart-series colours and status meanings. Avoid introducing theme changes into layout or data logic.

No tests, builds, linting, type-checking, browser checks or other verification were run for this change, as requested.
