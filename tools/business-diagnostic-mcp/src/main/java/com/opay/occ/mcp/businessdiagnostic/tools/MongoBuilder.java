package com.opay.occ.mcp.businessdiagnostic.tools;

import org.bson.Document;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Validates and converts Mongo query request objects into BSON documents.
 */
public final class MongoBuilder {
    public static final int MAX_LIMIT = 1000;
    public static final int MAX_SKIP = 10000;
    public static final int MAX_IN_SIZE = 500;

    /**
     * Fallback sort field used when the caller does not specify one. Sorting backwards on
     * {@code _id} is served by the always-present _id index, so the server can stop as soon
     * as {@code limit} matches are found instead of scanning and in-memory sorting everything.
     */
    public static final String DEFAULT_SORT_FIELD = "_id";

    private MongoBuilder() {
    }

    public static Document buildFilter(Map<String, Object> filter) {
        if (filter == null) {
            return new Document();
        }
        validateTree(filter);
        return new Document(filter);
    }

    public static Document buildProjection(Map<String, Object> projection) {
        if (projection == null) {
            return new Document();
        }
        validateTree(projection);
        return new Document(projection);
    }

    public static Document buildSort(Map<String, Object> sort) {
        if (sort == null) {
            return new Document();
        }
        validateTree(sort);
        Document result = new Document();
        for (Map.Entry<String, Object> entry : sort.entrySet()) {
            Object value = entry.getValue();
            if (!(value instanceof Number)) {
                throw new IllegalArgumentException("sort values must be 1 or -1");
            }
            int direction = ((Number) value).intValue();
            if (direction != 1 && direction != -1) {
                throw new IllegalArgumentException("sort values must be 1 or -1");
            }
            result.put(entry.getKey(), direction);
        }
        return result;
    }

    /** Builds the sort clause, falling back to newest-first on the _id index. */
    public static Document buildSortWithDefault(Map<String, Object> sort) {
        Document result = buildSort(sort);
        if (result.isEmpty()) {
            result.put(DEFAULT_SORT_FIELD, -1);
        }
        return result;
    }

    public static void validatePagination(int limit, int skip) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        if (skip < 0 || skip > MAX_SKIP) {
            throw new IllegalArgumentException("skip must be between 0 and " + MAX_SKIP);
        }
    }

    @SuppressWarnings("unchecked")
    private static void validateTree(Object value) {
        if (value instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) value;
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                String key = entry.getKey();
                if (key == null || key.trim().isEmpty()) {
                    throw new IllegalArgumentException("Mongo object keys must not be empty");
                }
                if ("$where".equals(key) || "$function".equals(key) || "$accumulator".equals(key)
                        || "$out".equals(key) || "$merge".equals(key)) {
                    throw new IllegalArgumentException("Unsupported Mongo operator: " + key);
                }
                Object child = entry.getValue();
                if ("$in".equals(key) || "$nin".equals(key)) {
                    if (!(child instanceof Iterable)) {
                        throw new IllegalArgumentException(key + " must be an array");
                    }
                    int count = 0;
                    for (Object ignored : (Iterable<?>) child) {
                        count++;
                        if (count > MAX_IN_SIZE) {
                            throw new IllegalArgumentException(key + " supports at most " + MAX_IN_SIZE + " values");
                        }
                    }
                } else {
                    validateTree(child);
                }
            }
        } else if (value instanceof Iterable) {
            for (Object item : (Iterable<?>) value) {
                validateTree(item);
            }
        } else if (value != null
                && !(value instanceof String
                || value instanceof Number
                || value instanceof Boolean
                || value instanceof java.util.Date)) {
            throw new IllegalArgumentException("Unsupported Mongo filter value type");
        }
    }
}
