import re
from dataclasses import dataclass
from decimal import Decimal

from config import IN_BATCH_SIZE, MAX_QUERY_LIMIT, MYSQL_BLOCKED_TABLES


IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
OPERATORS = {
    "eq": "=",
    "ne": "<>",
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
    "like": "LIKE",
}


@dataclass
class QueryPlan:
    sql: str
    params: list

    def rendered_sql(self):
        output = self.sql
        for value in self.params:
            output = output.replace("%s", _literal(value), 1)
        if "%s" in output:
            raise ValueError("query contains unbound parameters")
        return output


def _literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return "'" + text + "'"


def split_in_values(values, batch_size=IN_BATCH_SIZE):
    if not isinstance(values, list) or not values:
        raise ValueError("IN values must be a non-empty list")
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    return [values[index:index + batch_size] for index in range(0, len(values), batch_size)]


def _table_and_fields(request):
    table = request.get("table")
    if not isinstance(table, str) or not IDENTIFIER.match(table):
        raise ValueError("table identifier is invalid")
    if table in MYSQL_BLOCKED_TABLES:
        raise ValueError("table is blocked")
    # Field safety is enforced against the live schema supplied by the caller.
    if "schema" not in request:
        raise ValueError("schema is required")
    fields = set(request.get("schema") or [])
    return table, fields


def _field(field, allowed):
    if not isinstance(field, str) or not IDENTIFIER.match(field):
        raise ValueError("field identifier is invalid")
    if not allowed or field not in allowed:
        raise ValueError("field is not allowed")
    return "`" + field + "`"


def _where(where, allowed):
    fragments = []
    params = []
    for condition in where or []:
        field = _field(condition.get("field"), allowed)
        op = condition.get("op")
        if op in OPERATORS:
            fragments.append(field + " " + OPERATORS[op] + " %s")
            params.append(condition.get("value"))
        elif op in ("isNull", "isNotNull"):
            fragments.append(field + (" IS NULL" if op == "isNull" else " IS NOT NULL"))
        elif op in ("in", "notIn"):
            values = condition.get("value")
            if not isinstance(values, list) or not values:
                raise ValueError("IN values must be a non-empty list")
            placeholders = ", ".join(["%s"] * len(values))
            fragments.append(field + (" IN (" if op == "in" else " NOT IN (") + placeholders + ")")
            params.extend(values)
        else:
            raise ValueError("operator is not allowed")
    return (" WHERE " + " AND ".join(fragments)) if fragments else "", params


def _limit(request):
    value = int(request.get("limit", MAX_QUERY_LIMIT))
    if value < 1 or value > MAX_QUERY_LIMIT:
        raise ValueError("limit must be between 1 and 50")
    return value


def _order(request, allowed):
    order_by = request.get("orderBy") or []
    fragments = []
    for item in order_by:
        field = _field(item.get("field"), allowed)
        direction = str(item.get("direction", "asc")).lower()
        if direction not in ("asc", "desc"):
            raise ValueError("order direction is not allowed")
        fragments.append(field + " " + direction.upper())
    return (" ORDER BY " + ", ".join(fragments)) if fragments else ""


def _select(request):
    table, allowed = _table_and_fields(request)
    columns = request.get("columns") or ["*"]
    if columns == ["*"]:
        selected = "*"
    else:
        selected = ", ".join(_field(column, allowed) for column in columns)
    where_sql, params = _where(request.get("where"), allowed)
    order_sql = _order(request, allowed)
    cursor = request.get("cursor")
    if cursor is not None:
        order_by = request.get("orderBy") or []
        if len(order_by) != 1:
            raise ValueError("cursor requires exactly one orderBy field")
        cursor_field = _field(order_by[0].get("field"), allowed)
        cursor_operator = "<" if str(order_by[0].get("direction", "asc")).lower() == "desc" else ">"
        where_sql += (" AND " if where_sql else " WHERE ") + cursor_field + " " + cursor_operator + " %s"
        params.append(cursor)
    sql = "SELECT " + selected + " FROM `" + table + "`" + where_sql + order_sql + " LIMIT " + str(_limit(request))
    return QueryPlan(sql, params)


def build_select(request):
    return _select(request)


def build_count(request):
    table, allowed = _table_and_fields(request)
    where_sql, params = _where(request.get("where"), allowed)
    return QueryPlan("SELECT COUNT(*) AS `count` FROM `" + table + "`" + where_sql, params)


def build_explain(request):
    plan = _select(dict(request, limit=min(int(request.get("limit", MAX_QUERY_LIMIT)), MAX_QUERY_LIMIT)))
    return QueryPlan("EXPLAIN " + plan.sql, plan.params)

