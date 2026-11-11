package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.tools.SqlBuilder;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SqlBuilderTest {
    @Test
    void shouldBuildParameterizedSelect() {
        Map<String, Object> where = new LinkedHashMap<>();
        where.put("field", "status");
        where.put("op", "eq");
        where.put("value", "FAILED");

        Map<String, Object> order = new LinkedHashMap<>();
        order.put("field", "id");
        order.put("direction", "desc");

        List<SqlBuilder.SqlQuery> queries = SqlBuilder.buildSelect(
                "task", Arrays.asList("id", "status"), Collections.singletonList(where),
                Collections.singletonList(order), 100, 0
        );

        assertThat(queries).hasSize(1);
        assertThat(queries.get(0).getSql())
                .isEqualTo("SELECT `id`,`status` FROM `task` WHERE `status` = ? ORDER BY `id` DESC LIMIT ? OFFSET ?");
        assertThat(queries.get(0).getParams()).containsExactly("FAILED", 101, 0);
    }

    @Test
    void shouldSplitLargeInPredicateIntoBatches() {
        List<Object> ids = new ArrayList<>();
        for (int i = 0; i < 1001; i++) {
            ids.add(i);
        }
        Map<String, Object> where = new LinkedHashMap<>();
        where.put("field", "id");
        where.put("op", "in");
        where.put("value", ids);

        List<SqlBuilder.SqlQuery> queries = SqlBuilder.buildCount("task", Collections.singletonList(where));
        assertThat(queries).hasSize(3);
        assertThat(queries.get(0).getParams()).hasSize(500);
        assertThat(queries.get(1).getParams()).hasSize(500);
        assertThat(queries.get(2).getParams()).hasSize(1);
    }

    @Test
    void shouldRejectUnsafeIdentifiers() {
        Map<String, Object> where = new LinkedHashMap<>();
        where.put("field", "id; drop table users");
        where.put("op", "eq");
        where.put("value", 1);

        assertThatThrownBy(() -> SqlBuilder.buildCount("task", Collections.singletonList(where)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid where field");
    }

    @Test
    void shouldRejectOversizedNotInPredicate() {
        List<Object> ids = new ArrayList<>();
        for (int i = 0; i < 501; i++) {
            ids.add(i);
        }
        Map<String, Object> where = new LinkedHashMap<>();
        where.put("field", "id");
        where.put("op", "notIn");
        where.put("value", ids);

        assertThatThrownBy(() -> SqlBuilder.buildCount("task", Collections.singletonList(where)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("notIn does not support batching");
    }
}
