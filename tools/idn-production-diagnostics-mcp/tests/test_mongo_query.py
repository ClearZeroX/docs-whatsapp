import unittest

from mongo_query import build_count, build_explain, build_find, format_iso_date, split_in_values


class MongoQueryTest(unittest.TestCase):
    def test_build_find_matches_dbs_mongodb_syntax(self):
        plan = build_find(
            {
                "collection": "message_record",
                "filter": {
                    "template_name": {
                        "$in": [
                            "old_10_interestdown_02_2_smtn_am261023_noknu",
                            "old_10_interestdown_02_2_smtn_am261023_noknu_shadow",
                        ]
                    },
                    "send_time": {
                        "$gte": "2026-10-22T00:00:00+08:00",
                        "$lt": "2026-10-28T00:00:00+08:00",
                    },
                },
                "projection": {
                    "task_id": 1,
                    "business_phone": 1,
                    "customer_phone": 1,
                    "template": 1,
                    "msg_status": 1,
                    "send_time": 1,
                    "relate_extra": 1,
                },
                "sort": {"send_time": -1},
                "limit": 5,
            }
        )

        self.assertIn('db.message_record.find({', plan.query)
        self.assertIn('"template_name":{"$in":["old_10_interestdown_02_2_smtn_am261023_noknu","old_10_interestdown_02_2_smtn_am261023_noknu_shadow"]}', plan.query)
        self.assertIn('"send_time":{"$gte":ISODate("2026-10-22T00:00:00+08:00"),"$lt":ISODate("2026-10-28T00:00:00+08:00")}', plan.query)
        self.assertIn('.sort({"send_time":-1}).limit(5)', plan.query)


    def test_mongo_supports_count_and_explain_without_write_commands(self):
        request = {"collection": "message_record", "filter": {"msg_status": "failed"}, "limit": 10}

        count = build_count(request)
        explain = build_explain(request)

        self.assertEqual(count.query, 'db.message_record.find({"msg_status":"failed"},{"_id":1}).limit(10)')
        self.assertTrue(explain.query.startswith('db.message_record.find({"msg_status":"failed"},{}'))
        self.assertIn(".explain()", explain.query)
        self.assertFalse(any(word in count.query.lower() for word in ["update", "delete", "insert", "aggregate"]))


    def test_mongo_rejects_unsafe_operators_collections_and_dates(self):
        with self.assertRaisesRegex(ValueError, "operator is not allowed"):
            build_find({"collection": "message_record", "filter": {"$where": "sleep(1)"}, "limit": 1})
        with self.assertRaisesRegex(ValueError, "collection is not allowed"):
            build_find({"collection": "system.profile", "filter": {}, "limit": 1})
        with self.assertRaisesRegex(ValueError, "ISO-8601"):
            format_iso_date("not-a-date")


    def test_mongo_in_values_are_split_in_batches(self):
        batches = split_in_values(list(range(1001)), batch_size=500)

        self.assertEqual([len(batch) for batch in batches], [500, 500, 1])


if __name__ == "__main__":
    unittest.main()

    def test_count_uses_dbs_supported_find_limit_shape(self):
        plan = build_count({"collection": "message_record", "filter": {"task_id": 154}, "limit": 50})
        self.assertEqual(plan.query, 'db.message_record.find({"task_id":154},{"_id":1}).limit(50)')
