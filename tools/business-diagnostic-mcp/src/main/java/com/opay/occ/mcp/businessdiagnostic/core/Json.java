package com.opay.occ.mcp.businessdiagnostic.core;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * JSON helper for the stdio MCP transport.
 */
public final class Json {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Json() {
    }

    public static Map<String, Object> readObject(String value) {
        try {
            return MAPPER.readValue(value, LinkedHashMap.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid JSON object", e);
        }
    }

    public static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize JSON", e);
        }
    }
}
