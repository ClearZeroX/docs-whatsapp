package com.opay.occ.mcp.businessdiagnostic.core;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Immutable log diagnostic environment: MySQL connection plus Apollo coordinates.
 *
 * <p>Secrets are never stored in the profile file; they are resolved from
 * environment variables at call time.</p>
 */
public final class LogEnv {

    /**
     * Time zone assumed for {@code log_time} column values when an environment does not
     * declare its own {@code logTimeZone}.
     */
    public static final String DEFAULT_LOG_TIME_ZONE = "Asia/Shanghai";

    private final String name;
    private final String mysqlHost;
    private final int mysqlPort;
    private final String mysqlDatabase;
    private final String mysqlUser;
    private final String mysqlPasswordEnv;
    private final String apolloAppId;
    private final String apolloMeta;
    private final List<String> apolloNamespaces;
    private final String apolloAccessKeyEnv;
    private final String logTimeZone;
    private final ZoneId logTimeZoneId;

    private LogEnv(Builder builder) {
        this.name = builder.name;
        this.mysqlHost = builder.mysqlHost;
        this.mysqlPort = builder.mysqlPort;
        this.mysqlDatabase = builder.mysqlDatabase;
        this.mysqlUser = builder.mysqlUser;
        this.mysqlPasswordEnv = builder.mysqlPasswordEnv;
        this.apolloAppId = builder.apolloAppId;
        this.apolloMeta = builder.apolloMeta;
        this.apolloNamespaces = Collections.unmodifiableList(new ArrayList<>(builder.apolloNamespaces));
        this.apolloAccessKeyEnv = builder.apolloAccessKeyEnv;
        this.logTimeZone = resolveZoneName(builder.logTimeZone);
        this.logTimeZoneId = resolveZoneId(this.logTimeZone);
    }

    private static String resolveZoneName(String configured) {
        return (configured == null || configured.trim().isEmpty())
                ? DEFAULT_LOG_TIME_ZONE : configured.trim();
    }

    private static ZoneId resolveZoneId(String zoneName) {
        try {
            return ZoneId.of(zoneName);
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("Invalid logTimeZone: " + zoneName, e);
        }
    }

    public String getName() {
        return name;
    }

    public String getMysqlHost() {
        return mysqlHost;
    }

    public int getMysqlPort() {
        return mysqlPort;
    }

    public String getMysqlDatabase() {
        return mysqlDatabase;
    }

    public String getMysqlUser() {
        return mysqlUser;
    }

    public String getMysqlPasswordEnv() {
        return mysqlPasswordEnv;
    }

    /** Resolves the MySQL password from its environment variable, or null when unset. */
    public String getMysqlPassword() {
        if (mysqlPasswordEnv == null || mysqlPasswordEnv.isEmpty()) {
            return null;
        }
        String value = System.getenv(mysqlPasswordEnv);
        return (value == null || value.isEmpty()) ? null : value;
    }

    public String getApolloAppId() {
        return apolloAppId;
    }

    public String getApolloMeta() {
        return apolloMeta;
    }

    public List<String> getApolloNamespaces() {
        return apolloNamespaces;
    }

    public String getApolloAccessKeyEnv() {
        return apolloAccessKeyEnv;
    }

    /**
     * Time zone in which the {@code log_time} column values are stored, for example
     * {@code UTC} or {@code Asia/Shanghai}. Query boundaries are formatted in this zone
     * and stored values are parsed with it.
     */
    public String getLogTimeZone() {
        return logTimeZone;
    }

    public ZoneId getLogTimeZoneId() {
        return logTimeZoneId;
    }

    /** Resolves the Apollo access key secret, or null when not configured or unset. */
    public String getApolloAccessKey() {
        if (apolloAccessKeyEnv == null || apolloAccessKeyEnv.isEmpty()) {
            return null;
        }
        String value = System.getenv(apolloAccessKeyEnv);
        return (value == null || value.isEmpty()) ? null : value;
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    public static final class Builder {
        private final String name;
        private String mysqlHost;
        private int mysqlPort = 3306;
        private String mysqlDatabase;
        private String mysqlUser;
        private String mysqlPasswordEnv;
        private String apolloAppId;
        private String apolloMeta;
        private List<String> apolloNamespaces = Collections.emptyList();
        private String apolloAccessKeyEnv;
        private String logTimeZone;

        private Builder(String name) {
            this.name = name;
        }

        public Builder mysql(String host, int port, String database, String user, String passwordEnv) {
            this.mysqlHost = host;
            this.mysqlPort = port;
            this.mysqlDatabase = database;
            this.mysqlUser = user;
            this.mysqlPasswordEnv = passwordEnv;
            return this;
        }

        /** Time zone of the log_time column; defaults to {@link #DEFAULT_LOG_TIME_ZONE}. */
        public Builder logTimeZone(String zoneName) {
            this.logTimeZone = zoneName;
            return this;
        }

        public Builder apollo(String appId, String meta, List<String> namespaces, String accessKeyEnv) {
            this.apolloAppId = appId;
            this.apolloMeta = meta;
            this.apolloNamespaces = namespaces == null ? Collections.<String>emptyList() : namespaces;
            this.apolloAccessKeyEnv = accessKeyEnv;
            return this;
        }

        public LogEnv build() {
            return new LogEnv(this);
        }
    }
}
