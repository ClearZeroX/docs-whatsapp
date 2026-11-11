import json
import re
from dataclasses import dataclass
from datetime import datetime

from config import IN_BATCH_SIZE, MAX_QUERY_LIMIT, MONGO_COLLECTION_FIELDS


IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
ALLOWED_OPERATORS = {"$in", "$nin", "$gte", "$gt", "$lte", "$lt", "$eq", "$ne", "$exists", "$regex"}
UNSAFE_OPERATORS = {"$where", "$function", "$accumulator", "$out", "$merge"}


@dataclass
class QueryPlan:
    query: str


@dataclass
class _IsoDate:
    value: str


def split_in_values(values, batch_size=IN_BATCH_SIZE):
    if not isinstance(values, list) or not values:
        raise ValueError("IN values must be a non-empty list")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    return [values[index:index + batch_size] for index in range(0, len(values), batch_size)]


def format_iso_date(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("value must be ISO-8601")
    if parsed.tzinfo is None:
        raise ValueError("value must be ISO-8601 with timezone")
    return _IsoDate(str(value))


def _collection(request):
    collection = request.get("collection")
    if collection not in MONGO_COLLECTION_FIELDS:
        raise ValueError("collection is not allowed")
    return collection, MONGO_COLLECTION_FIELDS[collection]


def _field(field, allowed):
    if not isinstance(field, str) or not IDENTIFIER.match(field) or field not in allowed:
        raise ValueError("field is not allowed")
    return field


def _value(value, field=None):
    if isinstance(value, dict):
        output = {}
        for operator, operand in value.items():
            if operator in UNSAFE_OPERATORS or operator not in ALLOWED_OPERATORS:
                raise ValueError("operator is not allowed")
            if operator in ("$gte", "$gt", "$lte", "$lt") and field and field.endswith("time"):
                output[operator] = format_iso_date(operand)
            else:
                output[operator] = _value(operand, field)
        return output
    if isinstance(value, list):
        return [_value(item, field) for item in value]
    return value


def _filter(value, allowed):
    if not isinstance(value, dict):
        raise ValueError("filter must be an object")
    result = {}
    for field, condition in value.items():
        if field.startswith("$"):
            raise ValueError("operator is not allowed")
        result[_field(field, allowed)] = _value(condition, field)
    return result


def _projection(value, allowed):
    if not value:
        return {}
    if not isinstance(value, dict):
        raise ValueError("projection must be an object")
    return {_field(field, allowed): int(flag) for field, flag in value.items()}


def _sort(value, allowed):
    if not value:
        return {}
    if not isinstance(value, dict):
        raise ValueError("sort must be an object")
    result = {}
    for field, direction in value.items():
        direction = int(direction)
        if direction not in (-1, 1):
            raise ValueError("sort direction is not allowed")
        result[_field(field, allowed)] = direction
    return result


def _limit(request):
    value = int(request.get("limit", MAX_QUERY_LIMIT))
    if value < 1 or value > MAX_QUERY_LIMIT:
        raise ValueError("limit must be between 1 and 50")
    return value


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _render(value):
    if isinstance(value, _IsoDate):
        return 'ISODate("' + value.value + '")'
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(str(key), ensure_ascii=False) + ":" + _render(item) for key, item in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_render(item) for item in value) + "]"
    return _json(value)


def build_find(request):
    collection, allowed = _collection(request)
    filter_json = _filter(request.get("filter") or {}, allowed)
    projection_json = _projection(request.get("projection") or {}, allowed)
    sort_json = _sort(request.get("sort") or {}, allowed)
    query = "db." + collection + ".find(" + _render(filter_json) + "," + _render(projection_json) + ")"
    if sort_json:
        query += ".sort(" + _render(sort_json) + ")"
    query += ".limit(" + str(_limit(request)) + ")"
    return QueryPlan(query)


def build_count(request):
    collection, allowed = _collection(request)
    filter_json = _filter(request.get("filter") or {}, allowed)
    return QueryPlan(
        "db." + collection + ".find(" + _render(filter_json) + ",{\"_id\":1}).limit(" + str(_limit(request)) + ")"
    )


def build_explain(request):
    return QueryPlan(build_find(request).query + ".explain()")

