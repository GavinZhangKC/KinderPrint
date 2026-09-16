from pathlib import Path
import re


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_PATH = REPOSITORY_ROOT / "template.yaml"
PACKAGE_SCRIPT_PATH = REPOSITORY_ROOT / "backend" / "prepare_lambda_package.sh"
MAIN_PATH = REPOSITORY_ROOT / "backend" / "main.py"
LOCAL_RUN_SCRIPT_PATH = REPOSITORY_ROOT / "backend" / "run_local_backend.sh"


def _configured_data_files() -> set[str]:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return set(re.findall(r"/var/task/data/([^\s]+)", template))


def test_every_configured_runtime_dataset_is_packaged() -> None:
    package_script = PACKAGE_SCRIPT_PATH.read_text(encoding="utf-8")

    for filename in _configured_data_files():
        assert filename in package_script, f"{filename} is configured but not packaged"


def test_backend_python_packages_are_packaged() -> None:
    package_script = PACKAGE_SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'cp "$TASK_SCRIPT_DIR/core"/*.py "$TASK_PACKAGE_DIR/core/"' in package_script
    assert 'cp "$TASK_SCRIPT_DIR/loaders"/*.py "$TASK_PACKAGE_DIR/loaders/"' in package_script


def test_iteration_two_profiles_are_packaged_as_runtime_profiles() -> None:
    package_script = PACKAGE_SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'cp "$TASK_ITERATION_2_DATA_DIR/profiles.json" "$TASK_PACKAGE_DIR/data/"' in package_script


def test_runtime_does_not_import_data_science_source_tree() -> None:
    main_source = MAIN_PATH.read_text(encoding="utf-8")

    assert "kinderprint.analytics" not in main_source
    assert "datascience_src" not in main_source


def test_local_backend_uses_iteration_two_runtime_products() -> None:
    run_script = LOCAL_RUN_SCRIPT_PATH.read_text(encoding="utf-8")

    assert "outputs/iteration_2/profiles.json" in run_script
    assert "outputs/iteration_2/suitability.json" in run_script
    assert "data/processed/communities.csv" in run_script


def test_unvalidated_analytical_products_are_not_configured() -> None:
    configured = _configured_data_files()

    assert "pattern_insights.json" not in configured
    assert "prevention_opportunities.json" not in configured


def test_validated_iteration_two_products_are_configured() -> None:
    configured = _configured_data_files()

    assert {
        "suitability.json",
        "outcome_comparisons.json",
        "environmental_differences.json",
    } <= configured
