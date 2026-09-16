from datascience.scripts.geocode_acecqa_with_gnaf import address_candidates, clean


def test_clean_expands_common_street_types():
    assert clean("201 Exford Rd") == "201 EXFORD ROAD"


def test_candidates_prioritise_street_number_after_unit():
    candidates = address_candidates("S 1  201 Exford Rd", "Melton South", "3338")
    assert candidates[0] == "201|EXFORD ROAD|MELTON SOUTH|3338"
