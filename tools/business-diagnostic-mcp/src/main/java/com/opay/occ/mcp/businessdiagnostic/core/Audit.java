package com.opay.occ.mcp.businessdiagnostic.core;

import java.util.Map;

/**
 * Minimal audit logger for diagnostic tool calls.
 *
 * <p>Logs are written to stderr so stdout remains reserved for MCP JSON-RPC.</p>
 */
public final class Audit {
    private Audit() {
    }

    public static void success(String tool, Map<String, Object> result, long elapsedMs) {
        String profile = stringOrNull(result == null ? null : result.get("profile"));
        String target = target(result);
        String rowCount = rowCount(result);
        System.err.println(String.format(
                "tool=%s profile=%s target=%s rows=%s elapsedMs=%d status=success",
                tool, profile, target, rowCount, elapsedMs
        ));
    }

    public static void failure(String tool, Exception exception, long elapsedMs) {
        String message = exception == null || exception.getMessage() == null
                ? "unknown error"
                : exception.getMessage().replace('\n', ' ');
        System.err.println(String.format(
                "tool=%s elapsedMs=%d status=failed error=%s",
                tool, elapsedMs, message
        ));
    }

    private static String target(Map<String, Object> result) {
        if (result == null) {
            return "-";
        }
        if (result.containsKey("table")) {
            return stringOrNull(result.get("table"));
        }
        if (result.containsKey("collection")) {
            return stringOrNull(result.get("collection"));
        }
        return "-";
    }

    private static String rowCount(Map<String, Object> result) {
        if (result == null) {
            return "-";
        }
        Object rows = result.get("rows");
        if (rows instanceof java.util.Collection) {
            return String.valueOf(((java.util.Collection<?>) rows).size());
        }
        if (result.containsKey("count")) {
            return stringOrNull(result.get("count"));
        }
        return "-";
    }

    private static String stringOrNull(Object value) {
        return value == null ? "-" : value.toString();
    }
}
