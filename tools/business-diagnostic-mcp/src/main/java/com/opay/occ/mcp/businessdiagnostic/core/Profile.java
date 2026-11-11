package com.opay.occ.mcp.businessdiagnostic.core;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.HashSet;

/**
 * Immutable data source profile.
 */
public final class Profile {
    public enum Type {
        MYSQL,
        MONGO
    }

    private final String name;
    private final Type type;
    private final String host;
    private final int port;
    private final String database;
    private final String user;
    private final String passwordEnv;
    private final String uriEnv;
    private final Set<String> blockedTables;
    private final Set<String> blockedCollections;
    private final Set<String> sensitiveFields;

    private Profile(Builder builder) {
        this.name = builder.name;
        this.type = builder.type;
        this.host = builder.host;
        this.port = builder.port;
        this.database = builder.database;
        this.user = builder.user;
        this.passwordEnv = builder.passwordEnv;
        this.uriEnv = builder.uriEnv;
        this.blockedTables = Collections.unmodifiableSet(new HashSet<>(builder.blockedTables));
        this.blockedCollections = Collections.unmodifiableSet(new HashSet<>(builder.blockedCollections));
        this.sensitiveFields = Collections.unmodifiableSet(new HashSet<>(builder.sensitiveFields));
    }

    public String getName() {
        return name;
    }

    public Type getType() {
        return type;
    }

    public String getHost() {
        return host;
    }

    public int getPort() {
        return port;
    }

    public String getDatabase() {
        return database;
    }

    public String getUser() {
        return user;
    }

    public String getPasswordEnv() {
        return passwordEnv;
    }

    public String getPassword() {
        if (passwordEnv == null || passwordEnv.isEmpty()) {
            return null;
        }
        return System.getenv(passwordEnv);
    }

    public String getUri() {
        if (uriEnv == null || uriEnv.isEmpty()) {
            return null;
        }
        return System.getenv(uriEnv);
    }

    /**
     * Table access is deny-by-exception: every table is readable unless explicitly
     * blocked in the profile.
     */
    public boolean isTableAllowed(String table) {
        return table != null && !blockedTables.contains(table);
    }

    /**
     * Collection access is deny-by-exception: every collection is readable unless
     * explicitly blocked in the profile.
     */
    public boolean isCollectionAllowed(String collection) {
        return collection != null && !blockedCollections.contains(collection);
    }

    public boolean isSensitiveField(String field) {
        return sensitiveFields.contains(field);
    }

    public Set<String> getBlockedTables() {
        return blockedTables;
    }

    public Set<String> getBlockedCollections() {
        return blockedCollections;
    }

    public Set<String> getSensitiveFields() {
        return sensitiveFields;
    }

    public static Builder builder(String name, Type type) {
        return new Builder(name, type);
    }

    public static final class Builder {
        private final String name;
        private final Type type;
        private String host;
        private int port;
        private String database;
        private String user;
        private String passwordEnv;
        private String uriEnv;
        private List<String> blockedTables = Collections.emptyList();
        private List<String> blockedCollections = Collections.emptyList();
        private List<String> sensitiveFields = Collections.emptyList();

        private Builder(String name, Type type) {
            this.name = name;
            this.type = type;
        }

        public Builder host(String host) {
            this.host = host;
            return this;
        }

        public Builder port(int port) {
            this.port = port;
            return this;
        }

        public Builder database(String database) {
            this.database = database;
            return this;
        }

        public Builder user(String user) {
            this.user = user;
            return this;
        }

        public Builder passwordEnv(String passwordEnv) {
            this.passwordEnv = passwordEnv;
            return this;
        }

        public Builder uriEnv(String uriEnv) {
            this.uriEnv = uriEnv;
            return this;
        }

        public Builder blockedTables(List<String> blockedTables) {
            this.blockedTables = blockedTables == null ? Collections.<String>emptyList() : blockedTables;
            return this;
        }

        public Builder blockedCollections(List<String> blockedCollections) {
            this.blockedCollections = blockedCollections == null ? Collections.<String>emptyList() : blockedCollections;
            return this;
        }

        public Builder sensitiveFields(List<String> sensitiveFields) {
            this.sensitiveFields = sensitiveFields == null ? Collections.<String>emptyList() : sensitiveFields;
            return this;
        }

        public Profile build() {
            return new Profile(this);
        }
    }
}
