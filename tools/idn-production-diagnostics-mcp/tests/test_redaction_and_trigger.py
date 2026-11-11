import unittest

from redaction import is_explicit_idn_production_request, redact_value


class RedactionAndTriggerTest(unittest.TestCase):
    def test_explicit_indonesia_production_requests_are_accepted(self):
        for text in ["查询印尼生产日志", "查询 IDN prod 的 MySQL", "Indonesia production traceId"]:
            self.assertTrue(is_explicit_idn_production_request(text))


    def test_ambiguous_requests_are_rejected(self):
        for text in ["查生产日志", "查印尼日志", "排查模板aaa失败"]:
            self.assertFalse(is_explicit_idn_production_request(text))


    def test_sensitive_database_fields_are_redacted(self):
        self.assertEqual(redact_value("customer_phone", "6285213500912"), "6285******12")
        self.assertEqual(redact_value("email", "ridho@example.com"), "r***@example.com")
        self.assertEqual(redact_value("status", "failed"), "failed")


if __name__ == "__main__":
    unittest.main()
