# Licence compliance for every data source

Source of truth: `config/data_source_register.csv` (29 sources). This page turns
each licence into the obligations the product must meet, where the product meets
them, and what is still open. KinderPrint is a non-commercial university project;
the table below records what would change if that stopped being true.

## Obligations by licence

| Licence | Sources | Obligations | How KinderPrint meets them |
|---|---|---|---|
| CC BY 4.0 (and CC BY 3.0 AU) | ABS ASGS, SEIFA, Census G01/G19, SA2-LGA label points; EPA AirWatch; Geoscience Australia healthdirect facilities; NPI; DTP AADT, PTV stops, bushfire-prone areas; Cooling & Greening; VPA open space; school locations; VCAMS (2); AIHW MyHospitals; AIHW MBS local areas; NNDSS; FSANZ AFCD; City of Casey MCH (CC BY 3.0) | Attribute the licensor; link the licence; say if changed; no endorsement implied | Each API response names its source in `metadata`; the Help Centre "Sources" section and page footers cite publisher and year; derived measures (e.g. out-of-pocket per service, E2SFCA access) are described as KinderPrint derivations, not publisher figures |
| CC BY-NC-SA 3.0 AU | PHIDU child and youth PHA atlas | Attribution; **non-commercial** use only; derived data shared under the **same licence** | Attributed in metadata. The derived PHIDU files are marked CC BY-NC-SA in the licence notes of `DATA_DICTIONARY.md`. **If KinderPrint is ever commercialised, PHIDU-derived indicators must be removed or relicensed.** |
| ODbL 1.0 | OpenStreetMap via Overpass (food outlets) | Attribution "© OpenStreetMap contributors"; derived **databases** shared under ODbL; produced works (maps, text) may use any licence with attribution | API metadata and the Help Centre source list show "OpenStreetMap contributors (ODbL)" with a link to the copyright page. `food_outlets_sa2.csv` and `food_access_sa2.csv` are derived databases, and the licence notes in `DATA_DICTIONARY.md` state that they are offered under ODbL. |
| G-NAF End User Licence Agreement | G-NAF August 2026 (geocoding ACECQA services; within healthdirect facilities) | Attribution to Geoscape; no use for direct marketing; addresses not redistributed as a dataset | Only coordinates and SA2 matches derived from G-NAF are published. No G-NAF address table is redistributed: facility addresses shown are the healthdirect listing fields. G-NAF is not used for marketing. |
| AEDC Data Guidelines | AEDC SA2 2009-2024 | Attribution; respect suppression; no attempt to identify small groups | Suppressed cells stay missing; results published only for AEDC communities; models are area-level and never infer individuals |
| Government website terms | Better Health Channel urgent care clinics | Content is copyright; factual information may be used | Only factual listing fields (name, address, phone, coordinates, healthdirect link) are stored; no page text is copied |
| State data terms (not stated as an open licence) | ACECQA National Registers; VIF2023 projections; DFFH divisions map | Attribution; check reuse terms | Attributed in metadata. **Open action:** record the exact licence text and URL for these three in the register (DS-24 follow-up). ACECQA publishes its registers for public use; VIF2023 is published on data.vic under CC BY 4.0 in most editions and needs confirmation for the file used. |

## Rules the pipeline enforces

* Every processed file has a lineage row that resolves to a registered source
  (`tests/test_lineage.py`). An unregistered source cannot enter the product
  unnoticed.
* Rejected sources and the reasons for rejecting them are kept in
  `config/rejected_sources.csv`. This includes sources we were not authorised to
  use, for example content.vic.gov.au.
* Raw downloads are git-ignored. Hashes in
  `data/reference/iteration3/manifest.json` prove which version was used, without
  redistributing files whose terms do not allow it.
