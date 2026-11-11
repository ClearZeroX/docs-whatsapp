package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.core.Masking;
import com.opay.occ.mcp.businessdiagnostic.core.Json;
import com.opay.occ.mcp.businessdiagnostic.core.Profile;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only MySQL diagnostic operations.
 */
public final class MySqlTools {
    private static final int QUERY_TIMEOUT_SECONDS = 5;

    private MySqlTools() {
    }

    public static Map<String, Object> getSchema(Profile profile, String table) {
        requireNotBlockedTable(profile, table);
        try (Connection connection = openConnection(profile)) {
            List<Map<String, Object>> columns = queryInformationSchemaColumns(connection, profile, table);
            List<Map<String, Object>> indexes = queryInformationSchemaIndexes(connection, profile, table);
            Map<String, Object> result = envelope(profile, table);
            result.put("columns", columns);
            result.put("indexes", indexes);
            return result;
        } catch (SQLException e) {
            throw new IllegalStateException("MySQL schema query failed: " + e.getMessage(), e);
        }
    }

    public static Map<String, Object> query(
            Profile profile,
            String table,
            List<String> columns,
            List<Map<String, Object>> where,
            List<Map<String, Object>> orderBy,
            int limit,
            int offset,
            String cursor
    ) {
        requireNotBlockedTable(profile, table);
        List<Map<String, Object>> effectiveWhere = new ArrayList<>(where == null ? new ArrayList<Map<String, Object>>() : where);
        if (cursor != null && !cursor.trim().isEmpty()) {
            if (offset != 0) {
                throw new IllegalArgumentException("offset must be 0 when cursor pagination is used");
            }
            if (orderBy == null || orderBy.size() != 1) {
                throw new IllegalArgumentException("cursor pagination requires exactly one orderBy field");
            }
            Map<String, Object> cursorValues = decodeCursor(cursor);
            String field = (String) orderBy.get(0).get("field");
            Object value = cursorValues.get(field);
            String direction = (String) orderBy.get(0).get("direction");
            Map<String, Object> condition = new LinkedHashMap<>();
            condition.put("field", field);
            condition.put("op", "asc".equalsIgnoreCase(direction) ? "gt" : "lt");
            condition.put("value", value);
            effectiveWhere.add(condition);
        }

        List<SqlBuilder.SqlQuery> queries = SqlBuilder.buildSelect(table, columns, effectiveWhere, orderBy, limit, offset);
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Connection connection = openConnection(profile)) {
            for (SqlBuilder.SqlQuery query : queries) {
                rows.addAll(executeQuery(connection, query, profile));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("MySQL query failed: " + e.getMessage(), e);
        }

        sortRows(rows, orderBy);
        int from = Math.min(offset, rows.size());
        int to = Math.min(offset + limit, rows.size());
        List<Map<String, Object>> page = new ArrayList<>(rows.subList(from, to));
        boolean hasMore = rows.size() > offset + limit;
        String nextCursor = hasMore && !page.isEmpty() ? encodeCursor(page.get(page.size() - 1), orderBy) : null;

        Map<String, Object> result = envelope(profile, table);
        result.put("rows", page);
        result.put("limit", limit);
        result.put("offset", offset);
        result.put("hasMore", hasMore);
        result.put("nextCursor", nextCursor);
        result.put("queryCount", queries.size());
        return result;
    }

    public static Map<String, Object> count(Profile profile, String table, List<Map<String, Object>> where) {
        requireNotBlockedTable(profile, table);
        List<SqlBuilder.SqlQuery> queries = SqlBuilder.buildCount(table, where);
        long total = 0;
        try (Connection connection = openConnection(profile)) {
            for (SqlBuilder.SqlQuery query : queries) {
                try (PreparedStatement statement = JdbcSupport.prepareReadOnly(connection, query.getSql())) {
                    statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
                    bindParameters(statement, query.getParams());
                    try (ResultSet resultSet = statement.executeQuery()) {
                        if (!resultSet.next()) {
                            throw new IllegalStateException("COUNT query returned no rows");
                        }
                        total += resultSet.getLong(1);
                    }
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("MySQL count failed: " + e.getMessage(), e);
        }

        Map<String, Object> result = envelope(profile, table);
        result.put("count", total);
        result.put("queryCount", queries.size());
        return result;
    }

    public static Map<String, Object> explain(
            Profile profile,
            String table,
            List<String> columns,
            List<Map<String, Object>> where,
            List<Map<String, Object>> orderBy,
            int limit,
            int offset
    ) {
        requireNotBlockedTable(profile, table);
        List<SqlBuilder.SqlQuery> queries = SqlBuilder.buildExplain(table, columns, where, orderBy, limit, offset);
        List<Map<String, Object>> plans = new ArrayList<>();
        try (Connection connection = openConnection(profile)) {
            for (SqlBuilder.SqlQuery query : queries) {
                plans.addAll(executeQuery(connection, query, profile));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("MySQL explain failed: " + e.getMessage(), e);
        }

        Map<String, Object> result = envelope(profile, table);
        result.put("plans", plans);
        result.put("queryCount", queries.size());
        return result;
    }

    private static Connection openConnection(Profile profile) throws SQLException {
        String password = profile.getPassword();
        if (password == null || password.isEmpty()) {
            throw new IllegalStateException("Missing password environment variable: " + profile.getPasswordEnv());
        }
        return JdbcSupport.openReadOnly(profile.getHost(), profile.getPort(), profile.getDatabase(),
                profile.getUser(), password);
    }

    private static List<Map<String, Object>> executeQuery(
            Connection connection,
            SqlBuilder.SqlQuery query,
            Profile profile
    ) throws SQLException {
        try (PreparedStatement statement = JdbcSupport.prepareReadOnly(connection, query.getSql())) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            bindParameters(statement, query.getParams());
            try (ResultSet resultSet = statement.executeQuery()) {
                ResultSetMetaData metadata = resultSet.getMetaData();
                int columnCount = metadata.getColumnCount();
                List<Map<String, Object>> rows = new ArrayList<>();
                while (resultSet.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        String label = metadata.getColumnLabel(i);
                        Object value = resultSet.getObject(i);
                        row.put(label, value);
                    }
                    rows.add(Masking.maskRow(row, profile));
                }
                return rows;
            }
        }
    }

    private static void bindParameters(PreparedStatement statement, List<Object> params) throws SQLException {
        for (int i = 0; i < params.size(); i++) {
            statement.setObject(i + 1, params.get(i));
        }
    }

    private static List<Map<String, Object>> queryInformationSchemaColumns(
            Connection connection,
            Profile profile,
            String table
    ) throws SQLException {
        String sql = "SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, "
                + "CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, COLUMN_KEY, EXTRA "
                + "FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? "
                + "ORDER BY ORDINAL_POSITION";
        try (PreparedStatement statement = JdbcSupport.prepareReadOnly(connection, sql)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setString(1, profile.getDatabase());
            statement.setString(2, table);
            try (ResultSet resultSet = statement.executeQuery()) {
                return mapResultSet(resultSet, profile);
            }
        }
    }

    private static List<Map<String, Object>> queryInformationSchemaIndexes(
            Connection connection,
            Profile profile,
            String table
    ) throws SQLException {
        String sql = "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE "
                + "FROM information_schema.STATISTICS "
                + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? "
                + "ORDER BY INDEX_NAME, SEQ_IN_INDEX";
        try (PreparedStatement statement = JdbcSupport.prepareReadOnly(connection, sql)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setString(1, profile.getDatabase());
            statement.setString(2, table);
            try (ResultSet resultSet = statement.executeQuery()) {
                return mapResultSet(resultSet, profile);
            }
        }
    }

    private static List<Map<String, Object>> mapResultSet(ResultSet resultSet, Profile profile) throws SQLException {
        ResultSetMetaData metadata = resultSet.getMetaData();
        int columnCount = metadata.getColumnCount();
        List<Map<String, Object>> rows = new ArrayList<>();
        while (resultSet.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= columnCount; i++) {
                row.put(metadata.getColumnLabel(i), resultSet.getObject(i));
            }
            rows.add(Masking.maskRow(row, profile));
        }
        return rows;
    }

    private static void requireNotBlockedTable(Profile profile, String table) {
        if (!profile.isTableAllowed(table)) {
            throw new IllegalArgumentException("Table is blocked by profile: " + table);
        }
    }

    private static void sortRows(List<Map<String, Object>> rows, List<Map<String, Object>> orderBy) {
        if (orderBy == null || orderBy.isEmpty()) {
            return;
        }
        rows.sort(new Comparator<Map<String, Object>>() {
            @Override
            public int compare(Map<String, Object> left, Map<String, Object> right) {
                for (Map<String, Object> order : orderBy) {
                    String field = (String) order.get("field");
                    boolean ascending = "asc".equalsIgnoreCase((String) order.get("direction"));
                    int compared = compareValues(left.get(field), right.get(field));
                    if (compared != 0) {
                        return ascending ? compared : -compared;
                    }
                }
                return 0;
            }
        });
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static int compareValues(Object left, Object right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        if (left instanceof Comparable && right instanceof Comparable
                && left.getClass().equals(right.getClass())) {
            return ((Comparable) left).compareTo(right);
        }
        return String.valueOf(left).compareTo(String.valueOf(right));
    }

    private static String encodeCursor(Map<String, Object> row, List<Map<String, Object>> orderBy) {
        Map<String, Object> values = new LinkedHashMap<>();
        if (orderBy != null) {
            for (Map<String, Object> order : orderBy) {
                String field = (String) order.get("field");
                values.put(field, row.get(field));
            }
        }
        return Base64.getEncoder().encodeToString(Json.write(values).getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, Object> decodeCursor(String cursor) {
        try {
            byte[] decoded = Base64.getDecoder().decode(cursor);
            return Json.readObject(new String(decoded, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid cursor", e);
        }
    }

    private static Map<String, Object> envelope(Profile profile, String table) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("profile", profile.getName());
        result.put("table", table);
        return result;
    }
}
