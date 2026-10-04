import {
  Cartesian3,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ConstantProperty,
  CylinderGeometry,
  EllipsoidGeometry,
  GeoJsonDataSource,
  GeometryInstance,
  JulianDate,
  Material,
  MaterialAppearance,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  PointGraphics,
  PolygonGeometry,
  Primitive,
  Rectangle,
  Transforms,
  Viewer,
  WallGeometry,
  type Entity,
} from 'cesium'

const publicBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
const BUILDINGS_URL = new URL(
  'data/melbourne/parkville-buildings.geojson',
  publicBaseUrl,
).toString()
const ROADS_URL = new URL(
  'data/melbourne/parkville-road-corridors.geojson',
  publicBaseUrl,
).toString()
const LANDMARKS_URL = new URL(
  'data/melbourne/parkville-landmarks.geojson',
  publicBaseUrl,
).toString()
const CHILDCARE_URL = new URL(
  'data/melbourne/parkville-childcare.geojson',
  publicBaseUrl,
).toString()
const OPEN_SPACES_URL = new URL(
  'data/melbourne/parkville-open-spaces.geojson',
  publicBaseUrl,
).toString()
const CAMPUS_OPEN_SPACES_URL = new URL(
  'data/melbourne/parkville-campus-open-spaces.geojson',
  publicBaseUrl,
).toString()
const FOOTPATHS_URL = new URL(
  'data/melbourne/parkville-footpaths.geojson',
  publicBaseUrl,
).toString()
const TREES_URL = new URL(
  'data/melbourne/parkville-mature-trees.geojson',
  publicBaseUrl,
).toString()

const SURFACE_HEIGHT = 0.25
const APPROXIMATE_STRUCTURE_HEIGHT = 12
const APPROXIMATE_BRIDGE_HEIGHT = 5

type BuildingRole = 'healthcare' | 'education' | 'childcare' | 'context'

interface BuildingAnchor {
  locationId: string
  longitude: number
  latitude: number
  role: Exclude<BuildingRole, 'context'>
  influenceRadiusMetres: number
  detailRadiusMetres: number
}

interface BuildingDetailGeometry {
  facadeInstances: GeometryInstance[]
  roofInstances: GeometryInstance[]
  highlights: BuildingHighlight[]
}

interface BuildingHighlight {
  locationId: string
  color: ConstantProperty
  baseColor: Color
}

export interface MelbourneJourneyHighlightController {
  setHighlights: (highlights: Readonly<Record<string, number>>) => void
  isReady: () => boolean
}

export interface MelbourneSceneLoadProgress {
  loaded: number
  total: number
  label: string
}

const buildingPalette: Record<BuildingRole, {
  low: Color
  medium: Color
  tall: Color
  roof: Color
  glazing: Color
  edge: Color
  podium: Color
  landmark: Color
}> = {
  healthcare: {
    low: Color.fromCssColorString('#edf3fb'),
    medium: Color.fromCssColorString('#dce7f4'),
    tall: Color.fromCssColorString('#c4d5e9'),
    roof: Color.fromCssColorString('#f8fbff'),
    glazing: Color.fromCssColorString('#7190b6'),
    edge: Color.fromCssColorString('#91a9c6'),
    podium: Color.fromCssColorString('#cedced'),
    landmark: Color.fromCssColorString('#b8c9eb'),
  },
  education: {
    low: Color.fromCssColorString('#f2f1ef'),
    medium: Color.fromCssColorString('#e3e5e9'),
    tall: Color.fromCssColorString('#cdd5df'),
    roof: Color.fromCssColorString('#faf9f7'),
    glazing: Color.fromCssColorString('#778daa'),
    edge: Color.fromCssColorString('#a7b2c1'),
    podium: Color.fromCssColorString('#d6d9df'),
    landmark: Color.fromCssColorString('#c3cbe5'),
  },
  childcare: {
    low: Color.fromCssColorString('#eef6f3'),
    medium: Color.fromCssColorString('#dceae6'),
    tall: Color.fromCssColorString('#c4d9d4'),
    roof: Color.fromCssColorString('#f8fcfa'),
    glazing: Color.fromCssColorString('#71959d'),
    edge: Color.fromCssColorString('#9fb8b5'),
    podium: Color.fromCssColorString('#cfdfdb'),
    landmark: Color.fromCssColorString('#bcd8d2'),
  },
  context: {
    low: Color.fromCssColorString('#e9eff4'),
    medium: Color.fromCssColorString('#d6e0e9'),
    tall: Color.fromCssColorString('#bdcad7'),
    roof: Color.fromCssColorString('#f5f8fa'),
    glazing: Color.fromCssColorString('#748aa3'),
    edge: Color.fromCssColorString('#98a8b8'),
    podium: Color.fromCssColorString('#cbd5de'),
    landmark: Color.fromCssColorString('#c4d1df'),
  },
}

const detailedLandmarkBuildingProfiles = new Map<string, {
  locationId: string
  role: Exclude<BuildingRole, 'context'>
  influence: number
  detail: number
}>([
  ['royalchildrenshospital', { locationId: 'royal-childrens-hospital', role: 'healthcare', influence: 120, detail: 95 }],
  ['royalwomenshospital', { locationId: 'royal-womens-hospital', role: 'healthcare', influence: 100, detail: 75 }],
  ['royalmelbournehospital', { locationId: 'royal-melbourne-hospital', role: 'healthcare', influence: 110, detail: 80 }],
  ['universityhighschool', { locationId: 'university-high-school', role: 'education', influence: 100, detail: 75 }],
  ['universityofmelbourne', { locationId: 'university-of-melbourne', role: 'education', influence: 155, detail: 105 }],
])

const journeyHighlightPalette = {
  healthcare: Color.fromCssColorString('#6d78e8'),
  education: Color.fromCssColorString('#8293d8'),
  childcare: Color.fromCssColorString('#8293d8'),
  greenSpace: Color.fromCssColorString('#73b68e'),
}

const roadPalette = {
  arterial: Color.fromCssColorString('#778291'),
  major: Color.fromCssColorString('#8b95a2'),
  minor: Color.fromCssColorString('#a0a9b3'),
  laneway: Color.fromCssColorString('#b5bcc4'),
}

const openSpacePalette = {
  royalPark: Color.fromCssColorString('#86a982'),
  localPark: Color.fromCssColorString('#9eb99a'),
  education: Color.fromCssColorString('#bbcbb3'),
  hospital: Color.fromCssColorString('#b2c9bb'),
  path: Color.fromCssColorString('#dddfd9'),
}

function featureProperties(entity: Entity) {
  return entity.properties?.getValue(JulianDate.now()) as
    | Record<string, unknown>
    | undefined
}

function numericProperty(
  properties: Record<string, unknown> | undefined,
  key: string,
) {
  const value = properties?.[key]
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function stringProperty(
  properties: Record<string, unknown> | undefined,
  key: string,
) {
  const value = properties?.[key]
  return typeof value === 'string' ? value : ''
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function colorVariation(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 1000) / 1000
}

function buildingColor(role: BuildingRole, height: number, variation: number) {
  const palette = buildingPalette[role]
  const base = height >= 45
    ? palette.tall
    : height >= 20
      ? palette.medium
      : palette.low
  const variationTarget = variation >= 0.5 ? palette.roof : palette.edge
  const variationStrength = 0.035 + Math.abs(variation - 0.5) * 0.16
  return Color.lerp(base, variationTarget, variationStrength, new Color())
}

function distanceMetres(
  start: { longitude: number; latitude: number },
  end: { longitude: number; latitude: number },
) {
  const averageLatitude = CesiumMath.toRadians((start.latitude + end.latitude) / 2)
  const longitudeMetres = (
    (end.longitude - start.longitude)
    * 111_320
    * Math.cos(averageLatitude)
  )
  const latitudeMetres = (end.latitude - start.latitude) * 111_320
  return Math.hypot(longitudeMetres, latitudeMetres)
}

function entityLongitudeLatitude(entity: Entity) {
  const position = entity.position?.getValue(JulianDate.now())
  if (!position) return undefined

  const cartographic = Cartographic.fromCartesian(position)
  return {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
  }
}

function buildingLongitudeLatitude(properties: Record<string, unknown> | undefined) {
  const value = properties?.geo_point_2d
  if (!value || typeof value !== 'object') return undefined

  const point = value as Record<string, unknown>
  const longitude = Number(point.lon)
  const latitude = Number(point.lat)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined
  return { longitude, latitude }
}

function createBuildingAnchors(
  landmarks: GeoJsonDataSource,
  childcare: GeoJsonDataSource,
) {
  const anchors: BuildingAnchor[] = []

  for (const entity of landmarks.entities.values) {
    const properties = featureProperties(entity)
    const name = normalizedName(stringProperty(properties, 'feature_name'))
    const profile = detailedLandmarkBuildingProfiles.get(name)
    const position = entityLongitudeLatitude(entity)
    if (!profile || !position) continue

    anchors.push({
      ...position,
      locationId: profile.locationId,
      role: profile.role,
      influenceRadiusMetres: profile.influence,
      detailRadiusMetres: profile.detail,
    })
  }

  for (const entity of childcare.entities.values) {
    const properties = featureProperties(entity)
    const name = normalizedName(stringProperty(properties, 'tradingname'))
    const position = entityLongitudeLatitude(entity)
    if (!name.includes('wimblestreet') || !position) continue

    anchors.push({
      ...position,
      locationId: 'wimble-street-childcare',
      role: 'childcare',
      influenceRadiusMetres: 55,
      detailRadiusMetres: 42,
    })
  }

  return anchors
}

function buildingContext(
  position: { longitude: number; latitude: number } | undefined,
  anchors: BuildingAnchor[],
) {
  if (!position) {
    return { role: 'context' as const, detailed: false, anchor: undefined }
  }

  let closestAnchor: BuildingAnchor | undefined
  let closestDistance = Number.POSITIVE_INFINITY
  let closestWeightedDistance = Number.POSITIVE_INFINITY

  for (const anchor of anchors) {
    const distance = distanceMetres(position, anchor)
    const weightedDistance = distance / anchor.influenceRadiusMetres
    if (weightedDistance <= 1 && weightedDistance < closestWeightedDistance) {
      closestAnchor = anchor
      closestDistance = distance
      closestWeightedDistance = weightedDistance
    }
  }

  return closestAnchor
    ? {
        role: closestAnchor.role,
        detailed: closestDistance <= closestAnchor.detailRadiusMetres,
        anchor: closestAnchor,
      }
    : { role: 'context' as const, detailed: false, anchor: undefined }
}

function roadColor(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('arterial')) return roadPalette.arterial
  if (normalized.includes('major')) return roadPalette.major
  if (normalized.includes('minor')) return roadPalette.minor
  return roadPalette.laneway
}

function styleBuildings(
  dataSource: GeoJsonDataSource,
  anchors: BuildingAnchor[],
): BuildingDetailGeometry {
  const facadeInstances: GeometryInstance[] = []
  const roofInstances: GeometryInstance[] = []
  const highlights: BuildingHighlight[] = []
  const time = JulianDate.now()

  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (!polygon) continue

    const properties = featureProperties(entity)
    const footprintMinimum = numericProperty(properties, 'footprint_min_elevation')
    const footprintMaximum = numericProperty(properties, 'footprint_max_elevation')
    const structureMinimum = numericProperty(properties, 'structure_min_elevation')
    const suppliedExtrusion = numericProperty(properties, 'footprint_extrusion')
    const structureExtrusion = numericProperty(properties, 'structure_extrusion')
    const footprintType = stringProperty(properties, 'footprint_type')

    const baseAboveStructure = footprintMinimum !== undefined && structureMinimum !== undefined
      ? Math.max(0, footprintMinimum - structureMinimum)
      : 0
    const measuredHeight = suppliedExtrusion
      ?? (footprintMaximum !== undefined && footprintMinimum !== undefined
        ? footprintMaximum - footprintMinimum
        : undefined)
      ?? structureExtrusion
    const fallbackHeight = footprintType.toLowerCase().includes('bridge')
      ? APPROXIMATE_BRIDGE_HEIGHT
      : APPROXIMATE_STRUCTURE_HEIGHT
    const componentHeight = Math.max(1, measuredHeight ?? fallbackHeight)
    const baseHeight = SURFACE_HEIGHT + baseAboveStructure
    const topHeight = baseHeight + componentHeight
    const structureId = stringProperty(properties, 'structure_id')
      || stringProperty(properties, 'objectid')
      || entity.id
    const variation = colorVariation(`${structureId}:${baseHeight}:${componentHeight}`)
    const context = buildingContext(buildingLongitudeLatitude(properties), anchors)
    const palette = buildingPalette[context.role]

    polygon.height = new ConstantProperty(baseHeight)
    polygon.extrudedHeight = new ConstantProperty(topHeight)
    const roleColor = buildingColor(context.role, componentHeight, variation)
    const baseColor = context.anchor
      ? Color.lerp(roleColor, palette.landmark, 0.13, new Color())
      : roleColor
    const colorProperty = new ConstantProperty(baseColor)
    const material = new ColorMaterialProperty(colorProperty)
    polygon.material = material
    polygon.outline = new ConstantProperty(componentHeight >= 3)
    polygon.outlineColor = new ConstantProperty(
      palette.edge.withAlpha(context.detailed ? 0.48 : 0.2),
    )
    polygon.closeTop = new ConstantProperty(true)
    polygon.closeBottom = new ConstantProperty(true)

    if (context.anchor) {
      highlights.push({
        locationId: context.anchor.locationId,
        color: colorProperty,
        baseColor,
      })
    }

    // Detail only the institution-adjacent components that are large enough
    // to read from the journey camera. Roof caps retain the source footprint;
    // horizontal glazing bands suggest facade rhythm without modelling windows.
    if (!context.detailed || componentHeight < 4) continue

    const hierarchy = polygon.hierarchy?.getValue(time)
    if (!hierarchy || hierarchy.positions.length < 3) continue
    const wallPositions = [...hierarchy.positions, hierarchy.positions[0]]

    roofInstances.push(new GeometryInstance({
      id: `${entity.id}-roof-finish`,
      geometry: new PolygonGeometry({
        polygonHierarchy: hierarchy,
        height: topHeight + 0.015,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          Color.lerp(
            palette.roof,
            Color.WHITE,
            0.035 + variation * 0.075,
            new Color(),
          ),
        ),
      },
    }))

    // A low podium course gives key buildings a grounded base and clearer
    // silhouette without changing their source footprints or measured height.
    if (componentHeight >= 5) {
      facadeInstances.push(new GeometryInstance({
        id: `${entity.id}-podium-course`,
        geometry: WallGeometry.fromConstantHeights({
          positions: wallPositions,
          minimumHeight: baseHeight + 0.04,
          maximumHeight: Math.min(topHeight - 0.3, baseHeight + 1.15),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            palette.podium.withAlpha(0.72),
          ),
        },
      }))
    }

    const bandCount = Math.min(4, Math.max(1, Math.floor(componentHeight / 7)))
    const bandColor = Color.lerp(
      palette.glazing,
      palette.landmark,
      variation * 0.12,
      new Color(),
    ).withAlpha(0.46)
    for (let bandIndex = 1; bandIndex <= bandCount; bandIndex += 1) {
      const bandCentre = baseHeight + (
        componentHeight * bandIndex / (bandCount + 1)
      )
      const bandHalfHeight = componentHeight >= 16 ? 0.24 : 0.18
      facadeInstances.push(new GeometryInstance({
        id: `${entity.id}-facade-band-${bandIndex}`,
        geometry: WallGeometry.fromConstantHeights({
          positions: wallPositions,
          minimumHeight: Math.max(baseHeight + 0.5, bandCentre - bandHalfHeight),
          maximumHeight: Math.min(topHeight - 0.45, bandCentre + bandHalfHeight),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(bandColor),
        },
      }))
    }

    facadeInstances.push(new GeometryInstance({
      id: `${entity.id}-roof-edge`,
      geometry: WallGeometry.fromConstantHeights({
        positions: wallPositions,
        minimumHeight: Math.max(baseHeight, topHeight - 0.42),
        maximumHeight: topHeight - 0.08,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          palette.edge.withAlpha(0.64),
        ),
      },
    }))
  }

  return { facadeInstances, roofInstances, highlights }
}

function addBuildingDetailPrimitives(
  viewer: Viewer,
  details: BuildingDetailGeometry,
) {
  const primitives: Primitive[] = []

  if (details.roofInstances.length > 0) {
    primitives.push(viewer.scene.primitives.add(new Primitive({
      geometryInstances: details.roofInstances,
      appearance: new PerInstanceColorAppearance({
        closed: false,
        flat: false,
        translucent: false,
      }),
      allowPicking: false,
      asynchronous: true,
      releaseGeometryInstances: true,
    })))
  }

  if (details.facadeInstances.length > 0) {
    primitives.push(viewer.scene.primitives.add(new Primitive({
      geometryInstances: details.facadeInstances,
      appearance: new PerInstanceColorAppearance({
        closed: false,
        flat: false,
        translucent: true,
      }),
      allowPicking: false,
      asynchronous: true,
      releaseGeometryInstances: true,
    })))
  }

  return primitives
}

function styleRoads(dataSource: GeoJsonDataSource) {
  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (!polygon) continue

    const properties = featureProperties(entity)
    const streetType = stringProperty(properties, 'str_type')

    polygon.height = new ConstantProperty(SURFACE_HEIGHT + 0.04)
    polygon.material = new ColorMaterialProperty(roadColor(streetType))
    polygon.outline = new ConstantProperty(true)
    polygon.outlineColor = new ConstantProperty(
      Color.fromCssColorString('#d3dae3').withAlpha(0.68),
    )
  }
}

function stylePublicOpenSpaces(dataSource: GeoJsonDataSource) {
  const royalParkColors: ConstantProperty[] = []

  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (!polygon) continue

    const properties = featureProperties(entity)
    const name = stringProperty(properties, 'FEATURENAME').toLowerCase()
    const color = name.includes('royal park')
      ? openSpacePalette.royalPark
      : openSpacePalette.localPark

    polygon.height = new ConstantProperty(SURFACE_HEIGHT + 0.015)
    const colorProperty = new ConstantProperty(color.withAlpha(0.96))
    polygon.material = new ColorMaterialProperty(colorProperty)
    polygon.outline = new ConstantProperty(true)
    polygon.outlineColor = new ConstantProperty(
      Color.fromCssColorString('#718f72').withAlpha(0.46),
    )

    if (name.includes('royal park')) royalParkColors.push(colorProperty)
  }

  return royalParkColors
}

function styleCampusOpenSpaces(dataSource: GeoJsonDataSource) {
  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (!polygon) continue

    const properties = featureProperties(entity)
    const spaceType = stringProperty(properties, 'space_type')
    const color = spaceType === 'hospital'
      ? openSpacePalette.hospital
      : openSpacePalette.education

    polygon.height = new ConstantProperty(SURFACE_HEIGHT + 0.01)
    polygon.material = new ColorMaterialProperty(color.withAlpha(0.7))
    polygon.outline = new ConstantProperty(false)
  }
}

function styleFootpaths(dataSource: GeoJsonDataSource) {
  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (!polygon) continue

    polygon.height = new ConstantProperty(SURFACE_HEIGHT + 0.025)
    polygon.material = new ColorMaterialProperty(openSpacePalette.path)
    polygon.outline = new ConstantProperty(false)
  }
}

function styleTrees(viewer: Viewer, dataSource: GeoJsonDataSource) {
  const time = JulianDate.now()
  const trunkInstances: GeometryInstance[] = []
  const canopyInstances: GeometryInstance[] = []
  const primitives: Primitive[] = []
  const canopyColor = Color.fromCssColorString('#668d6d')

  for (const entity of dataSource.entities.values) {
    const position = entity.position?.getValue(time)
    if (!position) continue

    const cartographic = Cartographic.fromCartesian(position)
    const properties = featureProperties(entity)
    const trunkDiameter = numericProperty(properties, 'diameter_breast_height') ?? 65
    const locationType = stringProperty(properties, 'located_in').toLowerCase()

    entity.point = undefined
    entity.billboard = undefined
    entity.show = false

    // The source dataset classifies trees by location. Keep park trees only so
    // vegetation remains contained within mapped green-space areas.
    if (!locationType.includes('park')) continue

    const treeHeight = Math.min(24, Math.max(9, 8 + trunkDiameter / 8))
    const trunkHeight = treeHeight * 0.56
    const canopyHeight = treeHeight * 0.58
    const canopyWidth = Math.min(16, Math.max(6, 5 + trunkDiameter / 12))
    const trunkRadius = Math.min(0.75, Math.max(0.18, trunkDiameter / 200))
    const groundHeight = SURFACE_HEIGHT + 0.04
    const trunkCentre = Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      groundHeight + trunkHeight / 2,
    )
    const canopyCentre = Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      groundHeight + trunkHeight + canopyHeight * 0.35,
    )
    trunkInstances.push(new GeometryInstance({
      id: `${entity.id}-trunk`,
      geometry: new CylinderGeometry({
        length: trunkHeight,
        topRadius: trunkRadius * 0.72,
        bottomRadius: trunkRadius,
        slices: 8,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: Transforms.eastNorthUpToFixedFrame(trunkCentre),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          Color.fromCssColorString('#756b5e'),
        ),
      },
    }))

    canopyInstances.push(new GeometryInstance({
      id: `${entity.id}-canopy`,
      geometry: new EllipsoidGeometry({
        radii: new Cartesian3(
          canopyWidth / 2,
          canopyWidth / 2,
          canopyHeight / 2,
        ),
        slicePartitions: 8,
        stackPartitions: 6,
        vertexFormat: MaterialAppearance.MaterialSupport.BASIC.vertexFormat,
      }),
      modelMatrix: Transforms.eastNorthUpToFixedFrame(canopyCentre),
    }))
  }

  if (trunkInstances.length > 0) {
    primitives.push(viewer.scene.primitives.add(new Primitive({
      geometryInstances: trunkInstances,
      appearance: new PerInstanceColorAppearance({
        closed: true,
        translucent: false,
      }),
      allowPicking: false,
      asynchronous: true,
      releaseGeometryInstances: true,
    })))
  }

  let canopyMaterial: Material | undefined
  if (canopyInstances.length > 0) {
    canopyMaterial = Material.fromType('Color', { color: canopyColor })
    primitives.push(viewer.scene.primitives.add(new Primitive({
      geometryInstances: canopyInstances,
      appearance: new MaterialAppearance({
        material: canopyMaterial,
        closed: true,
        translucent: false,
        faceForward: true,
      }),
      allowPicking: false,
      asynchronous: true,
      releaseGeometryInstances: true,
    })))
  }

  return { canopyMaterial, primitives }
}

function anchorColor(theme: string, childcare: boolean) {
  if (childcare) return Color.fromCssColorString('#8293d8')

  const normalized = theme.toLowerCase()
  if (normalized.includes('health')) return Color.fromCssColorString('#6d78e8')
  if (normalized.includes('education')) return Color.fromCssColorString('#7186c7')
  if (normalized.includes('leisure')) return Color.fromCssColorString('#609b77')
  return Color.fromCssColorString('#5f779f')
}

function styleNarrativeAnchors(
  dataSource: GeoJsonDataSource,
  childcare = false,
) {
  for (const entity of dataSource.entities.values) {
    if (!entity.position) continue

    const properties = featureProperties(entity)
    const theme = stringProperty(properties, 'theme')

    entity.billboard = undefined
    entity.point = new PointGraphics({
      color: anchorColor(theme, childcare),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      outlineColor: Color.fromCssColorString('#f5faf7'),
      outlineWidth: 2,
      pixelSize: childcare ? 8 : 9,
    })
  }
}

function addGroundSurface(viewer: Viewer) {
  viewer.entities.add({
    id: 'melbourne-cbd-ground',
    rectangle: {
      coordinates: Rectangle.fromDegrees(
        144.9478,
        -37.8028,
        144.9670,
        -37.7878,
      ),
      height: SURFACE_HEIGHT,
      material: Color.fromCssColorString('#d7e1ea'),
      outline: false,
    },
  })
}

function buildingJourneyAccent(locationId: string) {
  return locationId.includes('hospital')
    ? journeyHighlightPalette.healthcare
    : locationId.includes('childcare')
      ? journeyHighlightPalette.childcare
      : journeyHighlightPalette.education
}

export async function addMelbourneStreetEnvironment(
  viewer: Viewer,
  onProgress?: (progress: MelbourneSceneLoadProgress) => void,
): Promise<MelbourneJourneyHighlightController | undefined> {
  addGroundSurface(viewer)

  const totalResources = 8
  let loadedResources = 0
  onProgress?.({
    loaded: 0,
    total: totalResources,
    label: 'Loading local Melbourne data...',
  })
  const loadGeoJson = async (url: string, label: string) => {
    const dataSource = await GeoJsonDataSource.load(url, { clampToGround: false })
    loadedResources += 1
    onProgress?.({
      loaded: loadedResources,
      total: totalResources,
      label,
    })
    return dataSource
  }

  const [roads, buildings, landmarks, childcare] = await Promise.all([
    loadGeoJson(ROADS_URL, 'Road network loaded'),
    loadGeoJson(BUILDINGS_URL, 'Buildings loaded'),
    loadGeoJson(LANDMARKS_URL, 'Landmarks loaded'),
    loadGeoJson(CHILDCARE_URL, 'Childcare locations loaded'),
  ])

  styleRoads(roads)
  const buildingDetails = styleBuildings(
    buildings,
    createBuildingAnchors(landmarks, childcare),
  )
  styleNarrativeAnchors(landmarks)
  styleNarrativeAnchors(childcare, true)

  if (viewer.isDestroyed()) return

  await viewer.dataSources.add(roads)
  await viewer.dataSources.add(buildings)
  await viewer.dataSources.add(landmarks)
  await viewer.dataSources.add(childcare)
  const buildingPrimitives = addBuildingDetailPrimitives(viewer, buildingDetails)
  viewer.scene.requestRender()

  const [campusOpenSpaces, publicOpenSpaces, footpaths, trees] = await Promise.all([
    loadGeoJson(CAMPUS_OPEN_SPACES_URL, 'Campus spaces loaded'),
    loadGeoJson(OPEN_SPACES_URL, 'Parks and green spaces loaded'),
    loadGeoJson(FOOTPATHS_URL, 'Walking paths loaded'),
    loadGeoJson(TREES_URL, 'Trees loaded'),
  ])

  if (viewer.isDestroyed()) return

  styleCampusOpenSpaces(campusOpenSpaces)
  const royalParkColors = stylePublicOpenSpaces(publicOpenSpaces)
  styleFootpaths(footpaths)
  const treeStyle = styleTrees(viewer, trees)

  await viewer.dataSources.add(campusOpenSpaces)
  await viewer.dataSources.add(publicOpenSpaces)
  await viewer.dataSources.add(footpaths)
  await viewer.dataSources.add(trees)
  viewer.scene.requestRender()

  const royalParkBase = openSpacePalette.royalPark.withAlpha(0.96)
  const canopyBase = Color.fromCssColorString('#668d6d')
  const essentialPrimitives = [
    ...buildingPrimitives,
    ...treeStyle.primitives,
  ]

  return {
    isReady() {
      return essentialPrimitives.every((primitive) => primitive.ready)
    },
    setHighlights(highlights) {
      for (const building of buildingDetails.highlights) {
        const intensity = Math.min(1, Math.max(0, highlights[building.locationId] ?? 0))
        building.color.setValue(Color.lerp(
          building.baseColor,
          buildingJourneyAccent(building.locationId),
          intensity * 0.34,
          new Color(),
        ))
      }

      const parkIntensity = Math.min(1, Math.max(0, highlights['royal-park'] ?? 0))
      const parkColor = Color.lerp(
        royalParkBase,
        journeyHighlightPalette.greenSpace.withAlpha(0.98),
        parkIntensity * 0.42,
        new Color(),
      )
      for (const color of royalParkColors) color.setValue(parkColor)

      if (treeStyle.canopyMaterial) {
        treeStyle.canopyMaterial.uniforms.color = Color.lerp(
          canopyBase,
          Color.fromCssColorString('#73aa7d'),
          parkIntensity * 0.42,
          new Color(),
        )
      }

      viewer.scene.requestRender()
    },
  }
}
