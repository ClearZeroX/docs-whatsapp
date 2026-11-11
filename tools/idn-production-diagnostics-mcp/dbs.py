from copy import deepcopy

from config import DATABASE, DBS_BASE_URL, DBS_PAGE_SIZE, DBS_QUERY_PATH, IN_BATCH_SIZE, MAX_QUERY_LIMIT, MONGO_INSTANCE, MYSQL_INSTANCE, MYSQL_BLOCKED_TABLES, MONGO_COLLECTION_FIELDS
from http_client import ReadOnlyHttpClient
from mongo_query import build_count as build_mongo_count
from mongo_query import build_explain as build_mongo_explain
from mongo_query import build_find
from mysql_query import build_count as build_mysql_count
from mysql_query import build_explain as build_mysql_explain
from mysql_query import build_select
from mysql_query import split_in_values as split_mysql_in_values
from redaction import redact_document, redact_value
from mongo_query import split_in_values as split_mongo_in_values
from readonly_guard import assert_read_only_query


def _request(client, instance, query, limit, redact=True):
    if limit < 1 or limit > MAX_QUERY_LIMIT:
        raise ValueError("limit must be between 1 and 50")
    assert_read_only_query(instance, query)
    session = client.session
    token = session.cookies.get("csrftoken", "")
    payload = {
        "csrfmiddlewaretoken": token,
        "instance_name": instance,
        "db_name": DATABASE,
        "schema_name": "",
        "tb_name": "",
        "sql_content": query,
        "limit_num": str(min(limit, DBS_PAGE_SIZE)),
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": token,
        "Referer": DBS_BASE_URL + "/sqlquery/",
        "Origin": DBS_BASE_URL,
    }
    body = client.post_json(DBS_BASE_URL, DBS_QUERY_PATH, payload, headers)
    if body.get("status") != 0:
        raise RuntimeError("DBS query failed: %s" % ((body.get("data") or {}).get("error") or body.get("msg")))
    data = body.get("data") or {}
    columns = data.get("column_list") or []
    rows = data.get("rows") or []
    if redact:
        rows = [_redact_row(row, columns) for row in rows]
    return {
        "environment": "idn-prod",
        "source": "dbs-mysql" if instance == MYSQL_INSTANCE else "dbs-mongodb",
        "readOnly": True,
        "instance": instance,
        "database": DATABASE,
        "columns": columns,
        "rows": rows,
        "query": query,
        "truncated": len(rows) > limit,
    }


def _redact_row(row, columns):
    if isinstance(row, dict):
        return redact_document(row)
    if isinstance(row, list):
        return [redact_value(column, value) for column, value in zip(columns, row)]
    return redact_document(row)


def query_mysql(client, request, mode="select"):
    _require_allowed_mysql_table(request)
    if "schema" not in request:
        request = dict(request, schema=_get_mysql_fields(client, request.get("table")))
    batches = _split_where_request(request, split_mysql_in_values)
    if len(batches) > 1:
        return _query_mysql_batches(client, batches, mode)
    if mode == "select":
        plan = build_select(request)
    elif mode == "count":
        plan = build_mysql_count(request)
    elif mode == "explain":
        plan = build_mysql_explain(request)
    else:
        raise ValueError("unsupported MySQL mode")
    return _request(client, MYSQL_INSTANCE, plan.rendered_sql(), int(request.get("limit", MAX_QUERY_LIMIT)))


def query_mongo(client, request, mode="find"):
    batches = _split_filter_request(request, split_mongo_in_values)
    if len(batches) > 1:
        return _query_mongo_batches(client, batches, mode)
    if mode == "find":
        plan = build_find(request)
        return _request(client, MONGO_INSTANCE, plan.query, int(request.get("limit", MAX_QUERY_LIMIT)))
    if mode == "count":
        plan = build_mongo_count(request)
        result = _request(client, MONGO_INSTANCE, plan.query, int(request.get("limit", MAX_QUERY_LIMIT)))
        result["count"] = len(result.get("rows") or [])
        result["bounded"] = True
        result["truncated"] = len(result.get("rows") or []) >= int(request.get("limit", MAX_QUERY_LIMIT))
        return result
    if mode == "explain":
        plan = build_mongo_explain(request)
        result = _request(client, MONGO_INSTANCE, plan.query, int(request.get("limit", MAX_QUERY_LIMIT)))
        result["truncated"] = False
        return result
    raise ValueError("unsupported MongoDB mode")


def _split_where_request(request, splitter):
    for index, condition in enumerate(request.get("where") or []):
        if condition.get("op") in ("in", "notIn") and isinstance(condition.get("value"), list) and len(condition["value"]) > IN_BATCH_SIZE:
            requests = []
            for values in splitter(condition["value"]):
                item = deepcopy(request)
                item["where"][index]["value"] = values
                requests.append(item)
            return requests
    return [request]


def _split_filter_request(request, splitter):
    for field, condition in (request.get("filter") or {}).items():
        if isinstance(condition, dict) and any(
            operator in condition and isinstance(condition[operator], list) and len(condition[operator]) > IN_BATCH_SIZE
            for operator in ("$in", "$nin")
        ):
            operator = "$in" if "$in" in condition else "$nin"
            requests = []
            for values in splitter(condition[operator]):
                item = deepcopy(request)
                item["filter"][field][operator] = values
                requests.append(item)
            return requests
    return [request]


def _merge_results(results, source, requested_limit):
    rows = []
    for result in results:
        rows.extend(result.get("rows") or [])
    merged = dict(results[0])
    merged["rows"] = rows[:requested_limit]
    merged["truncated"] = len(rows) > requested_limit or any(result.get("truncated") for result in results)
    merged["batchCount"] = len(results)
    merged["source"] = source
    return merged


def _query_mysql_batches(client, requests, mode):
    results = [query_mysql(client, request, mode) for request in requests]
    return _merge_results(results, "dbs-mysql", int(requests[0].get("limit", MAX_QUERY_LIMIT)))


def _query_mongo_batches(client, requests, mode):
    results = [query_mongo(client, request, mode) for request in requests]
    return _merge_results(results, "dbs-mongodb", int(requests[0].get("limit", MAX_QUERY_LIMIT)))


def get_schema(client, database_type, table_or_collection):
    if database_type == "mysql":
        if not isinstance(table_or_collection, str) or not table_or_collection:
            raise ValueError("table identifier is invalid")
        _require_allowed_mysql_table({"table": table_or_collection})
        result = _request(
            client,
            MYSQL_INSTANCE,
            "SHOW FULL COLUMNS FROM `" + table_or_collection + "`",
            MAX_QUERY_LIMIT,
            redact=False,
        )
        columns = result.get("columns") or []
        rows = result.get("rows") or []
        normalized = []
        for row in rows:
            item = dict(zip(columns, row)) if isinstance(row, list) else row
            normalized.append(item)
        return {
            "environment": "idn-prod",
            "source": "dbs-mysql",
            "readOnly": True,
            "instance": MYSQL_INSTANCE,
            "database": DATABASE,
            "table": table_or_collection,
            "schemaSource": "show-full-columns",
            "columns": normalized,
        }
    if database_type == "mongodb":
        fields = MONGO_COLLECTION_FIELDS.get(table_or_collection)
        if fields is None:
            raise ValueError("collection is not allowed")
        return {
            "environment": "idn-prod",
            "source": "dbs-mongodb",
            "readOnly": True,
            "instance": MONGO_INSTANCE,
            "database": DATABASE,
            "collection": table_or_collection,
            "schemaSource": "code-model-allowlist",
            "schemaVerified": False,
            "warning": "DBS does not expose a validated MongoDB schema query; verify fields from code or an approved sample query before use.",
            "fields": sorted(fields),
        }
    raise ValueError("databaseType must be mysql or mongodb")


def _require_allowed_mysql_table(request):
    from mysql_query import IDENTIFIER

    table = request.get("table")
    if not isinstance(table, str) or not IDENTIFIER.match(table):
        raise ValueError("table identifier is invalid")
    if table in MYSQL_BLOCKED_TABLES:
        raise ValueError("table is blocked")


def _get_mysql_fields(client, table):
    result = _request(
        client,
        MYSQL_INSTANCE,
        "SHOW FULL COLUMNS FROM `" + table + "`",
        MAX_QUERY_LIMIT,
        redact=False,
    )
    columns = result.get("columns") or []
    rows = result.get("rows") or []
    fields = []
    for row in rows:
        if isinstance(row, dict):
            fields.append(row.get("Field"))
        elif isinstance(row, list) and columns:
            field_index = columns.index("Field") if "Field" in columns else 0
            if field_index < len(row):
                fields.append(row[field_index])
    if not fields or any(not isinstance(field, str) for field in fields):
        raise ValueError("unable to resolve table schema")
    return fields

