package com.opay.occ.mcp.businessdiagnostic.core;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LogConfigTest {

    private LogConfig config() {
        Map<String, String> services = new LinkedHashMap<>();
        services.put("api", "whatsapp-crm-api");
        services.put("job", "whatsapp-crm-job");
        services.put("mq", "whatsapp-crm-mq");
        services.put("otp", "whatsapp-crm-otp");

        LogEnv env = LogEnv.builder("idn-test")
                .mysql("MOCK_HOST", 3306, "whatsapp_crm", "MOCK_USER", "PWD_ENV")
                .apollo("whatsapp-crm", "http://10.99.1.187:8080",
                        Arrays.asList("application", "llm.yml"), "KEY_ENV")
                .build();

        Map<String, LogEnv> environments = new LinkedHashMap<>();
        environments.put("idn-test", env);
        return LogConfig.of("idn-test", "test_log", services, environments);
    }

    @Test
    void shouldResolveAliasToFullServiceName() {
        assertThat(config().resolveServices("api")).containsExactly("whatsapp-crm-api");
        assertThat(config().resolveServices("JOB")).containsExactly("whatsapp-crm-job");
    }

    @Test
    void shouldAcceptFullServiceName() {
        assertThat(config().resolveServices("whatsapp-crm-mq")).containsExactly("whatsapp-crm-mq");
    }

    @Test
    void shouldReturnAllServicesWhenBlank() {
        assertThat(config().resolveServices(null))
                .containsExactly("whatsapp-crm-api", "whatsapp-crm-job", "whatsapp-crm-mq", "whatsapp-crm-otp");
        assertThat(config().resolveServices("  ")).hasSize(4);
    }

    @Test
    void shouldRejectUnknownServiceWithAliasHint() {
        assertThatThrownBy(() -> config().resolveServices("payment"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("payment")
                .hasMessageContaining("api");
    }

    @Test
    void shouldFallbackToSingleEnvironmentWhenDefaultMissing() {
        LogEnv env = config().getEnvironments().get("idn-test");
        Map<String, LogEnv> only = new LinkedHashMap<>();
        only.put("idn-test", env);
        LogConfig noDefault = LogConfig.of(null, "test_log", config().getServices(), only);
        assertThat(noDefault.requireEnvironment(null).getName()).isEqualTo("idn-test");
    }

    @Test
    void shouldRejectUnknownEnvironment() {
        assertThatThrownBy(() -> config().requireEnvironment("ng-em-test"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ng-em-test")
                .hasMessageContaining("idn-test");
    }

    @Test
    void emptyConfigShouldReportClearError() {
        assertThatThrownBy(() -> LogConfig.empty().requireEnvironment(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("logDiagnostic");
    }

    @Test
    void shouldRefuseProductionEnvironment() {
        Map<String, LogEnv> environments = new LinkedHashMap<>();
        environments.put("idn-test", config().getEnvironments().get("idn-test"));
        environments.put("idn-prod", LogEnv.builder("idn-prod")
                .mysql("host", 3306, "whatsapp_crm", "user", "PWD_ENV")
                .build());
        LogConfig withProd = LogConfig.of("idn-test", "test_log", config().getServices(), environments);

        assertThatThrownBy(() -> withProd.requireEnvironment("idn-prod"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Production environment is not allowed")
                .hasMessageContaining("test environments");
        // The guard also applies when the environment is only reached through the default.
        assertThatThrownBy(() -> LogConfig.of("idn-prod", "test_log", config().getServices(),
                java.util.Collections.singletonMap("idn-prod", LogEnv.builder("idn-prod")
                        .mysql("host", 3306, "whatsapp_crm", "user", "PWD_ENV").build()))
                .requireEnvironment(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Production environment is not allowed");
        // Test environments keep working next to a configured production environment.
        assertThat(withProd.requireEnvironment("idn-test").getName()).isEqualTo("idn-test");
    }

    @Test
    void shouldDetectProductionNames() {
        assertThat(LogConfig.isProductionName("idn-prod")).isTrue();
        assertThat(LogConfig.isProductionName("ng-opay-prod")).isTrue();
        assertThat(LogConfig.isProductionName("idn-test")).isFalse();
        assertThat(LogConfig.isProductionName(null)).isFalse();
    }
}
