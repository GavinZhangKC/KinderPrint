# KinderPrint API Contract

**Version:** 0.2

**Status:** Working Iteration 1 contract with provisional Iteration 2 extensions

**Last updated:** 12 September 2026

This document describes the agreed API shape for Iteration 1 and provisional Backend + Integration contracts for Iteration 2. It is a design contract only. It does not define implementation logic, connect datasets, or approve Data Science or AI methods. Every unresolved decision is marked `TBC`.

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

`status` is one of `available`, `missing`, `suppressed`, `incompatible`, `unavailable`, or `limited` where applicable. An endpoint may define an additional explicit state such as `no_match` when required by its semantics; final status vocabulary is TBC.

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
            "status": "available | missing | suppressed | incompatible | unavailable | limited",
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
      "message": "TBC"
    }
  ]
}
```

An indicator with missing or incompatible input must carry its own non-available status, a `null` value, and the relevant limitation. The backend must not generate, infer, or estimate a replacement value.

### `GET /api/neighbourhoods/indicators`

Returns a lightweight collection of neighbourhood-level indicator values for rendering the visible map without making a separate profile request for every neighbourhood. This endpoint supplements, and does not replace, `GET /api/neighbourhoods/{neighbourhood_id}/profile`.

The final map indicator list and any query parameters for selecting indicators or limiting the result to the visible map area are TBC. Only source indicators approved for Iteration 1 may be exposed; this endpoint must not create new composite values or scores.

```json
{
  "status": "available",
  "data": {
    "neighbourhoods": [
      {
        "id": "TBC",
        "geographic_unit": "TBC",
        "indicators": {
          "TBC-indicator-id": {
            "value": null,
            "status": "available | missing | suppressed | incompatible | unavailable | limited"
          }
        }
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
      "message": "TBC"
    }
  ]
}
```

Every requested indicator is represented by its concrete indicator identifier and its own availability status. A missing, incompatible, unavailable, or otherwise unsupported value must be `null`, never `0` or an estimated replacement. Relevant reasons must be recorded in `limitations`.

Indicator data and boundary geometry remain separate resources. The collection does not include GeoJSON geometry. The frontend joins each result to `GET /api/neighbourhoods/boundaries` using the neighbourhood `id`. The identifier and confirmed geographic unit must be consistent across the indicator collection, individual profiles, neighbourhood search results, and boundary endpoints. The backend must return a clear non-available state or limitation when that consistency cannot be established.

## BE-2 — Geography and Boundary Service

### `GET /api/neighbourhoods/search`

Searches supported neighbourhoods by a provisional query interface.

| Parameter | Requirement |
| --- | --- |
| `q` | Search text; exact matching behaviour is TBC |
| `geographic_unit` | Optional; supported values are TBC |

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

Returns supported neighbourhood boundaries intersecting the visible map area. The bounding-box parameter format is provisional (`bbox=TBC`) until frontend map requirements are confirmed. The response uses a GeoJSON `FeatureCollection` in `data`, with each feature identifying the neighbourhood and geographic unit.

All boundaries must use the confirmed geographic unit. The backend must not fabricate boundaries or subdivide a source boundary into a finer resolution. Missing or unsupported geometry returns a clear `missing` or `unavailable` state, `null` geometry where applicable, and a limitation. The final boundary dataset and version are TBC.

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
            "status": "available | missing | suppressed | incompatible | unavailable | limited",
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
      "message": "TBC"
    },
    {
      "code": "investigation_leads",
      "message": "TBC"
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
      "message": "TBC"
    }
  ]
}
```

Only neighbourhoods with compatible confirmed geographic units and approved social/demographic variables may be matched. Final variables and match-strength thresholds or categories are TBC. A weak match uses `limited`. If no suitable comparison is supportable, the response uses `no_match`, sets `matched_neighbourhood` and `match_strength` to `null`, and explains why; the backend must not force a match.

### `GET /api/compare`

Prepares a side-by-side comparison of any two supported neighbourhoods. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`; final naming is TBC.

Both identifiers are validated against the approved profile dataset. The pair does not need to exist in the approved matching output. The backend compares source-supplied profile indicators with matching indicator identifiers and must not calculate a new similarity result, force a match, or invoke a new matching rule.

The response uses the standard envelope and supports:

- both neighbourhood identifiers, names, and confirmed geographic units;
- side-by-side comparison fields (final fields TBC);
- an empty `similarity_basis` list, because manual comparison does not run matching logic;
- a `null` `match_strength`, because manual comparison does not calculate similarity;
- source, reference year, geographic unit, and data quality;
- limitations and incomplete comparison inputs;
- an area-level comparison notice; and
- a comparable-not-identical notice.

No final matching variable, threshold, strength category, or comparison field is defined by this contract.

Missing indicators remain `null` with their explicit non-available status. If either identifier has no supported profile, the endpoint returns a `missing` or `unavailable` state and an explanatory limitation. Profiles using incompatible geographic units return `incompatible`; the backend must not transform or estimate values to make them comparable.

## Iteration 2 provisional extensions

Iteration 2 services consume only explicitly approved Data Science or AI outputs. The backend may load, validate, select, order, and expose those outputs, but it must not recreate analytical methods or generate conclusions. Endpoint names and analytical payload fields in this section remain provisional until the corresponding output contracts are confirmed.

## BE-7 — Outcome Comparison Service (supports E5)

### `GET /api/outcome-comparison` (provisional)

Returns approved child-development outcome comparison results for two selected or previously matched neighbourhoods. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`.

This service is distinct from `GET /api/compare`: the existing endpoint prepares a general side-by-side projection from Iteration 1 neighbourhood profiles, while this endpoint exposes only approved Iteration 2 outcome-comparison results and approved differences supplied by Data Science.

```json
{
  "status": "available | limited | missing | incompatible | unavailable",
  "data": {
    "neighbourhood_a": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "neighbourhood_b": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "outcome_indicators": [
      {
        "id": "TBC",
        "name": "TBC",
        "unit": "TBC",
        "neighbourhood_a": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "neighbourhood_b": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "approved_difference": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "source": "TBC",
        "reference_year": "TBC",
        "geographic_unit": "TBC"
      }
    ]
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC",
    "output_schema_version": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "area_level_comparison",
      "message": "TBC"
    },
    {
      "code": "association_not_causation",
      "message": "TBC"
    }
  ]
}
```

Both identifiers must be validated as supported neighbourhoods. The two neighbourhoods must use compatible confirmed geographic units, and the response must preserve the order selected by the requester. Whether approved results are stored as ordered or unordered pairs is TBC.

The service must preserve source-provided missing, suppressed, unavailable, limited, and incompatible states. A non-available numeric value or difference is `null`, never zero, an average, a neighbouring-area value, or an inferred value. If no approved outcome-comparison result exists for the pair, the service returns `unavailable` or `missing` with a clear limitation and does not derive a result from profile data.

The backend must not calculate outcome differences, statistical significance, confidence, rankings, or similarity. The final child-development outcome list, units, difference direction, significance or uncertainty representation, dataset location, schema, and approved notice wording are TBC pending the Data Science output contract.

## BE-8 — Environmental Difference Service (supports E6)

### `GET /api/environmental-difference` (provisional)

Returns approved environmental-difference results for two selected neighbourhoods. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`.

```json
{
  "status": "available | limited | missing | incompatible | unavailable",
  "data": {
    "neighbourhood_a": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "neighbourhood_b": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "environmental_indicators": [
      {
        "id": "TBC",
        "name": "TBC",
        "unit": "TBC",
        "neighbourhood_a": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "neighbourhood_b": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "approved_difference": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "source": "TBC",
        "reference_year": "TBC",
        "geographic_unit": "TBC"
      }
    ],
    "approved_standout_indicator_ids": []
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC",
    "coverage": "TBC",
    "output_schema_version": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "area_level_comparison",
      "message": "TBC"
    },
    {
      "code": "association_not_causation",
      "message": "TBC"
    }
  ]
}
```

Both identifiers must be validated as supported neighbourhoods using the confirmed geographic unit. The response preserves the selected order and exposes only environmental values, difference values, and standout identifiers supplied in an approved Data Science output.

`approved_standout_indicator_ids` is provisional and must contain only identifiers present in `environmental_indicators`. An empty list means that no approved standout factor was supplied; it does not authorise the backend to select one. The final representation of standout or ranked factors is TBC.

Missing, suppressed, unavailable, limited, or incompatible values and differences remain `null` with their supplied status. If the approved environmental-difference output is unavailable or does not contain the selected pair, the service returns an explicit unavailable state and does not calculate a difference from profile data.

The backend must not calculate environmental differences, normalise values, assign ranks, choose standout factors, infer missing values, or make causal claims. The final environmental indicator list, units, difference direction, coverage representation, standout/ranking structure, pair ordering, dataset location, schema, and notice wording are TBC pending the Data Science output contract.

## BE-9 — Pattern Insight Service (supports E7)

### `GET /api/pattern-insight` (provisional)

Returns approved pattern-insight outputs associated with a neighbourhood comparison. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`.

```json
{
  "status": "available | limited | no_pattern | missing | incompatible | unavailable",
  "data": {
    "neighbourhood_a": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "neighbourhood_b": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "patterns": [
      {
        "id": "TBC",
        "title": "TBC",
        "description": "TBC",
        "status": "available | limited | missing | incompatible | unavailable",
        "supporting_outcome_indicator_ids": [],
        "supporting_environmental_indicator_ids": [],
        "confidence": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "quality": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "stability": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        }
      }
    ],
    "supporting_outcome_indicators": [],
    "supporting_environmental_indicators": []
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC",
    "output_schema_version": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "association_not_causation",
      "message": "TBC"
    },
    {
      "code": "investigation_leads",
      "message": "TBC"
    }
  ]
}
```

Every supporting indicator reference in a pattern must identify an entry in the corresponding complete supporting-indicator list. A pattern may reference zero or more indicators from either list only when that structure is explicitly supplied by the approved output contract; final minimum evidence requirements are TBC.

Confidence, quality, and stability are source-supplied assessment fields and may be categorical or numeric when available. A non-available assessment has a `null` value and an explicit status. Their final meanings, ranges, thresholds, and representation are TBC; the backend must not derive them.

When the approved output explicitly states that no supported pattern exists, the response uses `no_pattern`, returns an empty `patterns` list, and includes the supplied limitation. The backend must not create a pattern from the supporting indicators. Missing or incompatible evidence remains explicit and must not be imputed.

Patterns describe potential area-level associations for further investigation, not causes or validated interventions. The backend must not identify patterns, calculate feature importance, run SHAP, generate model explanations, or add analytical conclusions. The final pattern fields, evidence structure, no-pattern representation, assessment fields, pair ordering, dataset location, schema, and notice wording are TBC pending the approved Data Science or AI output contract.

## BE-10 — Prevention Opportunity Service (supports E8)

### `GET /api/prevention-opportunity` (provisional)

Returns approved potentially modifiable environmental conditions associated with a neighbourhood comparison. Provisional query parameters are `neighbourhood_id_a` and `neighbourhood_id_b`.

```json
{
  "status": "available | limited | no_opportunity | missing | incompatible | unavailable",
  "data": {
    "neighbourhood_a": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "neighbourhood_b": {
      "id": "TBC",
      "name": "TBC",
      "geographic_unit": "TBC"
    },
    "opportunities": [
      {
        "id": "TBC",
        "condition": "TBC",
        "description": "TBC",
        "status": "available | limited | missing | incompatible | unavailable",
        "supporting_outcome_indicator_ids": [],
        "supporting_environmental_indicator_ids": [],
        "related_pattern_ids": [],
        "modifiability": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "quality": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        },
        "uncertainty": {
          "value": null,
          "status": "available | missing | suppressed | incompatible | unavailable | limited"
        }
      }
    ],
    "supporting_outcome_indicators": [],
    "supporting_environmental_indicators": [],
    "related_patterns": []
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "TBC",
    "output_schema_version": "TBC"
  },
  "limitations": [],
  "notices": [
    {
      "code": "association_not_causation",
      "message": "TBC"
    },
    {
      "code": "investigation_leads",
      "message": "TBC"
    },
    {
      "code": "human_decision",
      "message": "The system does not make the final investigation or resource-allocation decision; people do."
    }
  ]
}
```

Every opportunity reference must identify an item in the corresponding complete supporting-indicator or related-pattern list. The final evidence-linking structure and minimum evidence requirements are TBC.

`modifiability` is an approved source-supplied assessment; its presence does not authorise the backend to decide whether a condition is modifiable. Quality and uncertainty are also supplied by the approved output. A non-available assessment uses `null` with an explicit status. Final assessment meanings, ranges, and categories are TBC.

When the approved output states that no supported prevention opportunity exists, the response uses `no_opportunity`, returns an empty `opportunities` list, and includes the supplied limitation. The backend must not generate an opportunity from outcome, environmental, or pattern data.

Opportunities are investigation leads, not causal findings, intervention recommendations, or resource-allocation decisions. The backend must not decide which conditions are modifiable, recommend an intervention, rank opportunities, fill missing evidence, or create a new analytical conclusion. The final opportunity fields, evidence and pattern references, no-opportunity representation, pair ordering, dataset location, schema, and notice wording are TBC pending the approved Data Science or AI output contract.

## Locality Suitability Service (provisional)

### `GET /api/localities/suitable`

Returns a precomputed locality ranking for one or more supported criteria. The
backend reads the Data Science output and does not calculate suitability scores.

Provisional query parameters:

- `criteria`: comma-separated values selected from `child_development`,
  `green_space`, `low_disadvantage`, and `low_heat`
- `limit`: number of available results to return, from 1 to 20

```json
{
  "status": "limited",
  "data": {
    "localities": [
      {
        "id": "TBC",
        "name": "TBC",
        "geographic_unit": "TBC",
        "score": 75.0,
        "status": "available",
        "criteria": ["green_space"],
        "limitations": []
      }
    ],
    "criteria": ["green_space"],
    "limit": 5,
    "withheld_count": 12
  },
  "metadata": {
    "source": "TBC",
    "reference_year": "TBC",
    "geographic_unit": "TBC",
    "data_quality": "Provisional Iteration 2 locality-suitability prototype.",
    "result_count": 5
  },
  "limitations": [
    {
      "code": "suitability_results_withheld",
      "message": "TBC",
      "affected_fields": ["localities"]
    }
  ],
  "notices": [
    {
      "code": "area_level_information",
      "message": "TBC"
    }
  ]
}
```

A locality with an unavailable selected input is retained in the Data Science
artefact with `score: null` and a non-available status, but it is withheld from
the returned ranking. Missing values must never be represented as zero. An
invalid or empty criteria selection returns `unavailable` with a limitation.

The current scoring formula, weights, indicator transformations, ranking size,
criteria vocabulary, and approval status remain provisional/TBC. Results are
area-level investigation aids, not assessments of individual children or proof
that one neighbourhood is better than another.

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
- Final Iteration 2 outcome-comparison endpoint name and query parameter names
- Final Iteration 2 outcome indicator list, units, and difference direction
- Final Iteration 2 outcome-comparison dataset location and schema version
- Final significance, confidence, uncertainty, and suppression representations
- Whether Iteration 2 neighbourhood pairs are stored as ordered or unordered pairs
- Final Iteration 2 environmental-difference endpoint and query parameter names
- Final environmental indicator list, units, and difference direction
- Final environmental coverage and standout/ranking representations
- Final environmental-difference dataset location and schema version
- Final Iteration 2 pattern-insight endpoint and query parameter names
- Final pattern, supporting-evidence, and no-pattern structures
- Final confidence, quality, stability, and uncertainty representations
- Final pattern-insight dataset location and schema version
- Final Iteration 2 prevention-opportunity endpoint and query parameter names
- Final prevention-opportunity, evidence-link, and related-pattern structures
- Final modifiability, quality, uncertainty, and no-opportunity representations
- Final prevention-opportunity dataset location and schema version
- Final approved disclaimer and notice wording where not already confirmed
- Final bounding-box query format
- Final map-indicator query parameters and indicator selection
- Final locality-suitability criteria, formula, weights, transformations, and ranking size
- Final locality-suitability Data Science approval and output schema
- Final HTTP status and machine-readable error-code mappings

## Change policy and version roadmap

This is a working Iteration 1 contract with provisional Iteration 2 extensions. It may be revised when geographic decisions are confirmed, approved Data Science or AI outputs become available, frontend requirements become more specific, or acceptance criteria are refined.

- **v0.1 — Initial Iteration 1 draft**
- **v0.2 — Added provisional Iteration 2 Backend + Integration contracts** (this document)
- **v0.3 — Updated after geographic unit / Data Science structures are confirmed**
- **v1.0 — Stabilised Iteration 1 API contract**
