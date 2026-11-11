package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.tools.ToolRegistry;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ToolRegistryTest {
    @Test
    void shouldExposeReadonlyDiagnosticTools() {
        List<Map<String, Object>> tools = ToolRegistry.listTools();
        assertThat(tools)
                .extracting(tool -> tool.get("name"))
                .containsExactly(
                        "list_profiles", "get_schema", "query_mysql", "count_mysql", "explain_mysql",
                        "query_mongo", "count_mongo", "explain_mongo",
                        "list_log_environments", "get_apollo_configs", "query_logs"
                );
    }

    @Test
    void shouldExposeLogQueryTools() {
        java.util.List<java.util.Map<String, Object>> tools = ToolRegistry.listTools();
        java.util.List<String> names = new java.util.ArrayList<>();
        for (java.util.Map<String, Object> tool : tools) {
            names.add(String.valueOf(tool.get("name")));
        }
        assertThat(names).contains("list_log_environments", "query_logs");
    }

    @Test
    @SuppressWarnings("unchecked")
    void queryLogsSchemaShouldRequireNothingButExposeKeywordAndTraceId() {
        java.util.Map<String, Object> schema = null;
        for (java.util.Map<String, Object> tool : ToolRegistry.listTools()) {
            if ("query_logs".equals(tool.get("name"))) {
                schema = (java.util.Map<String, Object>) tool.get("inputSchema");
            }
        }
        assertThat(schema).isNotNull();
        java.util.Map<String, Object> properties = (java.util.Map<String, Object>) schema.get("properties");
        assertThat(properties).containsKeys("env", "service", "traceId", "keyword", "logLevel",
                "timeStart", "timeEnd", "limit", "order");
        assertThat((java.util.List<String>) schema.get("required")).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void mysqlWhereAndOrderByShouldBeDeclaredAsArraysOfObjects() {
        java.util.Map<String, Object> schema = null;
        for (java.util.Map<String, Object> tool : ToolRegistry.listTools()) {
            if ("query_mysql".equals(tool.get("name"))) {
                schema = (java.util.Map<String, Object>) tool.get("inputSchema");
            }
        }
        assertThat(schema).isNotNull();
        java.util.Map<String, Object> properties = (java.util.Map<String, Object>) schema.get("properties");
        for (String name : new String[]{"where", "orderBy"}) {
            java.util.Map<String, Object> declared = (java.util.Map<String, Object>) properties.get(name);
            java.util.Map<String, Object> items = (java.util.Map<String, Object>) declared.get("items");
            assertThat(items).as(name).isNotNull();
            assertThat(items.get("type")).as(name).isEqualTo("object");
        }
    }
}
