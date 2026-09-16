# EPA Victoria historical AirWatch observations

KinderPrint acquired the official annual hourly workbooks for 2018 through 2025.
The selected pollutants are PM2.5, PM10, nitrogen dioxide and ozone. EPA states
that historical hourly observations from its monitoring sites are available through
DataVic and that measurements may be adjusted for equipment errors, power
interruptions and other technical issues.

## Harmonisation decisions

- 2018-2020 use the published long-form annual schema and contain no row-level
  validation flag. They are labelled `PUBLISHED_HOURLY_RELEASE_NO_ROW_FLAG`.
- The 2021 workbook declares validated data and uses one wide sheet per station.
- 2022-2025 use the long-form `AllData` sheet; only rows with validation flag `Y`
  are retained.
- BPM2.5 and SBPM25 method codes are harmonised to PM2.5 while the original method
  code remains present.
- PM values remain in ug/m3; NO2 and ozone remain in ppb. No undocumented unit
  conversion is performed.
- Exact repeated source rows are removed. Conflicting values for the same
  station/method/hour are excluded and counted rather than averaged or selected.
- Negative validated instrument values are retained and counted. They are not
  silently converted to zero.
- Sampling-point identities are kept distinct where the later workbooks provide
  multiple series for one named location.

## Geographic and interpretation boundary

These files provide observations at 21 named monitoring locations; they are not a
validated locality-level exposure surface. KinderPrint publishes station/day and
station/year research tables only. It does not assign the nearest monitor to an SA2,
interpolate between monitors, or create an SA2 air-quality value. Consequently the
air-quality product state remains
`VALIDATED_MONITOR_CONTEXT_ONLY_INSUFFICIENT_FOR_LOCALITY_EXPOSURE`.

Station observations may support descriptive temporal analysis and future exposure
model validation. They cannot by themselves support claims about a child's personal
exposure or air quality throughout the SA2 containing a monitor.
