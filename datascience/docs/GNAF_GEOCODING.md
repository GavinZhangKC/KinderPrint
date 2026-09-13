# ACECQA geocoding with Open G-NAF

KinderPrint uses the Australian Government's Open G-NAF as its authoritative
address-matching source. The pinned August 2026 GDA2020 release is acquired from
data.gov.au and verified by SHA-256. The portal did not expose G-NAF Core as a
separate resource in this release, so the pipeline uses only the required Victorian
tables from the full archive.

Pipeline: ACECQA address -> deterministic standardisation -> G-NAF candidate match
-> default GDA2020 coordinate -> ASGS Edition 3 SA2 point-in-polygon -> KinderPrint
reporting locality.

Only unique exact or explicitly defined high-confidence deterministic matches may
enter spatial analysis. Ambiguous and unmatched services are retained in QA output
and excluded. Locality or street-centroid coordinates are not accepted as precise
service locations. No paid API fallback is automatic.

The workflow is for geographic research integration only. It must not be used for
mailing-list creation or address-deliverability verification.

## Attribution

Contains G-NAF © Commonwealth of Australia (Geoscape Australia), available under
the applicable Open G-NAF End User Licence Agreement and CC BY 4.0 metadata terms.
The release EULA and use-restriction fact sheet linked from the data.gov.au dataset
page must accompany any redistributed derivative for which they apply.
