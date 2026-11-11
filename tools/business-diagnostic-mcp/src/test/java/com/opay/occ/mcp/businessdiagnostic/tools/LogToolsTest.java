package com.opay.occ.mcp.businessdiagnostic.tools;

import org.junit.jupiter.api.Test;

import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LogToolsTest {

    private static final long NOW = 1_760_000_000_000L; // fixed reference instant: 2025-10-09T08:53:20Z
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
    private static final ZoneId UTC = ZoneId.of("UTC");

    @Test
    void shouldDefaultToLastTwentyMinutes() {
        long[] window = LogTools.resolveTimeWindow(null, null, NOW);
        assertThat(window[0]).isEqualTo(NOW - 20L * 60L * 1000L);
        assertThat(window[1]).isEqualTo(NOW);
    }

    @Test
    void shouldRespectExplicitWindow() {
        long[] window = LogTools.resolveTimeWindow(NOW - 3600_000L, NOW - 1800_000L, NOW);
        assertThat(window[0]).isEqualTo(NOW - 3600_000L);
        assertThat(window[1]).isEqualTo(NOW - 1800_000L);
    }

    @Test
    void shouldRejectInvertedWindow() {
        assertThatThrownBy(() -> LogTools.resolveTimeWindow(NOW, NOW - 1000L, NOW))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("timeStart");
    }

    @Test
    void shouldBuildLogQueryWithInServicesAndLikeKeyword() {
        List<SqlBuilder.SqlQuery> queries = LogTools.buildQuery(
                "test_log",
                Arrays.asList("whatsapp-crm-api", "whatsapp-crm-mq"),
                null,
                "wm_test_chat_bot01",
                "ERROR",
                NOW - 20L * 60L * 1000L,
                NOW,
                200,
                "asc",
                SHANGHAI
        );

        assertThat(queries).hasSize(1);
        String sql = queries.get(0).getSql();
        assertThat(sql).startsWith("SELECT `id`,`service_name`,`pod`,`log_time`,`trace_id`,`log_level`,`content` FROM `test_log` WHERE ");
        assertThat(sql).contains("`service_name` IN (?,?)");
        assertThat(sql).contains("`log_level` = ?");
        assertThat(sql).contains("`content` LIKE ?");
        assertThat(sql).contains("`log_time` >= ?");
        assertThat(sql).contains("`log_time` <= ?");
        assertThat(sql).endsWith("ORDER BY `log_time` ASC LIMIT ? OFFSET ?");

        List<Object> params = queries.get(0).getParams();
        assertThat(params.get(0)).isEqualTo("whatsapp-crm-api");
        assertThat(params.get(1)).isEqualTo("whatsapp-crm-mq");
        assertThat(params.get(2)).isEqualTo("ERROR");
        assertThat(params.get(3)).isEqualTo("%wm_test_chat_bot01%");
        assertThat(params.get(4).toString()).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3}");
        assertThat(params.get(5).toString()).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3}");
        // Boundaries are rendered in the environment's log time zone.
        assertThat(params.get(5).toString()).isEqualTo("2025-10-09 16:53:20.000");
        assertThat(params.get(4).toString()).isEqualTo("2025-10-09 16:33:20.000");
        assertThat(params.get(6)).isEqualTo(201); // limit + 1 to detect hasMore
        assertThat(params.get(7)).isEqualTo(0);
    }

    @Test
    void shouldBuildTraceIdQueryWithoutKeyword() {
        List<SqlBuilder.SqlQuery> queries = LogTools.buildQuery(
                "test_log", Arrays.asList("whatsapp-crm-api"), "abc123", null, null,
                NOW - 1000L, NOW, 50, "desc", SHANGHAI);
        String sql = queries.get(0).getSql();
        assertThat(sql).contains("`trace_id` = ?");
        assertThat(sql).doesNotContain("`content` LIKE ?");
        assertThat(sql).endsWith("ORDER BY `log_time` DESC LIMIT ? OFFSET ?");
        assertThat(queries.get(0).getParams().get(1)).isEqualTo("abc123");
    }

    @Test
    void shouldRejectLimitAboveMaximum() {
        assertThatThrownBy(() -> LogTools.buildQuery(
                "test_log", Arrays.asList("whatsapp-crm-api"), "abc", null, null, 0L, 1L, 5000, "asc",
                SHANGHAI))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("limit");
    }

    @Test
    void shouldFormatBoundariesInConfiguredZone() {
        List<SqlBuilder.SqlQuery> queries = LogTools.buildQuery(
                "test_log", Arrays.asList("whatsapp-crm-api"), "abc", null, null,
                NOW, NOW, 10, "asc", UTC);
        List<Object> params = queries.get(0).getParams();
        assertThat(params.get(2).toString()).isEqualTo("2025-10-09 08:53:20.000");
        assertThat(params.get(3).toString()).isEqualTo("2025-10-09 08:53:20.000");
    }

    @Test
    void shouldRequireTraceIdOrKeyword() {
        assertThatThrownBy(() -> LogTools.query(
                com.opay.occ.mcp.businessdiagnostic.core.LogConfig.empty(),
                null, null, null, null, null, null, null, 200, "asc"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
