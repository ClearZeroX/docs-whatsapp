package com.opay.occ.mcp.businessdiagnostic.tools;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Builds safe, parameterized MySQL SELECT and COUNT statements.
 *
 * <p>The builder deliberately supports only a small condition algebra. It splits
 * large IN predicates into bounded batches and rejects anything that is not a
 * read-only SELECT.</p>
 */
public final class SqlBuilder {
    public static final int IN_BATCH_SIZE = 500;
    public static final int MAX_EXPANDED_BATCHES = 20;
    public static final int MAX_LIMIT = 1000;
    public static final int MAX_OFFSET = 10000;

    private static final Pattern IDENTIFIER = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
    private static final List<String> ALLOWED_OPERATORS = Arrays.asList(
            "eq", "ne", "gt", "gte", "lt", "lte", "like", "in", "notIn", "isNull", "isNotNull"
    );

    private SqlBuilder() {
    }

    public static List<SqlQuery> buildSelect(
            String table,
            List<String> columns,
            List<Map<String, Object>> where,
            List<Map<String, Object>> orderBy,
            int limit,
            int offset
    ) {
        validatePagination(limit, offset);
        validateTable(table);
        List<String> safeColumns = validateColumns(columns);
        List<Map<String, Object>> safeOrder = validateOrderBy(orderBy);
        List<List<Map<String, Object>>> batches = expandWhere(where);

        List<SqlQuery> queries = new ArrayList<>();
        int effectiveLimit = offset + limit + 1;
        for (List<Map<String, Object>> batch : batches) {
            StringBuilder sql = new StringBuilder("SELECT ");
            sql.append(safeColumns.isEmpty() ? "*" : joinQuoted(safeColumns));
            sql.append(" FROM `").append(table).append('`');

            List<Object> params = new ArrayList<>();
            appendWhere(sql, params, batch);
            appendOrderBy(sql, safeOrder);
            sql.append(" LIMIT ? OFFSET ?");
            params.add(effectiveLimit);
            params.add(0);
            queries.add(new SqlQuery(sql.toString(), params));
        }
        return queries;
    }

    public static List<SqlQuery> buildCount(String table, List<Map<String, Object>> where) {
        validateTable(table);
        List<List<Map<String, Object>>> batches = expandWhere(where);

        List<SqlQuery> queries = new ArrayList<>();
        for (List<Map<String, Object>> batch : batches) {
            StringBuilder sql = new StringBuilder("SELECT COUNT(*) AS `count` FROM `").append(table).append('`');
            List<Object> params = new ArrayList<>();
            appendWhere(sql, params, batch);
            queries.add(new SqlQuery(sql.toString(), params));
        }
        return queries;
    }

    public static List<SqlQuery> buildExplain(
            String table,
            List<String> columns,
            List<Map<String, Object>> where,
            List<Map<String, Object>> orderBy,
            int limit,
            int offset
    ) {
        List<SqlQuery> selects = buildSelect(table, columns, where, orderBy, limit, offset);
        List<SqlQuery> explains = new ArrayList<>();
        for (SqlQuery select : selects) {
            explains.add(new SqlQuery("EXPLAIN " + select.getSql(), select.getParams()));
        }
        return explains;
    }

    public static <T> List<List<T>> splitInValues(List<T> values, int batchSize) {
        if (batchSize <= 0) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        if (values == null || values.isEmpty()) {
            return Collections.emptyList();
        }
        List<List<T>> batches = new ArrayList<>();
        for (int i = 0; i < values.size(); i += batchSize) {
            int end = Math.min(i + batchSize, values.size());
            batches.add(new ArrayList<>(values.subList(i, end)));
        }
        return batches;
    }

    private static List<List<Map<String, Object>>> expandWhere(List<Map<String, Object>> where) {
        List<Map<String, Object>> safeWhere = validateWhere(where);
        List<List<Map<String, Object>>> expanded = new ArrayList<>();
        expanded.add(new ArrayList<Map<String, Object>>(safeWhere));

        for (int i = 0; i < safeWhere.size(); i++) {
            Map<String, Object> condition = safeWhere.get(i);
            String op = (String) condition.get("op");
            if (!"in".equals(op)) {
                continue;
            }

            List<Object> values = asInValues(condition.get("value"));
            if (values.size() <= IN_BATCH_SIZE) {
                continue;
            }

            List<List<Object>> batches = splitInValues(values, IN_BATCH_SIZE);
            List<List<Map<String, Object>>> next = new ArrayList<>();
            for (List<Map<String, Object>> current : expanded) {
                for (List<Object> batch : batches) {
                    List<Map<String, Object>> copy = new ArrayList<>(current);
                    Map<String, Object> replacement = new LinkedHashMap<>(condition);
                    replacement.put("value", batch);
                    copy.set(i, replacement);
                    next.add(copy);
                    if (next.size() > MAX_EXPANDED_BATCHES) {
                        throw new IllegalArgumentException(
                                "IN batching would create more than " + MAX_EXPANDED_BATCHES + " queries"
                        );
                    }
                }
            }
            expanded = next;
        }

        if (expanded.size() > MAX_EXPANDED_BATCHES) {
            throw new IllegalArgumentException(
                    "IN batching would create more than " + MAX_EXPANDED_BATCHES + " queries"
            );
        }
        return expanded;
    }

    private static List<Map<String, Object>> validateWhere(List<Map<String, Object>> where) {
        if (where == null) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> condition : where) {
            if (condition == null) {
                throw new IllegalArgumentException("where condition must not be null");
            }
            String field = stringOrNull(condition.get("field"));
            String op = stringOrNull(condition.get("op"));
            validateIdentifier(field, "where field");
            if (!ALLOWED_OPERATORS.contains(op)) {
                throw new IllegalArgumentException("Unsupported where operator: " + op);
            }

            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("field", field);
            safe.put("op", op);
            if ("in".equals(op) || "notIn".equals(op)) {
                List<Object> values = asInValues(condition.get("value"));
                if ("notIn".equals(op) && values.size() > IN_BATCH_SIZE) {
                    throw new IllegalArgumentException("notIn does not support batching; reduce the value count");
                }
                if (values.isEmpty()) {
                    throw new IllegalArgumentException(op + " requires at least one value");
                }
                safe.put("value", values);
            } else if ("like".equals(op)) {
                Object value = condition.get("value");
                if (!(value instanceof String)) {
                    throw new IllegalArgumentException("like value must be a string");
                }
                safe.put("value", value);
            } else if (!"isNull".equals(op) && !"isNotNull".equals(op)) {
                Object value = condition.get("value");
                if (value == null || !isSupportedScalar(value)) {
                    throw new IllegalArgumentException("Unsupported where value type");
                }
                safe.put("value", value);
            }
            result.add(safe);
        }
        return result;
    }

    private static void appendWhere(StringBuilder sql, List<Object> params, List<Map<String, Object>> where) {
        if (where.isEmpty()) {
            return;
        }
        sql.append(" WHERE ");
        for (int i = 0; i < where.size(); i++) {
            if (i > 0) {
                sql.append(" AND ");
            }
            Map<String, Object> condition = where.get(i);
            String field = (String) condition.get("field");
            String op = (String) condition.get("op");
            sql.append('`').append(field).append('`');
            if ("eq".equals(op)) {
                sql.append(" = ?");
                params.add(condition.get("value"));
            } else if ("ne".equals(op)) {
                sql.append(" <> ?");
                params.add(condition.get("value"));
            } else if ("gt".equals(op)) {
                sql.append(" > ?");
                params.add(condition.get("value"));
            } else if ("gte".equals(op)) {
                sql.append(" >= ?");
                params.add(condition.get("value"));
            } else if ("lt".equals(op)) {
                sql.append(" < ?");
                params.add(condition.get("value"));
            } else if ("lte".equals(op)) {
                sql.append(" <= ?");
                params.add(condition.get("value"));
            } else if ("like".equals(op)) {
                sql.append(" LIKE ?");
                params.add(condition.get("value"));
            } else if ("in".equals(op) || "notIn".equals(op)) {
                List<Object> values = asInValues(condition.get("value"));
                sql.append(" ").append("in".equals(op) ? "IN" : "NOT IN").append(" (");
                for (int j = 0; j < values.size(); j++) {
                    if (j > 0) {
                        sql.append(',');
                    }
                    sql.append('?');
                    params.add(values.get(j));
                }
                sql.append(')');
            } else if ("isNull".equals(op)) {
                sql.append(" IS NULL");
            } else if ("isNotNull".equals(op)) {
                sql.append(" IS NOT NULL");
            } else {
                throw new IllegalArgumentException("Unsupported where operator: " + op);
            }
        }
    }

    private static void appendOrderBy(StringBuilder sql, List<Map<String, Object>> orderBy) {
        if (orderBy == null || orderBy.isEmpty()) {
            return;
        }
        sql.append(" ORDER BY ");
        for (int i = 0; i < orderBy.size(); i++) {
            if (i > 0) {
                sql.append(", ");
            }
            Map<String, Object> order = orderBy.get(i);
            sql.append('`').append(order.get("field")).append('`');
            sql.append("asc".equalsIgnoreCase((String) order.get("direction")) ? " ASC" : " DESC");
        }
    }

    private static List<String> validateColumns(List<String> columns) {
        if (columns == null) {
            return Collections.emptyList();
        }
        List<String> result = new ArrayList<>();
        for (String column : columns) {
            validateIdentifier(column, "column");
            result.add(column);
        }
        return result;
    }

    private static List<Map<String, Object>> validateOrderBy(List<Map<String, Object>> orderBy) {
        if (orderBy == null) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> order : orderBy) {
            if (order == null) {
                throw new IllegalArgumentException("orderBy entry must not be null");
            }
            String field = stringOrNull(order.get("field"));
            validateIdentifier(field, "orderBy field");
            String direction = stringOrNull(order.get("direction"));
            if (!"asc".equalsIgnoreCase(direction) && !"desc".equalsIgnoreCase(direction)) {
                throw new IllegalArgumentException("orderBy direction must be asc or desc");
            }
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("field", field);
            safe.put("direction", direction.toLowerCase());
            result.add(safe);
        }
        return result;
    }

    private static void validatePagination(int limit, int offset) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        if (offset < 0 || offset > MAX_OFFSET) {
            throw new IllegalArgumentException("offset must be between 0 and " + MAX_OFFSET);
        }
    }

    private static void validateTable(String table) {
        validateIdentifier(table, "table");
    }

    private static void validateIdentifier(String value, String name) {
        if (value == null || !IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid " + name + ": " + value);
        }
    }

    private static String joinQuoted(Collection<String> values) {
        StringBuilder result = new StringBuilder();
        boolean first = true;
        for (String value : values) {
            if (!first) {
                result.append(',');
            }
            result.append('`').append(value).append('`');
            first = false;
        }
        return result.toString();
    }

    private static String stringOrNull(Object value) {
        return value == null ? null : value.toString();
    }

    private static boolean isSupportedScalar(Object value) {
        return value instanceof String || value instanceof Number || value instanceof Boolean;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asInValues(Object value) {
        if (!(value instanceof List)) {
            throw new IllegalArgumentException("in/notIn value must be an array");
        }
        List<Object> values = (List<Object>) value;
        for (Object item : values) {
            if (item == null || !isSupportedScalar(item)) {
                throw new IllegalArgumentException("in/notIn values must be strings, numbers, or booleans");
            }
        }
        return values;
    }

    public static final class SqlQuery {
        private final String sql;
        private final List<Object> params;

        public SqlQuery(String sql, List<Object> params) {
            this.sql = sql;
            this.params = Collections.unmodifiableList(new ArrayList<>(params));
        }

        public String getSql() {
            return sql;
        }

        public List<Object> getParams() {
            return params;
        }
    }
}
