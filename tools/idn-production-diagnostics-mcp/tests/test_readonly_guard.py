import unittest

from readonly_guard import assert_read_only_query


class ReadOnlyGuardTest(unittest.TestCase):
    def test_mysql_allows_select_count_explain_and_schema_reads(self):
        for query in [
            "SELECT `id` FROM `message_template` LIMIT 1",
            "SELECT COUNT(*) AS `count` FROM `task_base`",
            "EXPLAIN SELECT * FROM `task_base` LIMIT 1",
            "SHOW FULL COLUMNS FROM `message_template`",
        ]:
            assert_read_only_query("10.95.6.3-ob_collection", query)

    def test_mysql_rejects_write_and_multi_statement(self):
        for query in [
            "UPDATE `message_template` SET `status` = 'x'",
            "DELETE FROM `message_template`",
            "INSERT INTO `task_base` (`name`) VALUES ('x')",
            "SELECT 1; DROP TABLE `task_base`",
            "SELECT * FROM `task_base` INTO OUTFILE '/tmp/x'",
            "SELECT * FROM `task_base` FOR UPDATE",
        ]:
            with self.assertRaises(ValueError):
                assert_read_only_query("10.95.6.3-ob_collection", query)

    def test_mongo_allows_read_only_commands(self):
        for query in [
            'db.message_record.find({"customer_phone":"1"}).limit(1)',
            'db.message_record.countDocuments({"msg_status":"failed"})',
            'db.message_record.find({},{}).limit(1).explain()',
            'db.message_record.find({},{}).limit(1).explain()',
        ]:
            assert_read_only_query("10.95.6.240-whatsapp-crm", query)

    def test_mongo_rejects_writes_and_unsafe_commands(self):
        for query in [
            'db.message_record.updateOne({"customer_phone":"1"},{"$set":{"x":1}})',
            'db.message_record.deleteMany({})',
            'db.message_record.aggregate([{"$out":"x"}])',
            'db.message_record.find({"$where":"sleep(1)"})',
            'db.message_record.find({}).toArray()',
            'db.message_record.find({}).limit(1); db.message_record.drop()',
        ]:
            with self.assertRaises(ValueError):
                assert_read_only_query("10.95.6.240-whatsapp-crm", query)


if __name__ == "__main__":
    unittest.main()
