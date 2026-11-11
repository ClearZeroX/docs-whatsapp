package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.core.ProfileStore;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * MCP tool definitions and dispatch metadata.
 */
public final class ToolRegistry {
    private ToolRegistry() {
    }

    public static List<Map<String, Object>> listTools() {
        List<Map<String, Object>> tools = new ArrayList<>();
        tools.add(tool(
                "list_profiles",
                "List configured diagnostic data source profiles.",
                objectSchema(Collections.<String, Object>emptyMap(), Collections.<String>emptyList())
        ));
        tools.add(tool(
                "get_schema",
                "Get MySQL table columns and indexes.",
                objectSchema(
                        props(
                                prop("profile", "string", "Profile name"),
                                prop("table", "string", "Table name")
                        ),
                        Arrays.asList("profile", "table")
                )
        ));
        tools.add(tool(
                "query_mysql",
                "Run a safe, read-only MySQL SELECT query with pagination and IN batching.",
                mysqlQuerySchema(true)
        ));
        tools.add(tool(
                "count_mysql",
                "Count MySQL rows for a safe, structured where clause.",
                objectSchema(
                        props(
                                prop("profile", "string", "Profile name"),
                                prop("table", "string", "Table name"),
                                arrayProp("where", "Structured where conditions; all conditions are ANDed",
                                        whereItemProperties(), Arrays.asList("field", "op"))
                        ),
                        Arrays.asList("profile", "table")
                )
        ));
        tools.add(tool(
                "explain_mysql",
                "Explain a safe, read-only MySQL SELECT query.",
                mysqlQuerySchema(false)
        ));
        tools.add(tool(
                "query_mongo",
                "Run a safe, read-only Mongo find query. Results are newest-first by default "
                        + "(sorted on the _id index, which is fast); pass sort to change it, but "
                        + "sorting on a non-indexed field scans the whole collection.",
                mongoQuerySchema()
        ));
        tools.add(tool(
                "count_mongo",
                "Count Mongo documents for a safe filter. An empty filter is answered from "
                        + "collection metadata (estimated, no scan).",
                objectSchema(
                        props(
                                prop("profile", "string", "Profile name"),
                                prop("collection", "string", "Collection name"),
                                prop("filter", "object", "Mongo filter object")
                        ),
                        Arrays.asList("profile", "collection")
                )
        ));
        tools.add(tool(
                "explain_mongo",
                "Explain a safe, read-only Mongo find query.",
                mongoQuerySchema()
        ));
        tools.add(tool(
                "list_log_environments",
                "List configured log diagnostic environments, the default environment, "
                        + "and service aliases (api/job/mq/otp) mapped to service_name values.",
                objectSchema(Collections.<String, Object>emptyMap(), Collections.<String>emptyList())
        ));
        tools.add(tool(
                "get_apollo_configs",
                "Read only the configuration evidence relevant to a test-environment investigation from the database mirror or logs. The caller must provide a bounded context and reason.",
                objectSchema(
                        props(
                                prop("env", "string", "Test log environment; defaults to the configured default"),
                                prop("namespace", "string", "Apollo namespace inferred from the code path"),
                                prop("keyKeyword", "string", "Relevant configuration key keyword inferred from the code path"),
                                stringArrayProp("configKeys", "Exact configuration keys inferred from the code path"),
                                prop("source", "string", "database, logs, or both"),
                                prop("reason", "string", "Why this configuration can affect the current investigation"),
                                prop("timeStart", "integer", "Log evidence start time in epoch milliseconds"),
                                prop("timeEnd", "integer", "Log evidence end time in epoch milliseconds"),
                                prop("limit", "integer", "Maximum rows to return, from 1 to 100")
                        ),
                        Arrays.asList("reason")
                )
        ));
        tools.add(tool(
                "query_logs",
                "Query test_log. Provide traceId, or keyword (matched against log content, "
                        + "for example a template name or phone number), or both. When service is "
                        + "omitted all four whatsapp-crm services are queried. When no time range is "
                        + "given the last 20 minutes are used. Returns matchedTraceIds so a keyword "
                        + "search can be followed by a traceId search.",
                objectSchema(
                        props(
                                prop("env", "string", "Log environment name; defaults to the configured default"),
                                prop("service", "string", "Service alias (api/job/mq/otp) or full service name; omit to query all services"),
                                prop("traceId", "string", "Exact trace id; required unless keyword is provided"),
                                prop("keyword", "string", "Substring matched against log content; required unless traceId is provided"),
                                prop("logLevel", "string", "Exact log level: DEBUG, INFO, WARN or ERROR"),
                                prop("timeStart", "integer", "Start time in epoch milliseconds; defaults to 20 minutes before timeEnd"),
                                prop("timeEnd", "integer", "End time in epoch milliseconds; defaults to now"),
                                prop("limit", "integer", "Maximum rows to return, 1 to 1000; defaults to 200"),
                                prop("order", "string", "log_time order: asc (default) or desc")
                        ),
                        Collections.<String>emptyList()
                )
        ));
        return tools;
    }

    public static Map<String, Object> call(String name, Map<String, Object> args, ProfileStore profiles) {
        return Tools.call(name, args == null ? Collections.<String, Object>emptyMap() : args, profiles);
    }

    private static Map<String, Object> mysqlQuerySchema(boolean includeCursor) {
        Map<String, Object> properties = props(
                prop("profile", "string", "Profile name"),
                prop("table", "string", "Table name"),
                stringArrayProp("columns", "Columns to select; empty means all columns"),
                arrayProp("where", "Structured where conditions; all conditions are ANDed",
                        whereItemProperties(), Arrays.asList("field", "op")),
                arrayProp("orderBy", "Order by clauses, e.g. [{\"field\":\"id\",\"direction\":\"desc\"}]",
                        orderByItemProperties(), Arrays.asList("field", "direction")),
                prop("limit", "integer", "Maximum rows to return, from 1 to 1000"),
                prop("offset", "integer", "Offset for pagination, from 0 to 10000")
        );
        if (includeCursor) {
            properties.put("cursor", schema("string", "Opaque keyset pagination cursor"));
        }
        return objectSchema(properties, Arrays.asList("profile", "table"));
    }

    private static Map<String, Object> mongoQuerySchema() {
        Map<String, Object> properties = props(
                prop("profile", "string", "Profile name"),
                prop("collection", "string", "Collection name"),
                prop("filter", "object", "Mongo filter object"),
                prop("projection", "object", "Mongo projection object"),
                prop("sort", "object", "Mongo sort object, e.g. {\"_id\":-1}; defaults to {\"_id\":-1} (newest first)"),
                prop("limit", "integer", "Maximum documents to return, from 1 to 1000"),
                prop("skip", "integer", "Number of documents to skip, from 0 to 10000")
        );
        return objectSchema(properties, Arrays.asList("profile", "collection"));
    }

    private static Map<String, Object> tool(String name, String description, Map<String, Object> inputSchema) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        result.put("description", description);
        result.put("inputSchema", inputSchema);
        return result;
    }

    private static Map<String, Object> objectSchema(Map<String, Object> properties, List<String> required) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "object");
        result.put("properties", properties);
        result.put("required", required);
        result.put("additionalProperties", false);
        return result;
    }

    private static Map<String, Object> schema(String type, String description) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", type);
        result.put("description", description);
        return result;
    }

    private static Map<String, Object> props(Map.Entry<String, Object>... entries) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : entries) {
            result.put(entry.getKey(), entry.getValue());
        }
        return result;
    }

    /** Properties of one {@code where} entry. */
    private static Map<String, Object> whereItemProperties() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("description", "Condition value; an array for in/notIn, omitted for isNull/isNotNull");
        return props(
                prop("field", "string", "Column name"),
                prop("op", "string", "One of: eq, ne, gt, gte, lt, lte, like, in, notIn, isNull, isNotNull"),
                new java.util.AbstractMap.SimpleEntry<String, Object>("value", value)
        );
    }

    /** Properties of one {@code orderBy} entry. */
    private static Map<String, Object> orderByItemProperties() {
        return props(
                prop("field", "string", "Column name"),
                prop("direction", "string", "asc or desc")
        );
    }

    private static Map.Entry<String, Object> arrayProp(String name, String description,
                                                       Map<String, Object> itemProperties,
                                                       List<String> itemRequired) {
        Map<String, Object> items = new LinkedHashMap<>();
        items.put("type", "object");
        items.put("properties", itemProperties);
        items.put("required", itemRequired);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "array");
        schema.put("description", description);
        schema.put("items", items);
        return new java.util.AbstractMap.SimpleEntry<>(name, schema);
    }

    private static Map.Entry<String, Object> stringArrayProp(String name, String description) {
        Map<String, Object> items = new LinkedHashMap<>();
        items.put("type", "string");
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "array");
        schema.put("description", description);
        schema.put("items", items);
        return new java.util.AbstractMap.SimpleEntry<>(name, schema);
    }

    private static Map.Entry<String, Object> prop(String name, String type, String description) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", type);
        schema.put("description", description);
        return new java.util.AbstractMap.SimpleEntry<>(name, schema);
    }
}
