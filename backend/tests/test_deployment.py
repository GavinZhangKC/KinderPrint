from pathlib import Path
import re


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_PATH = REPOSITORY_ROOT / "template.yaml"
PACKAGE_SCRIPT_PATH = REPOSITORY_ROOT / "backend" / "prepare_lambda_package.sh"


def _configured_data_files() -> set[str]:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return set(re.findall(r"/var/task/data/([^\s]+)", template))


def test_every_configured_runtime_dataset_is_packaged() -> None:
    package_script = PACKAGE_SCRIPT_PATH.read_text(encoding="utf-8")

    for filename in _configured_data_files():
        assert filename in package_script, f"{filename} is configured but not packaged"


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
