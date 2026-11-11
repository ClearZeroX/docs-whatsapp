import unittest

from dbs import get_schema, query_mongo, query_mysql
from dbs import _request
from http_client import ReadOnlyHttpClient
from kibana import TimeRange, build_log_query, extract_trace_ids, parse_time_range


class FakeResponse:
    status_code = 200

    def __init__(self, body):
        self.body = body

    def json(self):
        return self.body


class FakeSession:
    def __init__(self):
        self.cookies = {"csrftoken": "csrf"}
        self.requests = []

    def post(self, url, **kwargs):
        self.requests.append((url, kwargs))
        sql = (kwargs.get("data") or {}).get("sql_content", "")
        if "SHOW FULL COLUMNS" in sql:
            return FakeResponse({"status": 0, "data": {"column_list": ["Field", "Type", "Null", "Key"], "rows": [["name", "varchar(256)", "NO", "MUL"], ["status", "varchar(50)", "NO", "MUL"]]}})
        return FakeResponse({"status": 0, "data": {"column_list": ["id"], "rows": [{"id": 1}]}})


class SequenceSession(FakeSession):
    def post(self, url, **kwargs):
        self.requests.append((url, kwargs))
        sql = (kwargs.get("data") or {}).get("sql_content", "")
        if sql.startswith("db.message_record"):
            return FakeResponse({"status": 0, "data": {"column_list": ["customer_phone", "msg_status"], "rows": [["6283856337307", "delivered"]]}})
        return super().post(url, **kwargs)


class AdapterTest(unittest.TestCase):
    def test_dbs_mysql_sends_complete_read_only_sql_to_mysql_instance(self):
        session = FakeSession()
        client = ReadOnlyHttpClient(session)
        result = query_mysql(
            client,
            {"table": "message_template", "schema": ["id"], "columns": ["id"], "where": [{"field": "id", "op": "eq", "value": 7}], "limit": 5},
        )

        payload = session.requests[-1][1]["data"]
        self.assertEqual(payload["instance_name"], "10.95.6.3-ob_collection")
        self.assertEqual(payload["db_name"], "whatsapp_crm")
        self.assertEqual(payload["sql_content"], "SELECT `id` FROM `message_template` WHERE `id` = 7 LIMIT 5")
        self.assertNotIn("%s", payload["sql_content"])
        self.assertTrue(result["readOnly"])

    def test_dbs_mongo_sends_reference_query_shape_to_mongo_instance(self):
        session = FakeSession()
        client = ReadOnlyHttpClient(session)
        query_mongo(
            client,
            {
                "collection": "message_record",
                "filter": {"send_time": {"$gte": "2026-10-22T00:00:00+08:00"}},
                "projection": {"task_id": 1},
                "sort": {"send_time": -1},
                "limit": 5,
            },
        )

        payload = session.requests[0][1]["data"]
        self.assertEqual(payload["instance_name"], "10.95.6.240-whatsapp-crm")
        self.assertIn('db.message_record.find({"send_time":{"$gte":ISODate("2026-10-22T00:00:00+08:00")}}, {"task_id":1})'.replace(", ", ","), payload["sql_content"])

    def test_log_time_range_and_trace_grouping(self):
        self.assertEqual(parse_time_range("now-2d", "now"), TimeRange("now-2d", "now"))
        query = build_log_query("aaa", None, TimeRange("now-2d", "now"))
        self.assertEqual(query["index"], "*whatsapp*")
        self.assertEqual(query["size"], 500)
        grouped = extract_trace_ids([{"message": "traceId:[abc] first"}, {"message": "traceId:[abc] second"}])
        self.assertEqual(list(grouped), ["abc"])
        self.assertEqual(len(grouped["abc"]), 2)

    def test_mysql_schema_is_read_through_headless_show_full_columns(self):
        session = FakeSession()
        schema = get_schema(ReadOnlyHttpClient(session), "mysql", "message_template")
        payload = session.requests[0][1]["data"]

        self.assertEqual(payload["instance_name"], "10.95.6.3-ob_collection")
        self.assertEqual(payload["sql_content"], "SHOW FULL COLUMNS FROM `message_template`")
        self.assertEqual(schema["schemaSource"], "show-full-columns")
        self.assertEqual([column["Field"] for column in schema["columns"]], ["name", "status"])

    def test_mongo_array_rows_are_redacted_by_column_name(self):
        session = SequenceSession()
        result = query_mongo(
            ReadOnlyHttpClient(session),
            {"collection": "message_record", "filter": {"customer_phone": "6283856337307"}, "projection": {"customer_phone": 1, "msg_status": 1}, "limit": 1},
        )
        self.assertEqual(result["rows"][0][0], "6283******07")
        self.assertEqual(result["rows"][0][1], "delivered")
        self.assertFalse(result["truncated"])

    def test_dbs_request_guard_blocks_write_before_http_call(self):
        session = FakeSession()
        client = ReadOnlyHttpClient(session)
        with self.assertRaises(ValueError):
            _request(client, "10.95.6.3-ob_collection", "DELETE FROM `message_template`", 1)
        self.assertEqual(session.requests, [])


if __name__ == "__main__":
    unittest.main()

class BrowserBridgeLogTest(unittest.TestCase):
    def test_log_query_works_with_browser_bridge_client_contract(self):
        from kibana import query_logs

        class FakeBridgeClient:
            def post_json(self, base_url, path, payload, headers=None, json_body=False):
                self.request = (base_url, path, payload, headers, json_body)
                return {"rows": [{"_source": {"message": "traceId:[abc] handled"}}]}

        client = FakeBridgeClient()
        result = query_logs(client, trace_id="abc", time_start="now-1h", time_end="now")
        self.assertEqual(result["matchedTraceIds"], ["abc"])
        self.assertEqual(client.request[4], True)

    def test_mongo_count_uses_find_query_and_reports_bounded_count(self):
        session = SequenceSession()
        result = query_mongo(
            ReadOnlyHttpClient(session),
            {"collection": "message_record", "filter": {"task_id": 154}, "limit": 5},
            "count",
        )
        payload = session.requests[0][1]["data"]
        self.assertEqual(payload["sql_content"], 'db.message_record.find({"task_id":154},{"_id":1}).limit(5)')
        self.assertTrue(result["bounded"])

    def test_mongo_explain_does_not_report_count_metadata(self):
        session = SequenceSession()
        result = query_mongo(
            ReadOnlyHttpClient(session),
            {"collection": "message_record", "filter": {"task_id": 154}, "limit": 5},
            "explain",
        )
        self.assertNotIn("count", result)
        self.assertNotIn("bounded", result)

    def test_mongo_explain_clears_row_truncation_metadata(self):
        session = SequenceSession()
        result = query_mongo(
            ReadOnlyHttpClient(session),
            {"collection": "message_record", "filter": {"task_id": 154}, "limit": 1},
            "explain",
        )
        self.assertFalse(result["truncated"])
