package com.opay.occ.mcp.businessdiagnostic.tools;

import com.opay.occ.mcp.businessdiagnostic.core.LogConfig;
import com.opay.occ.mcp.businessdiagnostic.core.LogEnv;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Reads Apollo-related configuration evidence from the application database or logs.
 * Direct Apollo SDK access and Apollo write operations are intentionally unsupported.
 */
public final class ApolloTools {

    static final String CONFIG_TABLE = "resource_lane_config";
    private static final String SOURCE_DATABASE = "apollo-database-mirror";
    private static final String SOURCE_LOGS = "apollo-log-evidence";
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;
    private static final Pattern SECRET_FIELD = Pattern.compile(
            "(?i)(password|secret|token|access.?key|private.?key|credential|authorization)");

    private ApolloTools() {
    }

    public static Map<String, Object> getConfigs(LogConfig config, String env, String namespace,
                                                  String keyKeyword, List<String> configKeys,
                                                  String source, String reason,
                                                  Long timeStart, Long timeEnd, int limit) {
        if (isBlank(namespace) && isBlank(keyKeyword) && (configKeys == null || configKeys.isEmpty())) {
            throw new IllegalArgumentException("Apollo lookup requires namespace, keyKeyword, or configKeys from the investigation context");
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        String selectedSource = isBlank(source) ? "database" : source.trim().toLowerCase(Locale.ROOT);
        if (!Arrays.asList("database", "logs", "both").contains(selectedSource)) {
            throw new IllegalArgumentException("source must be database, logs, or both");
        }

        LogEnv logEnv = config.requireEnvironment(env);
        Map<String, Object> response = envelope(logEnv, namespace, keyKeyword, configKeys, selectedSource, reason);
        List<Map<String, Object>> databaseRows = Collections.emptyList();
        Map<String, Object> logEvidence = null;
        List<String> warnings = new ArrayList<>();

        if ("database".equals(selectedSource) || "both".equals(selectedSource)) {
            databaseRows = queryDatabase(logEnv, namespace, keyKeyword, configKeys, limit);
            response.put("databaseRows", databaseRows);
            if (databaseRows.isEmpty()) {
                warnings.add("No matching resource_lane_config row was found; this does not prove the value is absent from Apollo.");
            }
        }
        if ("logs".equals(selectedSource) || "both".equals(selectedSource)) {
            String keyword = !isBlank(keyKeyword) ? keyKeyword : firstKey(configKeys);
            if (isBlank(keyword)) {
                keyword = namespace;
            }
            logEvidence = LogTools.query(config, env, null, null, keyword, null, timeStart, timeEnd,
                    Math.min(limit, LogTools.MAX_LIMIT), "desc");
            response.put("logEvidence", redactLogEvidence(logEvidence));
        }
        response.put("warnings", warnings);
        response.put("itemCount", databaseRows.size());
        return response;
    }

    static QueryPlan buildItemQuery(String table, String appId, String namespace,
                                    String keyKeyword, int limit) {
        if (isBlank(namespace) && isBlank(keyKeyword)) {
            throw new IllegalArgumentException("Apollo lookup requires namespace or keyKeyword");
        }
        if (!CONFIG_TABLE.equals(table)) {
            throw new IllegalArgumentException("Apollo database table is fixed to " + CONFIG_TABLE);
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        String selector = !isBlank(keyKeyword) ? keyKeyword.trim() : namespace.trim();
        String sql = "SELECT `config_key`, `config_value`, `status`, `update_time` "
                + "FROM `resource_lane_config` WHERE `status` = 1 AND `config_key` LIKE ? "
                + "ORDER BY `update_time` DESC LIMIT ?";
        return new QueryPlan(sql, Arrays.<Object>asList("%" + selector + "%", limit));
    }

    static Map<String, Object> envelope(LogEnv env, String namespace, String keyKeyword,
                                        List<String> configKeys, String source, String reason) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("environment", env.getName());
        response.put("source", SOURCE_DATABASE.equals(source) ? SOURCE_DATABASE : source);
        response.put("readOnly", true);
        response.put("appId", env.getApolloAppId());
        response.put("namespace", namespace);
        response.put("keyKeyword", keyKeyword);
        response.put("configKeys", configKeys == null ? Collections.emptyList() : new ArrayList<>(configKeys));
        response.put("reason", reason);
        response.put("table", CONFIG_TABLE);
        return response;
    }

    private static List<Map<String, Object>> queryDatabase(LogEnv env, String namespace,
                                                            String keyKeyword, List<String> configKeys,
                                                            int limit) {
        String password = env.getMysqlPassword();
        if (password == null || password.isEmpty()) {
            throw new IllegalStateException("Missing password environment variable: " + env.getMysqlPasswordEnv());
        }
        QueryPlan plan = buildDatabaseQuery(namespace, keyKeyword, configKeys, limit);
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Connection connection = JdbcSupport.openReadOnly(env.getMysqlHost(), env.getMysqlPort(),
                env.getMysqlDatabase(), env.getMysqlUser(), password);
             PreparedStatement statement = JdbcSupport.prepareReadOnly(connection, plan.sql())) {
            for (int i = 0; i < plan.parameters().size(); i++) {
                statement.setObject(i + 1, plan.parameters().get(i));
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                ResultSetMetaData metadata = resultSet.getMetaData();
                while (resultSet.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= metadata.getColumnCount(); i++) {
                        String name = metadata.getColumnLabel(i);
                        row.put(name, maskConfigValue(name, resultSet.getObject(i)));
                    }
                    rows.add(row);
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Apollo database mirror query failed: " + e.getMessage(), e);
        }
        return rows;
    }

    private static QueryPlan buildDatabaseQuery(String namespace, String keyKeyword,
                                                List<String> configKeys, int limit) {
        if (configKeys != null && !configKeys.isEmpty()) {
            StringBuilder placeholders = new StringBuilder();
            List<Object> params = new ArrayList<>();
            for (String key : configKeys) {
                if (isBlank(key)) {
                    throw new IllegalArgumentException("configKeys must not contain blank values");
                }
                if (placeholders.length() > 0) {
                    placeholders.append(", ");
                }
                placeholders.append("?");
                params.add(key.trim());
            }
            params.add(limit);
            return new QueryPlan("SELECT `config_key`, `config_value`, `status`, `update_time` "
                    + "FROM `resource_lane_config` WHERE `status` = 1 AND `config_key` IN ("
                    + placeholders + ") ORDER BY `update_time` DESC LIMIT ?", params);
        }
        return buildItemQuery(CONFIG_TABLE, "whatsapp-crm", namespace, keyKeyword, limit);
    }

    private static Object maskConfigValue(String field, Object value) {
        if (value == null) {
            return null;
        }
        if (SECRET_FIELD.matcher(field == null ? "" : field).find()) {
            return "***";
        }
        if (!(value instanceof String)) {
            return value;
        }
        String text = (String) value;
        return SECRET_FIELD.matcher(text).find() ? maskSecretAssignments(text) : text;
    }

    private static String maskSecretAssignments(String text) {
        return text.replaceAll("(?i)(\\\"?(?:password|secret|token|access.?key|private.?key|credential|authorization)\\\"?\\s*[:=]\\s*\\\")([^\\\"]*)(\\\")", "$1***$3");
    }

    private static Map<String, Object> redactLogEvidence(Map<String, Object> evidence) {
        Map<String, Object> result = new LinkedHashMap<>(evidence);
        Object rows = result.get("rows");
        if (rows instanceof List) {
            List<Object> redacted = new ArrayList<>();
            for (Object row : (List<?>) rows) {
                if (row instanceof Map) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> entry : ((Map<?, ?>) row).entrySet()) {
                        item.put(String.valueOf(entry.getKey()), maskConfigValue(String.valueOf(entry.getKey()), entry.getValue()));
                    }
                    redacted.add(item);
                } else {
                    redacted.add(row);
                }
            }
            result.put("rows", redacted);
        }
        return result;
    }

    private static String firstKey(List<String> configKeys) {
        return configKeys == null || configKeys.isEmpty() ? null : configKeys.get(0);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    static final class QueryPlan {
        private final String sql;
        private final List<Object> parameters;

        QueryPlan(String sql, List<Object> parameters) {
            this.sql = sql;
            this.parameters = parameters;
        }

        String sql() {
            return sql;
        }

        List<Object> parameters() {
            return parameters;
        }
    }
}
