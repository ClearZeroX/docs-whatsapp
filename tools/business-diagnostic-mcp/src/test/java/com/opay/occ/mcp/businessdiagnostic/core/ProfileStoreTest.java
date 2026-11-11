package com.opay.occ.mcp.businessdiagnostic.core;
import com.opay.occ.mcp.businessdiagnostic.core.LogConfig;
import com.opay.occ.mcp.businessdiagnostic.core.Profile;
import com.opay.occ.mcp.businessdiagnostic.core.ProfileStore;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProfileStoreTest {
    @TempDir
    Path tempDir;

    @Test
    void shouldLoadMysqlAndMongoProfiles() throws Exception {
        Path file = tempDir.resolve("profiles.json");
        String json = "{\n"
                + "  \"profiles\": {\n"
                + "    \"mysql-test\": {\n"
                + "      \"type\": \"mysql\",\n"
                + "      \"host\": \"127.0.0.1\",\n"
                + "      \"port\": 3307,\n"
                + "      \"database\": \"crm\",\n"
                + "      \"user\": \"readonly\",\n"
                + "      \"passwordEnv\": \"MYSQL_TEST_PASSWORD\",\n"
                + "      \"blockedTables\": [\"user\"]\n"
                + "    },\n"
                + "    \"mongo-test\": {\n"
                + "      \"type\": \"mongo\",\n"
                + "      \"uriEnv\": \"MONGO_TEST_URI\",\n"
                + "      \"database\": \"metrics\",\n"
                + "      \"blockedCollections\": [\"internal_audit\"]\n"
                + "    }\n"
                + "  }\n"
                + "}";
        java.nio.file.Files.write(file, json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        ProfileStore store = ProfileStore.load(file);
        Map<String, Profile> profiles = store.getProfiles();

        assertThat(profiles).containsKeys("mysql-test", "mongo-test");
        assertThat(store.require("mysql-test").isTableAllowed("task")).isTrue();
        assertThat(store.require("mysql-test").isTableAllowed("user")).isFalse();
        assertThat(store.require("mysql-test").isTableAllowed("task_sub")).isTrue();
        assertThat(store.require("mongo-test").isCollectionAllowed("task_metrics")).isTrue();
        assertThat(store.require("mongo-test").isCollectionAllowed("internal_audit")).isFalse();
        assertThat(store.require("mysql-test").isSensitiveField("password")).isTrue();
    }

    @Test
    void shouldAllowEveryTableAndCollectionWhenNoBlacklistIsConfigured() throws Exception {
        Path file = tempDir.resolve("profiles-default-open.json");
        String json = "{\n"
                + "  \"profiles\": {\n"
                + "    \"mysql-open\": {\n"
                + "      \"type\": \"mysql\", \"host\": \"127.0.0.1\", \"port\": 3306,\n"
                + "      \"database\": \"crm\", \"user\": \"readonly\", \"passwordEnv\": \"P\"\n"
                + "    },\n"
                + "    \"mongo-open\": {\n"
                + "      \"type\": \"mongo\", \"uriEnv\": \"U\", \"database\": \"crm\"\n"
                + "    }\n"
                + "  }\n"
                + "}";
        java.nio.file.Files.write(file, json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        ProfileStore store = ProfileStore.load(file);

        assertThat(store.require("mysql-open").isTableAllowed("category")).isTrue();
        assertThat(store.require("mysql-open").isTableAllowed("any_unlisted_table")).isTrue();
        assertThat(store.require("mongo-open").isCollectionAllowed("any_unlisted_collection")).isTrue();
        assertThat(store.require("mongo-open").isCollectionAllowed("internal_audit")).isTrue();
        assertThat(store.require("mysql-open").getBlockedTables()).isEmpty();
        assertThat(store.require("mongo-open").getBlockedCollections()).isEmpty();
        assertThat(store.require("mysql-open").isTableAllowed(null)).isFalse();
    }

    @Test
    void shouldRejectLegacyAllowlistConfiguration() throws Exception {
        Path file = tempDir.resolve("profiles-legacy-allowlist.json");
        String json = "{\n"
                + "  \"profiles\": {\n"
                + "    \"mysql-old\": {\n"
                + "      \"type\": \"mysql\", \"host\": \"127.0.0.1\", \"port\": 3306,\n"
                + "      \"database\": \"crm\", \"user\": \"readonly\", \"passwordEnv\": \"P\",\n"
                + "      \"allowedTables\": [\"task\"]\n"
                + "    }\n"
                + "  }\n"
                + "}";
        java.nio.file.Files.write(file, json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        assertThatThrownBy(() -> ProfileStore.load(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("blockedTables/blockedCollections");
    }

    @Test
    void shouldRejectInvalidJson() {
        Path file = Paths.get("/not-exists/profiles.json");
        assertThatThrownBy(() -> ProfileStore.load(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not exist");
    }

    @Test
    void shouldParseLogDiagnosticSection() throws Exception {
        Path file = tempDir.resolve("profiles-with-log.json");
        String json = "{\n"
                + "  \"profiles\": {}, \n"
                + "  \"logDiagnostic\": {\n"
                + "    \"defaultEnvironment\": \"idn-test\",\n"
                + "    \"logTable\": \"test_log\",\n"
                + "    \"services\": {\"api\": \"whatsapp-crm-api\", \"job\": \"whatsapp-crm-job\"},\n"
                + "    \"environments\": {\n"
                + "      \"idn-test\": {\n"
                + "        \"mysql\": {\n"
                + "          \"host\": \"MOCK_IDN_TEST_HOST\", \"port\": 3306, \"database\": \"whatsapp_crm\",\n"
                + "          \"user\": \"MOCK_READONLY_USER\",\n"
                + "          \"passwordEnv\": \"LOG_DIAGNOSTIC_IDN_TEST_MYSQL_PASSWORD\"\n"
                + "        },\n"
                + "        \"logTimeZone\": \"UTC\",\n"
                + "        \"apollo\": {\n"
                + "          \"appId\": \"whatsapp-crm\", \"meta\": \"http://10.99.1.187:8080\",\n"
                + "          \"namespaces\": [\"application\", \"llm.yml\"],\n"
                + "          \"accessKeyEnv\": \"LOG_DIAGNOSTIC_IDN_TEST_APOLLO_ACCESS_KEY\"\n"
                + "        }\n"
                + "      }\n"
                + "    }\n"
                + "  }\n"
                + "}";
        java.nio.file.Files.write(file, json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        ProfileStore store = ProfileStore.load(file);
        LogConfig logConfig = store.getLogConfig();

        assertThat(logConfig.getDefaultEnvironment()).isEqualTo("idn-test");
        assertThat(logConfig.getLogTable()).isEqualTo("test_log");
        assertThat(logConfig.resolveServices("api")).containsExactly("whatsapp-crm-api");
        assertThat(logConfig.requireEnvironment(null).getApolloNamespaces())
                .containsExactly("application", "llm.yml");
        assertThat(logConfig.requireEnvironment("idn-test").getMysqlUser()).isEqualTo("MOCK_READONLY_USER");
        assertThat(logConfig.requireEnvironment("idn-test").getLogTimeZone()).isEqualTo("UTC");
        assertThat(logConfig.requireEnvironment("idn-test").getLogTimeZoneId())
                .isEqualTo(java.time.ZoneId.of("UTC"));
    }

    @Test
    void shouldDefaultLogTimeZoneWhenAbsent() {
        LogEnv env = LogEnv.builder("idn-test")
                .mysql("h", 3306, "d", "u", "P")
                .build();
        assertThat(env.getLogTimeZone()).isEqualTo(LogEnv.DEFAULT_LOG_TIME_ZONE);
        assertThat(env.getLogTimeZoneId()).isEqualTo(java.time.ZoneId.of(LogEnv.DEFAULT_LOG_TIME_ZONE));
    }

    @Test
    void shouldRejectInvalidLogTimeZone() {
        assertThatThrownBy(() -> LogEnv.builder("idn-test")
                .mysql("h", 3306, "d", "u", "P")
                .logTimeZone("Not/AZone")
                .build())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid logTimeZone");
    }

    @Test
    void shouldReturnEmptyLogConfigWhenSectionMissing() throws Exception {
        Path file = tempDir.resolve("profiles-no-log.json");
        java.nio.file.Files.write(file, "{\"profiles\": {}}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        ProfileStore store = ProfileStore.load(file);
        assertThat(store.getLogConfig().getEnvironments()).isEmpty();
        assertThat(store.getLogConfig().getLogTable()).isEqualTo("test_log");
    }

    @Test
    void shouldNeverLoadProductionLogEnvironment() throws Exception {
        Path file = tempDir.resolve("profiles-prod-log.json");
        String json = "{\n"
                + "  \"logDiagnostic\": {\n"
                + "    \"defaultEnvironment\": \"idn-test\",\n"
                + "    \"environments\": {\n"
                + "      \"idn-test\": {\n"
                + "        \"mysql\": {\"host\": \"h\", \"database\": \"d\", \"user\": \"u\", \"passwordEnv\": \"P\"}\n"
                + "      },\n"
                + "      \"idn-prod\": {\n"
                + "        \"mysql\": {\"host\": \"h\", \"database\": \"d\", \"user\": \"u\", \"passwordEnv\": \"P\"}\n"
                + "      }\n"
                + "    }\n"
                + "  }\n"
                + "}";
        java.nio.file.Files.write(file, json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        LogConfig logConfig = ProfileStore.load(file).getLogConfig();
        assertThat(logConfig.getEnvironments()).containsOnlyKeys("idn-test");
        assertThat(logConfig.getBlockedEnvironments()).containsExactly("idn-prod");
        assertThatThrownBy(() -> logConfig.requireEnvironment("idn-prod"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Production environment is not allowed");
    }
}
