import json
import sys
import threading

from browser_bridge import BrowserBridge, BrowserBridgeClient
from apollo import build_apollo_request, normalize_apollo_rows
from config import ENVIRONMENT
from dbs import get_schema, query_mongo, query_mysql
from http_client import ReadOnlyHttpClient
from kibana import query_logs


_log_bridge = None
_log_bridge_lock = threading.Lock()


TOOLS = [
    {"name": "idn_prod_query_logs", "description": "Query Indonesia production WhatsApp logs by keyword or traceId.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "keyword": {"type": "string"}, "traceId": {"type": "string"}, "timeStart": {"type": "string"}, "timeEnd": {"type": "string"}}, "required": ["environmentConfirmation", "timeStart", "timeEnd"]}},
    {"name": "idn_prod_get_apollo_configs", "description": "Read only the Indonesia production Apollo related configuration evidence needed by the investigation. The caller must provide a reason and a bounded namespace, key keyword, or config key list.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "namespace": {"type": "string"}, "keyKeyword": {"type": "string"}, "configKeys": {"type": "array", "items": {"type": "string"}}, "source": {"type": "string", "enum": ["database", "logs", "both"]}, "reason": {"type": "string"}, "timeStart": {"type": "string"}, "timeEnd": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["environmentConfirmation", "reason"]}},
    {"name": "idn_prod_get_schema", "description": "Read an allowlisted Indonesia production database schema.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "databaseType": {"type": "string", "enum": ["mysql", "mongodb"]}, "tableOrCollection": {"type": "string"}}, "required": ["environmentConfirmation", "databaseType", "tableOrCollection"]}},
    {"name": "idn_prod_query_mysql", "description": "Read-only structured SELECT against Indonesia production MySQL. Tables are allowed by default unless blocked; fields are validated against live schema.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "table": {"type": "string"}, "schema": {"type": "array"}, "columns": {"type": "array"}, "where": {"type": "array"}, "orderBy": {"type": "array"}, "limit": {"type": "integer"}, "cursor": {}}, "required": ["environmentConfirmation", "table"]}},
    {"name": "idn_prod_count_mysql", "description": "Read-only structured COUNT against Indonesia production MySQL. Tables are allowed by default unless blocked; fields are validated against live schema.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "table": {"type": "string"}, "schema": {"type": "array"}, "where": {"type": "array"}}, "required": ["environmentConfirmation", "table"]}},
    {"name": "idn_prod_explain_mysql", "description": "Read-only EXPLAIN for Indonesia production MySQL. Tables are allowed by default unless blocked; fields are validated against live schema.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "table": {"type": "string"}, "schema": {"type": "array"}, "columns": {"type": "array"}, "where": {"type": "array"}, "orderBy": {"type": "array"}, "limit": {"type": "integer"}}, "required": ["environmentConfirmation", "table"]}},
    {"name": "idn_prod_query_mongo", "description": "Read-only structured MongoDB find against allowlisted Indonesia production data.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "collection": {"type": "string"}, "filter": {"type": "object"}, "projection": {"type": "object"}, "sort": {"type": "object"}, "limit": {"type": "integer"}}, "required": ["environmentConfirmation", "collection"]}},
    {"name": "idn_prod_count_mongo", "description": "Read-only structured MongoDB count against allowlisted Indonesia production data.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "collection": {"type": "string"}, "filter": {"type": "object"}}, "required": ["environmentConfirmation", "collection"]}},
    {"name": "idn_prod_explain_mongo", "description": "Read-only MongoDB explain for an allowlisted Indonesia production find query.", "inputSchema": {"type": "object", "properties": {"environmentConfirmation": {"type": "string"}, "collection": {"type": "string"}, "filter": {"type": "object"}, "projection": {"type": "object"}, "sort": {"type": "object"}, "limit": {"type": "integer"}}, "required": ["environmentConfirmation", "collection"]}},
]


def _response(request_id, result=None, error=None):
    response = {"jsonrpc": "2.0", "id": request_id}
    if error is not None:
        response["error"] = {"code": -32000, "message": str(error)}
    else:
        response["result"] = result
    return response


def _require_confirmation(arguments):
    if arguments.get("environmentConfirmation") != ENVIRONMENT:
        raise ValueError("Production query requires environmentConfirmation=idn-prod")


def _session_client(domain):
    from auth import ChromeSessionFactory

    session = ChromeSessionFactory().build(domain)
    return ReadOnlyHttpClient(session)


def _log_bridge_client():
    global _log_bridge
    with _log_bridge_lock:
        if _log_bridge is None:
            _log_bridge = BrowserBridge().start()
    return BrowserBridgeClient(_log_bridge.base_url)


def _query_apollo(arguments):
    request = build_apollo_request(
        arguments.get("namespace"),
        arguments.get("keyKeyword"),
        arguments.get("configKeys"),
        arguments.get("source", "database"),
        arguments.get("reason"),
        arguments.get("timeStart"),
        arguments.get("timeEnd"),
        int(arguments.get("limit", 50)),
    )
    source = request["source"]
    response = {
        "environment": "idn-prod",
        "source": "dbs-mysql" if source == "database" else source,
        "readOnly": True,
        "appId": "whatsapp-crm",
        "apolloUrl": "https://config-id-loan-hw-prod.rupiahcepatweb.com/config.html?#/appid=whatsapp-crm",
        "namespace": request["namespace"],
        "keyKeyword": request["keyKeyword"],
        "configKeys": request["configKeys"],
        "reason": request["reason"],
        "sourceRequested": source,
    }
    if source in ("database", "both"):
        result = query_mysql(_session_client("dbs.rupiahcepatweb.com"), request, "select")
        result["rows"] = normalize_apollo_rows(result.get("rows"))
        response["database"] = result
    if source in ("logs", "both"):
        keyword = request["keyKeyword"] or (request["configKeys"] or [request["namespace"]])[0]
        log_result = query_logs(_log_bridge_client(), keyword, None, request["timeStart"] or "now-2h", request["timeEnd"] or "now")
        response["logs"] = log_result
    return response


def call_tool(name, arguments):
    _require_confirmation(arguments)
    if name == "idn_prod_get_apollo_configs":
        return _query_apollo(arguments)
    if name == "idn_prod_query_logs":
        if bool(arguments.get("keyword")) == bool(arguments.get("traceId")):
            raise ValueError("exactly one of keyword or traceId is required")
        client = _log_bridge_client()
        return query_logs(client, arguments.get("keyword"), arguments.get("traceId"), arguments.get("timeStart"), arguments.get("timeEnd"))
    if name == "idn_prod_query_mysql":
        return query_mysql(_session_client("dbs.rupiahcepatweb.com"), arguments, "select")
    if name == "idn_prod_count_mysql":
        return query_mysql(_session_client("dbs.rupiahcepatweb.com"), arguments, "count")
    if name == "idn_prod_explain_mysql":
        return query_mysql(_session_client("dbs.rupiahcepatweb.com"), arguments, "explain")
    if name == "idn_prod_query_mongo":
        return query_mongo(_session_client("dbs.rupiahcepatweb.com"), arguments, "find")
    if name == "idn_prod_count_mongo":
        return query_mongo(_session_client("dbs.rupiahcepatweb.com"), arguments, "count")
    if name == "idn_prod_explain_mongo":
        return query_mongo(_session_client("dbs.rupiahcepatweb.com"), arguments, "explain")
    if name == "idn_prod_get_schema":
        if arguments.get("databaseType") == "mysql":
            return get_schema(_session_client("dbs.rupiahcepatweb.com"), arguments.get("databaseType"), arguments.get("tableOrCollection"))
        return get_schema(None, arguments.get("databaseType"), arguments.get("tableOrCollection"))
    raise ValueError("Unknown tool: " + name)


def handle(request):
    method = request.get("method")
    request_id = request.get("id")
    if method == "initialize":
        return _response(request_id, {"protocolVersion": "2024-11-05", "serverInfo": {"name": "idn-production-diagnostics", "version": "0.1.0"}, "capabilities": {"tools": {}}, "instructions": "idn-prod read-only diagnostics only"})
    if method == "tools/list":
        return _response(request_id, {"tools": TOOLS})
    if method == "tools/call":
        params = request.get("params") or {}
        try:
            return _response(request_id, {"content": [{"type": "text", "text": json.dumps(call_tool(params.get("name"), params.get("arguments") or {}), ensure_ascii=False)}]})
        except Exception as exc:
            return _response(request_id, error=exc)
    if method == "notifications/initialized":
        return None
    return _response(request_id, error="Unsupported method: " + str(method))


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        response = handle(json.loads(line))
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()

