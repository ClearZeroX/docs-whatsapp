import unittest

from apollo import build_apollo_request, normalize_apollo_rows, validate_apollo_request


class ApolloToolTest(unittest.TestCase):
    def test_database_lookup_uses_confirmed_resource_lane_config_fields(self):
        request = build_apollo_request(
            namespace="application",
            key_keyword="task.send.strategy",
            config_keys=None,
            source="database",
            reason="排查任务发送策略是否受配置影响",
            time_start=None,
            time_end=None,
            limit=20,
        )
        self.assertEqual(request["table"], "resource_lane_config")
        self.assertEqual(request["columns"], ["config_key", "config_value", "status", "update_time"])
        self.assertEqual(request["where"], [
            {"field": "status", "op": "eq", "value": 1},
            {"field": "config_key", "op": "like", "value": "%task.send.strategy%"},
        ])
        self.assertEqual(request["limit"], 20)

    def test_config_key_lookup_batches_through_structured_in(self):
        request = build_apollo_request(
            namespace="application",
            key_keyword=None,
            config_keys=["a", "b"],
            source="database",
            reason="核对代码中明确使用的两个配置",
            time_start=None,
            time_end=None,
            limit=20,
        )
        self.assertEqual(request["where"][1]["op"], "in")
        self.assertEqual(request["where"][1]["value"], ["a", "b"])

    def test_unbounded_or_missing_reason_request_is_rejected(self):
        for kwargs in [
            {"namespace": None, "key_keyword": None, "config_keys": None, "reason": "有影响"},
            {"namespace": "application", "key_keyword": "x", "config_keys": None, "reason": ""},
        ]:
            with self.assertRaises(ValueError):
                validate_apollo_request(
                    kwargs["namespace"], kwargs["key_keyword"], kwargs["config_keys"], "database", kwargs["reason"],
                )

    def test_sensitive_config_value_is_redacted(self):
        rows = [{"config_key": "x", "config_value": '{"accessKey":"abc","enabled":true}', "status": 1}]
        result = normalize_apollo_rows(rows)
        self.assertIn('"accessKey":"***"', result[0]["config_value"])
        self.assertNotIn("abc", result[0]["config_value"])


if __name__ == "__main__":
    unittest.main()
