import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from config import KIBANA_BASE_URL, KIBANA_DATA_VIEW
from http_client import ReadOnlyHttpClient


TRACE_ID = re.compile(r"traceId:\[([^\]]+)\]", re.IGNORECASE)


@dataclass
class TimeRange:
    start: str
    end: str


def parse_time_range(time_start, time_end):
    if not time_start or not time_end:
        raise ValueError("time_start and time_end are required")
    if isinstance(time_start, str) and time_start.startswith("now-"):
        match = re.fullmatch(r"now-(\d+)([mhd])", time_start)
        if not match or time_end != "now":
            raise ValueError("relative time range must be now-Nm/Nh/Nd to now")
        amount, unit = int(match.group(1)), match.group(2)
        if unit == "m":
            delta = timedelta(minutes=amount)
        elif unit == "h":
            delta = timedelta(hours=amount)
        else:
            delta = timedelta(days=amount)
        if delta > timedelta(days=7):
            raise ValueError("time range cannot exceed 7 days")
        return TimeRange(time_start, time_end)
    try:
        start = datetime.fromisoformat(str(time_start).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(time_end).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("absolute time must be ISO-8601") from exc
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("absolute time must include timezone")
    if start >= end:
        raise ValueError("time_start must be before time_end")
    if end - start > timedelta(days=7):
        raise ValueError("time range cannot exceed 7 days")
    return TimeRange(str(time_start), str(time_end))


def build_log_query(keyword=None, trace_id=None, time_range=None):
    if bool(keyword) == bool(trace_id):
        raise ValueError("exactly one of keyword or trace_id is required")
    if not isinstance(time_range, TimeRange):
        raise ValueError("time range is required")
    value = trace_id or keyword
    if not isinstance(value, str) or not value.strip() or any(char in value for char in ["\n", "\r"]):
        raise ValueError("search value is invalid")
    query = {"bool": {"filter": [{"range": {"@timestamp": {"gte": time_range.start, "lte": time_range.end}}}]}}
    query["bool"]["filter"].append({"match_phrase": {"message": value.strip()}})
    return {
        "index": KIBANA_DATA_VIEW,
        "query": query,
        "size": 500,
        "sort": [{"@timestamp": {"order": "asc"}}],
    }


def extract_trace_ids(rows):
    result = {}
    for row in rows or []:
        message = str(row.get("message") or row.get("_source", {}).get("message") or "")
        match = TRACE_ID.search(message)
        if match:
            trace_id = match.group(1)
            result.setdefault(trace_id, []).append(row)
    return result


def query_logs(client, keyword=None, trace_id=None, time_start=None, time_end=None):
    time_range = parse_time_range(time_start, time_end)
    request = build_log_query(keyword, trace_id, time_range)
    headers = {"Content-Type": "application/json", "kbn-xsrf": "idn-production-diagnostics"}
    body = client.post_json(KIBANA_BASE_URL, "/internal/search/es", {"params": [request]}, headers, json_body=True)
    rows = body.get("rows") or body.get("hits", {}).get("hits", [])
    parsed_rows = [row.get("_source", row) for row in rows]
    grouped = extract_trace_ids(parsed_rows)
    return {
        "environment": "idn-prod",
        "source": "kibana-discover",
        "readOnly": True,
        "timeStart": time_start,
        "timeEnd": time_end,
        "keyword": keyword,
        "traceId": trace_id,
        "rows": parsed_rows,
        "matchedTraceIds": list(grouped.keys()),
        "truncated": len(rows) >= 500,
    }

