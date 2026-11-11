package com.opay.occ.mcp.businessdiagnostic.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Parsed {@code logDiagnostic} configuration section.
 *
 * <p>Keeps the default environment, the log table name, the service alias map
 * (for example {@code api -> whatsapp-crm-api}) and the environment definitions.</p>
 */
public final class LogConfig {

    public static final String DEFAULT_LOG_TABLE = "test_log";

    /** Environment names containing this fragment are refused as production. */
    public static final String PRODUCTION_NAME_FRAGMENT = "prod";

    private final String defaultEnvironment;
    private final String logTable;
    private final Map<String, String> services;
    private final Map<String, LogEnv> environments;
    private final Set<String> blockedEnvironments;

    private LogConfig(String defaultEnvironment, String logTable,
                      Map<String, String> services, Map<String, LogEnv> environments,
                      Set<String> blockedEnvironments) {
        this.defaultEnvironment = defaultEnvironment;
        this.logTable = logTable;
        this.services = Collections.unmodifiableMap(new LinkedHashMap<>(services));
        this.environments = Collections.unmodifiableMap(new LinkedHashMap<>(environments));
        this.blockedEnvironments = Collections.unmodifiableSet(new LinkedHashSet<>(blockedEnvironments));
    }

    public static LogConfig empty() {
        return new LogConfig(null, DEFAULT_LOG_TABLE,
                Collections.<String, String>emptyMap(), Collections.<String, LogEnv>emptyMap(),
                Collections.<String>emptySet());
    }

    public static LogConfig of(String defaultEnvironment, String logTable,
                               Map<String, String> services, Map<String, LogEnv> environments) {
        return of(defaultEnvironment, logTable, services, environments, Collections.<String>emptySet());
    }

    public static LogConfig of(String defaultEnvironment, String logTable,
                               Map<String, String> services, Map<String, LogEnv> environments,
                               Set<String> blockedEnvironments) {
        return new LogConfig(
                defaultEnvironment,
                (logTable == null || logTable.trim().isEmpty()) ? DEFAULT_LOG_TABLE : logTable.trim(),
                services == null ? Collections.<String, String>emptyMap() : services,
                environments == null ? Collections.<String, LogEnv>emptyMap() : environments,
                blockedEnvironments == null ? Collections.<String>emptySet() : blockedEnvironments);
    }

    /** Environment names that were configured but refused because they are production. */
    public Set<String> getBlockedEnvironments() {
        return blockedEnvironments;
    }

    public String getDefaultEnvironment() {
        return defaultEnvironment;
    }

    public String getLogTable() {
        return logTable;
    }

    public Map<String, String> getServices() {
        return services;
    }

    public Map<String, LogEnv> getEnvironments() {
        return environments;
    }

    /** Distinct full service names in declaration order. */
    public List<String> allServiceNames() {
        return new ArrayList<>(new LinkedHashSet<>(services.values()));
    }

    /**
     * Resolves a user supplied service value to concrete {@code service_name} values.
     * Blank input means "all configured services".
     */
    public List<String> resolveServices(String serviceOrAlias) {
        if (serviceOrAlias == null || serviceOrAlias.trim().isEmpty()) {
            List<String> all = allServiceNames();
            if (all.isEmpty()) {
                throw new IllegalArgumentException("No services configured in logDiagnostic.services");
            }
            return all;
        }
        String value = serviceOrAlias.trim();
        String alias = services.get(value.toLowerCase());
        if (alias != null) {
            return Collections.singletonList(alias);
        }
        if (services.containsValue(value)) {
            return Collections.singletonList(value);
        }
        throw new IllegalArgumentException("Unknown service: " + value + ". Available aliases: "
                + services.keySet() + " (full names: " + allServiceNames() + ")");
    }

    /** Resolves an environment by name, falling back to the default or the single configured one. */
    public LogEnv requireEnvironment(String name) {
        if (environments.isEmpty() && blockedEnvironments.isEmpty()) {
            throw new IllegalArgumentException(
                    "No log diagnostic environment configured; add a logDiagnostic section to profiles.json");
        }
        String target = name;
        if (target == null || target.trim().isEmpty()) {
            target = defaultEnvironment;
        }
        if (target != null && !target.trim().isEmpty() && isBlocked(target.trim())) {
            throw productionNotAllowed(target.trim());
        }
        if (target == null || target.trim().isEmpty()) {
            if (environments.size() == 1) {
                return enforceTestEnvironment(environments.values().iterator().next());
            }
            throw new IllegalArgumentException("Environment is required; available: " + environments.keySet());
        }
        LogEnv env = environments.get(target.trim());
        if (env == null) {
            throw new IllegalArgumentException("Unknown environment: " + target + "; available: " + environments.keySet());
        }
        return enforceTestEnvironment(env);
    }

    /** True when the environment name looks like a production environment. */
    public static boolean isProductionName(String name) {
        return name != null && name.toLowerCase().contains(PRODUCTION_NAME_FRAGMENT);
    }

    private boolean isBlocked(String name) {
        for (String blocked : blockedEnvironments) {
            if (blocked.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Refuses production environments; there is no override.
     *
     * <p>These diagnostics use real credentials and return unmasked content, so they are
     * limited to test environments. Production incidents must be investigated with the
     * production tooling instead.</p>
     */
    private static LogEnv enforceTestEnvironment(LogEnv env) {
        if (isProductionName(env.getName())) {
            throw productionNotAllowed(env.getName());
        }
        return env;
    }

    private static IllegalArgumentException productionNotAllowed(String name) {
        return new IllegalArgumentException("Production environment is not allowed: " + name
                + ". These diagnostics are restricted to test environments;"
                + " investigate production incidents with the production tooling instead.");
    }
}
