import unittest

from mysql_query import build_count, build_explain, build_select, split_in_values


class MysqlQueryTest(unittest.TestCase):
    def test_build_select_uses_bound_parameters_and_cursor_pagination(self):
        plan = build_select(
            {
                "table": "message_template",
                "schema": ["id", "name", "status"],
                "columns": ["id", "name", "status"],
                "where": [
                    {"field": "name", "op": "like", "value": "%aaa%"},
                    {"field": "id", "op": "in", "value": [1, 2, 3]},
                ],
                "orderBy": [{"field": "id", "direction": "desc"}],
                "limit": 50,
                "cursor": 100,
            }
        )

        self.assertEqual(plan.sql, (
        "SELECT `id`, `name`, `status` FROM `message_template` "
        "WHERE `name` LIKE %s AND `id` IN (%s, %s, %s) AND `id` < %s "
        "ORDER BY `id` DESC LIMIT 50"
        ))
        self.assertEqual(plan.params, ["%aaa%", 1, 2, 3, 100])


    def test_build_count_and_explain_remain_read_only(self):
        count = build_count({"table": "message_template", "schema": ["id"], "where": [{"field": "id", "op": "eq", "value": 1}]})
        explain = build_explain({"table": "message_template", "schema": ["id"], "where": [{"field": "id", "op": "eq", "value": 1}]})

        self.assertEqual(count.sql, "SELECT COUNT(*) AS `count` FROM `message_template` WHERE `id` = %s")
        self.assertTrue(explain.sql.startswith("EXPLAIN SELECT * FROM `message_template`"))
        self.assertEqual(count.params, [1])
        self.assertEqual(explain.params, [1])


    def test_mysql_allows_tables_by_default_and_rejects_unknown_fields(self):
        plan = build_select({"table": "users", "schema": ["id"], "columns": ["id"], "limit": 10})
        self.assertIn("FROM `users`", plan.sql)
        with self.assertRaisesRegex(ValueError, "field is not allowed"):
            build_select({"table": "message_template", "schema": ["id", "name", "status"], "columns": ["password"], "limit": 10})
        with self.assertRaisesRegex(ValueError, "limit"):
            build_select({"table": "message_template", "schema": ["id"], "columns": ["id"], "limit": 0})

    def test_mysql_rejects_blocked_table_and_invalid_identifier(self):
        from mysql_query import _table_and_fields
        import mysql_query

        original = mysql_query.MYSQL_BLOCKED_TABLES
        mysql_query.MYSQL_BLOCKED_TABLES = {"blocked_table"}
        try:
            with self.assertRaisesRegex(ValueError, "table is blocked"):
                _table_and_fields({"table": "blocked_table", "schema": ["id"]})
        finally:
            mysql_query.MYSQL_BLOCKED_TABLES = original
        with self.assertRaisesRegex(ValueError, "identifier is invalid"):
            _table_and_fields({"table": "users; drop table x", "schema": ["id"]})


    def test_in_values_are_split_in_batches(self):
        values = list(range(1001))
        batches = split_in_values(values, batch_size=500)

        self.assertEqual([len(batch) for batch in batches], [500, 500, 1])


if __name__ == "__main__":
    unittest.main()
