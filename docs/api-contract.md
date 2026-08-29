# KinderPrint API Contract

**Version:** 0.1  
**Status:** Working Iteration 1 contract  
**Last updated:** 28 August 2026

This document describes the agreed API shape for Iteration 1. It is a design contract only. It does not define implementation logic, connect datasets, or approve Data Science methods. Every unresolved decision is marked `TBC`.

## Contract conventions

### Response envelope

Service responses use a consistent top-level envelope:

```json
{
  "status": "available",
  "data": {},
  "metadata": {},
  "limitations": [],
  "notices": []
}
```

`status` is one of `available`, `missing`, `incompatible`, `unavailable`, or `limited` where applicable. An endpoint may define an additional explicit state such as `no_match` when required by its semantics; final status vocabulary is TBC.

- `data` contains the requested resource. Values that are not supported remain `null`; they must not be generated or estimated.
- `metadata` records provenance and interpretation context, including source, reference year, geographic unit, data quality, and boundary version where relevant.
- `limitations` records missing data, incompatible geography or reference years, unsupported results, unavailable inputs, and other data-quality constraints.
- `notices` contains explanatory and safety framing. Wording is TBC unless explicitly approved below.

### Shared structures

```json
{
  "limitation": {
    "code": "TBC",
    "message": "TBC",
    "affected_fields": []
  },
  "notice": {
    "code": "TBC",
    "message": "TBC"
  }
}
```

Final limitation codes, notice codes, and data-quality representation are TBC.

## BE-1 — Neighbourhood Profile Service

### `GET /api/neighbourhoods/{neighbourhood_id}/profile`

Returns an aggregate neighbourhood profile. The final geographic identifier format, geographic unit, and indicator lists are TBC.

```json
{
  "status": "available",
  "data": {
    "neighbourhood": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "domains": [
      {
        "id": "child-development",
        "name": "Child Development",
        "indicators": [
          {
            "id": "TBC",
            "name": "TBC",
            "value": null,
            "status": "available | missing | incompatible | unavailable | limited",
            "source": "TBC",
            "geographic_unit": "TBC",
            "reference_year": "TBC"
          }
        ]
      },
      {
        "id": "social",
        "name": "Social",
        "indicators": []
      },
      {
        "id": "environment",
        "name": "Environment",
        "indicators": []
      }
    ]
  },
  "metadata": {
    "sources": ["TBC"],
    "reference_years": ["TBC"],
    "geographic_unit": "TBC",
    "data_quality": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "area_level_information",
      "message": "TBC: This is aggregate area-level information and is not an assessment of an individual child."
    }
  ]
}
```

Profiles are loaded unchanged from the approved JSON file named by
`KINDERPRINT_PROFILE_DATA_PATH`. Its root object must contain a `profiles`
array. Every profile must contain `neighbourhood` (`id`, `name`, and
`geographic_unit`) and `domains`; every domain contains `id`, `name`, and
`indicators`. Every indicator must supply `id`, `name`, `value`, `status`,
`source`, `geographic_unit`, and `reference_year`.

An indicator with missing, incompatible, unavailable, or limited input must
carry its own non-available status, a `null` value, and a returned limitation.
Available indicators must use the profile's geographic unit. The backend does
not calculate, generate, infer, or estimate a replacement value. If no
approved profile dataset is configured, invalid, or unsupported for the
requested identifier, the response has an explicit non-available status and
the aggregate area-level notice remains present.

## BE-2 — Geography and Boundary Service

### `GET /api/neighbourhoods/search`

Searches supported neighbourhoods by a case-insensitive substring match against
the approved boundary dataset. The endpoint only returns areas whose boundary
geometry is present in that dataset.

| Parameter | Requirement |
| --- | --- |
| `q` | Optional search text, matched case-insensitively against name and identifier |
| `geographic_unit` | Optional exact, case-insensitive geographic-unit filter |

Results use the standard envelope and return neighbourhood `id`, `name`, and `geographic_unit`. The final identifier format and geographic unit are TBC.

### `GET /api/neighbourhoods/{neighbourhood_id}/boundary`

Returns one supported neighbourhood boundary.

```json
{
  "status": "available",
  "data": {
    "neighbourhood": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "geometry": {
      "type": "TBC GeoJSON geometry type",
      "coordinates": []
    }
  },
  "metadata": {
    "source": "TBC",
    "geographic_unit": "TBC",
    "boundary_version": "TBC",
    "data_quality": "TBC"
  },
  "limitations": [],
  "notices": []
}
```

### `GET /api/neighbourhoods/boundaries`

Returns supported neighbourhood boundaries intersecting the visible map area.
`bbox` is required and uses `west,south,east,north` WGS 84 longitude/latitude
coordinates. The response uses a GeoJSON `FeatureCollection` in `data`, with
each feature identifying the neighbourhood and geographic unit.

All boundaries are loaded unchanged from the GeoJSON file named by
`KINDERPRINT_BOUNDARY_DATA_PATH`. Each source feature must contain
`properties.id`, `properties.name`, and `properties.geographic_unit`, and may
also specify `source`, `boundary_version`, and `data_quality`. The service does
not create boundaries from area names, centroids, or other geographies, and
does not subdivide source boundaries. Missing, unsupported, invalid, or
unconfigured source geometry returns a clear `missing` or `unavailable` state
with `null` geometry where applicable and a limitation.

## BE-3 — Priority Service

### `GET /api/priority`

Returns the precomputed **Priority for Investigation** shortlist approved by Data Science.

### `GET /api/neighbourhoods/{neighbourhood_id}/priority`

Returns the approved priority result for one neighbourhood.

```json
{
  "status": "available",
  "data": {
    "label": "Priority for Investigation",
    "neighbourhood": {
      "id": "TBC",
      "name": "TBC"
    },
    "priority_band": "TBC",
    "contributing_domains": [
      "Child Development",
      "Social",
      "Environment"
    ]
  },
  "metadata": {
    "source": "TBC: Data Science approved output",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "human_decision",
      "message": "The system does not make the final investigation or resource-allocation decision; people do."
    }
  ]
}
```

The contract exposes only a relative priority band, never an exact numeric score. Final bands and the Data Science output structure are TBC. The backend must use only Data Science-approved logic and results. If inputs are insufficient or geographically or temporally incompatible, `priority_band` is `null`, the status is non-available, and the reason appears in `limitations`; no result may be estimated.

## BE-4 — Explanation Service

### `GET /api/neighbourhoods/{neighbourhood_id}/explanation`

Returns the approved explanation associated with a neighbourhood priority result.

```json
{
  "status": "available",
  "data": {
    "neighbourhood": {
      "id": "TBC",
      "name": "TBC"
    },
    "factor_domains": [
      {
        "domain": "Child Development | Social | Environment",
        "factors": [
          {
            "id": "TBC",
            "name": "TBC",
            "status": "available | missing | incompatible | unavailable | limited",
            "source": "TBC",
            "geographic_unit": "TBC",
            "reference_year": "TBC"
          }
        ]
      }
    ],
    "highlighted_factor_ids": [],
    "incomplete_inputs": [
      {
        "indicator": "TBC",
        "reason": "suppressed | not_collected | unavailable_for_reference_year | incompatible_geography | TBC"
      }
    ]
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "association_not_causation",
      "message": "TBC: Association does not imply causation."
    },
    {
      "code": "investigation_leads",
      "message": "TBC: Prominent factors are leads for local validation and investigation, not proven causes."
    }
  ]
}
```

Highlighted factors must always be a subset of the full factor list. Missing inputs must not be replaced with zero, averages, neighbouring-area values, or inferred values. This endpoint introduces no recommendation or scoring rule.

## BE-6 — Match and Compare Service

### `GET /api/neighbourhoods/{neighbourhood_id}/match`

Returns a supported comparable neighbourhood, if one exists.

```json
{
  "status": "available | limited | no_match",
  "data": {
    "source_neighbourhood": {
      "id": "TBC",
      "name": "TBC"
    },
    "matched_neighbourhood": {
      "id": "TBC",
      "name": "TBC"
    },
    "similarity_basis": ["TBC"],
    "match_strength": "TBC"
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "comparable_not_identical",
      "message": "TBC: Neighbourhoods are comparable, not identical."
    }
  ]
}
```

Only neighbourhoods with compatible confirmed geographic units and approved social/demographic variables may be matched. Final variables and match-strength thresholds or categories are TBC. A weak match uses `limited`. If no suitable comparison is supportable, the response uses `no_match`, sets `matched_neighbourhood` and `match_strength` to `null`, and explains why; the backend must not force a match.

### `GET /api/compare`

Prepares a side-by-side comparison of any two supported neighbourhoods. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`; final naming is TBC.

The response uses the standard envelope and supports:

- both neighbourhood identifiers, names, and confirmed geographic units;
- side-by-side comparison fields (final fields TBC);
- approved similarity variables or basis;
- match strength, including `limited` for weak comparisons;
- source, reference year, geographic unit, and data quality;
- limitations and incomplete comparison inputs;
- an area-level comparison notice; and
- a comparable-not-identical notice.

No final matching variable, threshold, strength category, or comparison field is defined by this contract.

## Error handling

Errors use the same envelope shape:

```json
{
  "status": "unavailable",
  "data": null,
  "metadata": {},
  "limitations": [
    {
      "code": "TBC",
      "message": "TBC",
      "affected_fields": []
    }
  ],
  "notices": []
}
```

The contract must distinguish invalid neighbourhood identifiers, unknown neighbourhoods, missing data, incompatible data, unsupported geographic units, unavailable boundaries, unavailable priority results, unavailable explanations, and no suitable comparison match. Exact HTTP status codes and final machine-readable error codes are TBC.

Expected absence or insufficiency of analytical data should remain explicit in `status` and `limitations`; it must never cause fabricated data to be returned.

## Health endpoint

### `GET /api/health`

Minimum runtime check only:

```json
{
  "status": "available"
}
```

It confirms that the FastAPI service is running and makes no statement about business data or downstream service readiness.

## TBC register

- Final neighbourhood geographic unit and geographic identifier format
- Final AEDC, Census, SEIFA, heat, and vegetation/green-space indicator lists
- Final boundary dataset and version
- Final Data Science priority output structure and priority-band categories
- Final data-quality representation
- Final matching variables and match-strength thresholds/categories
- Final comparison fields
- Final approved disclaimer and notice wording where not already confirmed
- Final bounding-box query format
- Final HTTP status and machine-readable error-code mappings

## Change policy and version roadmap

This is a working Iteration 1 API contract. It may be revised when geographic decisions are confirmed, Data Science processed datasets become available, frontend requirements become more specific, or acceptance criteria are refined.

- **v0.1 — Initial draft** (this document)
- **v0.2 — Updated from Iteration 1 LeanKit cards and acceptance criteria**
- **v0.3 — Updated after geographic unit / Data Science structures are confirmed**
- **v1.0 — Stabilised Iteration 1 API contract**
