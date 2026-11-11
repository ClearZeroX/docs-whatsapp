package com.opay.occ.mcp.businessdiagnostic.tools;

import com.opay.occ.mcp.businessdiagnostic.core.LogConfig;
import com.opay.occ.mcp.businessdiagnostic.core.LogEnv;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApolloToolsTest {

    @Test
    void shouldBuildOnlyReadOnlyApolloItemQueryForRequestedContext() {
        ApolloTools.QueryPlan plan = ApolloTools.buildItemQuery(
                "resource_lane_config",
                "whatsapp-crm",
                "application",
                "task.send.strategy",
                50
        );

        assertThat(plan.sql()).contains("SELECT").contains("FROM `resource_lane_config`");
        assertThat(plan.sql()).contains("`status` = 1");
        assertThat(plan.sql()).contains("`config_key` LIKE ?");
        assertThat(plan.sql()).contains("LIMIT ?");
        assertThat(plan.sql().toUpperCase()).doesNotContain("UPDATE `", "DELETE `", "INSERT `", "DROP ");
        assertThat(plan.parameters()).containsExactly("%task.send.strategy%", 50);
    }

    @Test
    void shouldRejectUnboundedApolloRead() {
        assertThatThrownBy(() -> ApolloTools.buildItemQuery(
                "resource_lane_config", "whatsapp-crm", null, null, 50))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("namespace or keyKeyword");
    }

    @Test
    void shouldReturnContextAndReadOnlyMetadata() {
        LogEnv env = LogEnv.builder("idn-test")
                .mysql("host", 3306, "whatsapp_crm", "user", "password")
                .apollo("whatsapp-crm", "https://config-ve-test.rupiahcepatweb.com", Arrays.asList("application"), null)
                .build();
        LogConfig config = LogConfig.of(
                "idn-test", "test_log", Collections.emptyMap(), Collections.singletonMap("idn-test", env), Collections.emptySet());

        Map<String, Object> result = ApolloTools.envelope(config.requireEnvironment("idn-test"), "application", "rocket", null, "database", "runtime config investigation");
        assertThat(result).containsEntry("environment", "idn-test")
                .containsEntry("source", "database")
                .containsEntry("readOnly", true)
                .containsEntry("namespace", "application")
                .containsEntry("keyKeyword", "rocket");
    }
}
