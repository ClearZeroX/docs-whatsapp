package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.tools.MongoBuilder;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

class MongoBuilderTest {
    @Test
    void shouldBuildFilterAndSort() {
        Map<String, Object> filter = new LinkedHashMap<>();
        filter.put("status", "FAILED");
        Map<String, Object> sort = new LinkedHashMap<>();
        sort.put("createTime", -1);

        assertThat(MongoBuilder.buildFilter(filter).get("status")).isEqualTo("FAILED");
        assertThat(MongoBuilder.buildSort(sort).getInteger("createTime")).isEqualTo(-1);
    }

    @Test
    void shouldDefaultSortToNewestFirstOnIdIndex() {
        assertThat(MongoBuilder.buildSortWithDefault(null).getInteger("_id")).isEqualTo(-1);
        assertThat(MongoBuilder.buildSortWithDefault(new LinkedHashMap<String, Object>())
                .getInteger("_id")).isEqualTo(-1);
    }

    @Test
    void shouldKeepExplicitSort() {
        Map<String, Object> sort = new LinkedHashMap<>();
        sort.put("send_time", -1);
        assertThat(MongoBuilder.buildSortWithDefault(sort).getInteger("send_time")).isEqualTo(-1);
        assertThat(MongoBuilder.buildSortWithDefault(sort)).doesNotContainKey("_id");
    }

    @Test
    void shouldRejectUnsupportedOperators() {
        Map<String, Object> filter = new LinkedHashMap<>();
        filter.put("$where", "return true");

        assertThatThrownBy(() -> MongoBuilder.buildFilter(filter))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported Mongo operator");
    }

    @Test
    void shouldRejectOversizedInArray() {
        List<Object> ids = new ArrayList<>();
        for (int i = 0; i < 501; i++) {
            ids.add(String.valueOf(i));
        }
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("$in", ids);
        Map<String, Object> filter = new LinkedHashMap<>();
        filter.put("_id", value);

        assertThatThrownBy(() -> MongoBuilder.buildFilter(filter))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("supports at most 500");
    }

    @Test
    void shouldRejectWriteStagesInFilters() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("$out", "copy");
        Map<String, Object> merge = new LinkedHashMap<>();
        merge.put("$merge", "copy");

        assertThatThrownBy(() -> MongoBuilder.buildFilter(out))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported Mongo operator");
        assertThatThrownBy(() -> MongoBuilder.buildFilter(merge))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported Mongo operator");
    }

    @Test
    void shouldAllowExplainCommandWithVerbosityButRejectWriteExplainPayload() {
        org.bson.Document find = new org.bson.Document("find", "message_record")
                .append("filter", new org.bson.Document("task_id", 30))
                .append("projection", new org.bson.Document("task_id", 1))
                .append("sort", new org.bson.Document("send_time", -1))
                .append("skip", 0)
                .append("limit", 1);
        org.bson.Document explain = new org.bson.Document("explain", find)
                .append("verbosity", "executionStats");

        assertThatCode(() -> MongoToolsTestAccess.requireReadOnlyExplain(explain)).doesNotThrowAnyException();

        org.bson.Document update = new org.bson.Document("explain", new org.bson.Document("update", "message_record"));
        assertThatThrownBy(() -> MongoToolsTestAccess.requireReadOnlyExplain(update))
                .isInstanceOf(IllegalStateException.class);
    }

    static final class MongoToolsTestAccess {
        static void requireReadOnlyExplain(org.bson.Document command) {
            try {
                java.lang.reflect.Method method = MongoTools.class.getDeclaredMethod("requireReadOnlyExplain", org.bson.Document.class);
                method.setAccessible(true);
                method.invoke(null, command);
            } catch (java.lang.reflect.InvocationTargetException exception) {
                Throwable cause = exception.getCause();
                if (cause instanceof RuntimeException) {
                    throw (RuntimeException) cause;
                }
                throw new RuntimeException(cause);
            } catch (ReflectiveOperationException exception) {
                throw new RuntimeException(exception);
            }
        }
    }
}
