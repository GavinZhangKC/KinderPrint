# Melbourne local scene data

This folder contains the local geographic data used by `/cesium-experiment`.
No map, imagery, terrain, Cesium ion, or other online mapping service is
requested at runtime.

## Active Parkville coverage

The Phase 3 files are spatial subsets within 780 metres of
`144.9574, -37.7953`. The useful narrative anchors span approximately 1.3 km
east-west and 1.0 km north-south; the extra buffer retains the surrounding
streets and building context.

The coverage includes:

- Royal Children's Hospital
- Royal Melbourne Hospital and Royal Women's Hospital
- the eastern part of Royal Park
- University High School
- the University of Melbourne
- Wimble Street Child Care Co-Operative
- University of Melbourne Child Care and other nearby facilities

## Active files

- `parkville-buildings.geojson` — City of Melbourne, **2023 Building
  Footprints**, captured May 2023.
- `parkville-road-corridors.geojson` — City of Melbourne, **Road corridors**.
- `parkville-landmarks.geojson` — City of Melbourne, **Landmarks and places of
  interest**, used for the health, education, and Royal Park anchors.
- `parkville-childcare.geojson` — City of Melbourne, **Childcare centres**,
  used for the early-childhood anchors.

The earlier `swanston-*` files remain as the Phase 2 source snapshot but are no
longer loaded by the active scene.

## Sources and licence

- Building footprints:
  <https://data.melbourne.vic.gov.au/explore/dataset/2023-building-footprints/>
- Road corridors:
  <https://data.melbourne.vic.gov.au/explore/dataset/road-corridors/>
- Landmarks and places of interest:
  <https://data.melbourne.vic.gov.au/explore/dataset/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/>
- Childcare centres:
  <https://data.melbourne.vic.gov.au/explore/dataset/childcare-centres/>

The four original active datasets are provided by the City of Melbourne under Creative
Commons Attribution 4.0 (CC BY 4.0):
<https://creativecommons.org/licenses/by/4.0/>.

The API GeoJSON exports use longitude/latitude coordinates in standard GeoJSON
order (WGS 84 / EPSG:4326). Building minimum and maximum elevations are
supplied in Australian Height Datum (AHD). `footprint_extrusion` is the
measured height of each vertically stacked footprint component and is
preferred by the scene.

## Height handling

For each footprint component, the scene uses the supplied
`footprint_extrusion`. Its vertical offset is calculated from
`footprint_min_elevation - structure_min_elevation`, preserving podium, tower,
and setback stacking while placing the complete local model on a lightweight
ellipsoid surface.

This relative-height approach avoids treating AHD values as absolute WGS84
ellipsoidal heights. If a component has no usable height fields, the documented
visual fallback is 12 metres for a structure and 5 metres for a bridge. These
fallbacks are only for display and are not asserted as surveyed heights.

## Green and open-space layers

- `parkville-open-spaces.geojson` contains park polygons downloaded from the
  official City of Melbourne **Parks** ArcGIS feature layer. Royal Park and the
  smaller reserves intersecting the scene bounds are included.
- `parkville-mature-trees.geojson` is a local subset of the City of Melbourne
  **Trees, with species and dimensions (Urban Forest)** dataset. It includes
  trees within 900 metres of the Parkville centre with a recorded trunk diameter
  of at least 65 cm. This deliberate filter supplies recognisable scattered
  canopy while keeping the scene lightweight.
- `parkville-footpaths.geojson` is the local 900-metre subset of the official
  City of Melbourne **Footpaths** dataset.
- `parkville-campus-open-spaces.geojson` contains four deliberately simplified
  visual surfaces for University High School, the University of Melbourne, the
  hospital precinct, and the Royal Children's Hospital landscape. School and
  institutional land is not consistently included in public-open-space
  inventories, so these polygons are documented visual approximations derived
  from the existing local building, road, and narrative-anchor context. They
  are not cadastral or surveyed boundaries.
- `tree-canopy.svg` is the reusable local marker used for the lightweight tree
  layer.

Additional sources:

- Parks feature layer:
  <https://gisags.melbourne.vic.gov.au/server_wa/rest/services/Basemaps/Basemap_Light_WMS/MapServer/75>
- Trees with species and dimensions:
  <https://data.melbourne.vic.gov.au/explore/dataset/trees-with-species-and-dimensions-urban-forest/>
- Footpaths:
  <https://data.melbourne.vic.gov.au/explore/dataset/footpaths/>

The tree and footpath datasets are City of Melbourne CC BY 4.0 data. All three
official layers are stored locally; the running scene makes no requests to
their source services.

## Temporary location verification mode

`/cesium-experiment` includes an optional development overlay for checking the
seven route milestones. It is disabled by default and can be toggled with
the **Verify locations** button.

The verified coordinates are stored in
`src/components/cesium/parkvilleVerification.ts`. Hospital, park, school, and
university coordinates come from the local City of Melbourne **Landmarks and
places of interest** subset. Childcare coordinates come from the local City of
Melbourne **Childcare centres** subset. These entries are labelled verified in
the tool.

The displayed coverage ring reproduces the 780-metre spatial filter used to
download the active Parkville building and road GeoJSON files. It describes
local scene-data coverage, not an administrative or cadastral boundary.

## Continuous journey route

The Phase 4 camera route is an approximately 2.9 km connected path derived
from centre positions and intersections in `parkville-road-corridors.geojson`.
It follows Flemington Road, Gatehouse Street, Park Drive, Wimble Street,
Fitzgibbon Street, Story Street, Flemington Road, Grattan Street, Kernot Road,
and Wilson Avenue. Eight-metre quadratic corner transitions keep turns close
to the road corridors, while progress is allocated by travelled distance.

The seven milestones exported as `parkvilleJourneyChapters` are:

1. Royal Children's Hospital - Parkville introduction and healthcare
2. Royal Park southern edge - green space
3. Wimble Street Child Care Co-Operative - early education
4. University High School - secondary education
5. Royal Women's Hospital - healthcare
6. Royal Melbourne Hospital - healthcare
7. University of Melbourne - connected precinct conclusion

The route remains inside the 780-metre local-data boundary. Scrolling down
moves forward along the route and scrolling up samples the same path in
reverse. Location Verification Mode remains available independently.

## Route guide and progress marker

The journey route is drawn from the same rounded route coordinates used by the
camera. A dark underlay keeps it legible above the local street surfaces, the
completed section uses a brighter green treatment, and the remaining section
uses a quieter blue-green treatment. Only the split point changes while
scrolling; the shared route geometry remains fixed.

The current position is represented by a lightweight world-space beacon. Two
four-sided Cesium cylinder primitives form a faceted floating diamond, with a
short vertical stem connecting it visually to the route. Its geographic
position is sampled from the same distance-based progress value as the camera.
The camera follows 24 metres behind that progress point on the same route, so
the marker remains visible ahead without introducing a second path.
