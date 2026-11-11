package com.opay.occ.mcp.businessdiagnostic.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Masks sensitive fields before rows are returned to MCP clients.
 */
public final class Masking {
    private static final String MASK = "***";

    private Masking() {
    }

    public static Map<String, Object> maskRow(Map<String, Object> row, Profile profile) {
        if (row == null) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            result.put(entry.getKey(), maskValue(entry.getKey(), entry.getValue(), profile));
        }
        return result;
    }

    public static Object maskValue(String field, Object value, Profile profile) {
        if (value == null) {
            return null;
        }
        if (profile != null && profile.isSensitiveField(field)) {
            return MASK;
        }
        if (value instanceof Map) {
            return maskMap((Map<String, Object>) value, profile);
        }
        if (value instanceof List) {
            return maskList((List<Object>) value, profile);
        }
        return value;
    }

    private static Map<String, Object> maskMap(Map<String, Object> value, Profile profile) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : value.entrySet()) {
            result.put(entry.getKey(), maskValue(entry.getKey(), entry.getValue(), profile));
        }
        return result;
    }

    private static List<Object> maskList(List<Object> value, Profile profile) {
        java.util.ArrayList<Object> result = new java.util.ArrayList<>();
        for (Object item : value) {
            result.add(maskValue(null, item, profile));
        }
        return result;
    }
}
