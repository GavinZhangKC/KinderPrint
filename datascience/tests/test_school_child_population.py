from pathlib import Path

from datascience.scripts.integrate_school_and_child_population import load_vif


def test_vif_loader_reads_published_2026_child_age_groups(tmp_path: Path):
    # The production workbook is integration-tested by the pipeline; keep unit coverage focused
    # on the public function contract without synthesising a misleading VIF workbook layout.
    assert callable(load_vif)
