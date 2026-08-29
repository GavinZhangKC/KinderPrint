import json

from data_loader import PROFILE_DATA_PATH_ENV


def assert_envelope(response: dict) -> None:
    assert set(response) == {"status", "data", "metadata", "limitations", "notices"}


def test_health_is_minimal(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "available"}


def test_validation_error_uses_envelope(client) -> None:
    response = client.get("/api/compare")
    assert response.status_code == 422
    body = response.json()
    assert_envelope(body)
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "invalid_request"


def test_unconfigured_profile_is_explicit(client) -> None:
    body = client.get("/api/neighbourhoods/example/profile").json()
    assert_envelope(body)
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_not_configured"
    assert body["notices"][0]["code"] == "area_level_information"


def test_unknown_profile_is_missing(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", json.dumps({"profiles": []}))
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/unknown/profile").json()
    assert_envelope(body)
    assert body["status"] == "missing"
    assert body["data"]["neighbourhood"]["id"] == "unknown"


def test_invalid_profile_dataset_is_unavailable(client, monkeypatch, write_json) -> None:
    path = write_json("profiles.json", "[]")
    monkeypatch.setenv(PROFILE_DATA_PATH_ENV, str(path))
    body = client.get("/api/neighbourhoods/example/profile").json()
    assert body["status"] == "unavailable"
    assert body["limitations"][0]["code"] == "profile_dataset_invalid"
