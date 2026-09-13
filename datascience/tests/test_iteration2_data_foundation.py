import json
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "config" / "iteration_2_datasets.json"
PROFILES = ROOT / "outputs" / "iteration_2" / "source_profiles.json"

REQUIRED = {
    "source_id", "family", "dataset_name", "publisher", "source_url", "licence",
    "reference_period", "update_frequency", "geography", "spatial_resolution",
    "variables", "format", "access_method", "status", "processing_required",
    "sa2_aedc_compatibility", "coverage", "limitations", "health_relevance",
    "feature_enabled", "time_use", "sha256"
}


def test_iteration2_register_has_complete_unique_records():
    document = json.loads(REGISTER.read_text())
    datasets = document["datasets"]
    assert len(datasets) >= 7
    assert len({item["source_id"] for item in datasets}) == len(datasets)
    assert all(REQUIRED <= item.keys() for item in datasets)


def test_sources_are_authoritative_https_and_honest_about_integration():
    datasets = json.loads(REGISTER.read_text())["datasets"]
    assert all(item["source_url"].startswith("https://") for item in datasets)
    assert not any(item["status"] == "product_integrated" for item in datasets)
    assert any("blocked" in item["status"] for item in datasets)
    assert any("restricted" in item["status"] for item in datasets)


def test_downloaded_sources_have_real_checksums():
    datasets = json.loads(REGISTER.read_text())["datasets"]
    downloaded = [item for item in datasets if item["status"].startswith("downloaded")]
    assert downloaded
    assert all(isinstance(item["sha256"], str) and len(item["sha256"]) == 64
               for item in downloaded)


def test_eda_profiles_are_source_specific_and_withhold_unready_data():
    profiles = json.loads(PROFILES.read_text())["profiles"]
    assert {profile["source_id"] for profile in profiles} == {
        "dtp_historical_aadt_2019", "acecqa_services_vic_daily",
        "victoria_school_locations_2025", "npi_emissions_all_years"
    }
    assert all(profile["decision"] != "integrated" for profile in profiles)
    assert all(profile["rows"] > 0 and len(profile["sha256"]) == 64 for profile in profiles)


def test_acquisition_destination_is_stable_and_snapshot_scoped():
    path = ROOT / "scripts" / "acquire_iteration2.py"
    spec = importlib.util.spec_from_file_location("acquire_iteration2", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = {"source_id": "example", "download_url": "https://example.org/data.csv",
              "local_filename": "approved_name.csv"}
    target = module.destination(source, "2026-09-13")
    assert target == ROOT / "data" / "raw" / "example" / "2026-09-13" / "approved_name.csv"
