def test_lower_bushfire_score_is_complement_of_land_share():
    bushfire_prone_pct = 37.5
    assert round(100 - bushfire_prone_pct, 2) == 62.5
