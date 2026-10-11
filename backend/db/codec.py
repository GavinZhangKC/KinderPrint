"""Convert CSV text to typed PostgreSQL values and back, without changing a byte.

The API's validators were written against ``csv.DictReader`` output, so the
database must give back exactly the strings that were in the file. A column is
stored with a numeric or boolean type only when every value in it can be turned
back into its original text by a fixed rule:

* integer / bigint: canonical decimal integers ("0", "-12", never "007" or "+1");
* double precision: values where ``repr(float(text)) == text`` (e.g. "0.1",
  "12.5", "1e-05"; not "12.50" or "1E5");
* boolean: a column whose values are exactly one true and one false spelling
  (e.g. "True"/"False" or "true"/"false"), with those spellings recorded.

Everything else, and any identifier-like column, stays text. An empty string in
a typed column is stored as NULL and returned as "". Text columns keep "" as "".
The load script re-reads every table through ``format_value`` before it commits,
so a dataset that would not round-trip is never published.
"""

from __future__ import annotations

import math
import re
from typing import Any, Iterable

INTEGER = "integer"
BIGINT = "bigint"
DOUBLE = "double precision"
BOOLEAN = "boolean"
TEXT = "text"
TYPES = (INTEGER, BIGINT, DOUBLE, BOOLEAN, TEXT)

_INTEGER_TEXT = re.compile(r"^-?(0|[1-9][0-9]*)$")
_INT32 = (-(2 ** 31), 2 ** 31 - 1)
_INT64 = (-(2 ** 63), 2 ** 63 - 1)
_BOOLEAN_PAIRS = (("True", "False"), ("true", "false"), ("TRUE", "FALSE"))
# Codes and identifiers are kept as text even when they look numeric, so they
# keep their meaning (and any leading zeros) when queried directly.
_IDENTIFIER_NAME = re.compile(r"(^id$|_id$|_code$|^code$|_code_\d{4}$|postcode|phone|_number$|_abn$|^abn$)")


def _is_canonical_float(text: str) -> bool:
    try:
        number = float(text)
    except ValueError:
        return False
    return math.isfinite(number) and repr(number) == text


def infer_column(name: str, values: Iterable[str]) -> dict[str, Any]:
    """Choose the narrowest type that reproduces every value exactly."""
    present = [value for value in values if value != ""]
    if not present or _IDENTIFIER_NAME.search(name.lower()):
        return {"type": TEXT}
    distinct = set(present)
    for true_text, false_text in _BOOLEAN_PAIRS:
        if distinct <= {true_text, false_text}:
            return {"type": BOOLEAN, "true": true_text, "false": false_text}
    if all(_INTEGER_TEXT.match(value) for value in distinct):
        numbers = [int(value) for value in distinct]
        if all(_INT32[0] <= number <= _INT32[1] for number in numbers):
            return {"type": INTEGER}
        if all(_INT64[0] <= number <= _INT64[1] for number in numbers):
            return {"type": BIGINT}
        return {"type": TEXT}
    if all(_is_canonical_float(value) for value in distinct):
        return {"type": DOUBLE}
    return {"type": TEXT}


def parse_value(text: str, spec: dict[str, Any]) -> Any:
    """Turn CSV text into the Python value stored for ``spec``."""
    kind = spec["type"]
    if kind == TEXT:
        return text
    if text == "":
        return None
    if kind in (INTEGER, BIGINT):
        return int(text)
    if kind == DOUBLE:
        return float(text)
    if kind == BOOLEAN:
        if text == spec["true"]:
            return True
        if text == spec["false"]:
            return False
        raise ValueError(f"Unexpected boolean text {text!r}")
    raise ValueError(f"Unknown column type {kind!r}")


def format_value(value: Any, spec: dict[str, Any]) -> str:
    """Turn a stored value back into the exact CSV text."""
    if value is None:
        return ""
    kind = spec["type"]
    if kind == TEXT:
        return value
    if kind in (INTEGER, BIGINT):
        return str(int(value))
    if kind == DOUBLE:
        return repr(float(value))
    if kind == BOOLEAN:
        return spec["true"] if value else spec["false"]
    raise ValueError(f"Unknown column type {kind!r}")
