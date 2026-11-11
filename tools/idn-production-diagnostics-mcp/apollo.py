import json
import re


APOLLO_TABLE = "resource_lane_config"
APOLLO_COLUMNS = ["config_key", "config_value", "status", "update_time"]
SOURCES = {"database", "logs", "both"}
SECRET_PATTERN = re.compile(
    r'(?i)(["\']?(?:password|secret|token|access.?key|private.?key|credential|authorization)["\']?\s*[:=]\s*["\'])([^"\']*)(["\'])'
)


def _blank(value):
    return value is None or not str(value).strip()


def validate_apollo_request(namespace, key_keyword, config_keys, source, reason):
    keys = config_keys or []
    if _blank(namespace) and _blank(key_keyword) and not keys:
        raise ValueError("Apollo lookup requires namespace, keyKeyword, or configKeys from the investigation context")
    if source not in SOURCES:
        raise ValueError("source must be database, logs, or both")
    if _blank(reason):
        raise ValueError("reason is required for an Apollo lookup")
    if not isinstance(keys, list) or any(_blank(item) for item in keys):
        raise ValueError("configKeys must be a list of non-empty strings")


def build_apollo_request(namespace, key_keyword, config_keys, source, reason, time_start, time_end, limit=50):
    validate_apollo_request(namespace, key_keyword, config_keys, source, reason)
    if not isinstance(limit, int) or limit < 1 or limit > 50:
        raise ValueError("limit must be between 1 and 50")
    where = [{"field": "status", "op": "eq", "value": 1}]
    if config_keys:
        where.append({"field": "config_key", "op": "in", "value": [str(item).strip() for item in config_keys]})
    else:
        selector = key_keyword if not _blank(key_keyword) else namespace
        where.append({"field": "config_key", "op": "like", "value": "%" + str(selector).strip() + "%"})
    return {
        "table": APOLLO_TABLE,
        "columns": list(APOLLO_COLUMNS),
        "where": where,
        "orderBy": [{"field": "update_time", "direction": "desc"}],
        "limit": limit,
        "source": source,
        "reason": reason,
        "namespace": namespace,
        "keyKeyword": key_keyword,
        "configKeys": list(config_keys or []),
        "timeStart": time_start,
        "timeEnd": time_end,
    }


def _redact_text(value):
    if not isinstance(value, str):
        return value
    return SECRET_PATTERN.sub(r"\1***\3", value)


def normalize_apollo_rows(rows):
    result = []
    for row in rows or []:
        if isinstance(row, dict):
            result.append({key: _redact_text(value) if key == "config_value" else value for key, value in row.items()})
        elif isinstance(row, list):
            result.append(row)
        else:
            result.append(row)
    return result
