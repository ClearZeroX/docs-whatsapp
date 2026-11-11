package com.opay.occ.mcp.businessdiagnostic.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads and validates diagnostic data source profiles.
 */
public final class ProfileStore {
    private static final String CONFIG_ENV = "BUSINESS_DIAGNOSTIC_CONFIG";
    private static final List<String> DEFAULT_SENSITIVE_FIELDS = Arrays.asList(
            "password", "secret", "token", "phone", "mobile", "email", "id_card", "bank_card"
    );

    private final Map<String, Profile> profiles;
    private final LogConfig logConfig;

    private ProfileStore(Map<String, Profile> profiles, LogConfig logConfig) {
        this.profiles = Collections.unmodifiableMap(profiles);
        this.logConfig = logConfig;
    }

    public LogConfig getLogConfig() {
        return logConfig;
    }

    public static ProfileStore loadDefault() {
        Path path = defaultConfigPath();
        if (!Files.exists(path)) {
            return new ProfileStore(Collections.<String, Profile>emptyMap(), LogConfig.empty());
        }
        return load(path);
    }

    public static ProfileStore load(Path path) {
        if (path == null || !Files.exists(path) || !Files.isRegularFile(path)) {
            throw new IllegalArgumentException("Profile config file does not exist: " + path);
        }

        ObjectMapper mapper = new ObjectMapper();
        JsonNode root;
        try {
            root = mapper.readTree(path.toFile());
        } catch (IOException e) {
            throw new IllegalArgumentException("Unable to read profile config: " + path, e);
        }

        if (!root.isObject()) {
            throw new IllegalArgumentException("Profile config must be a JSON object");
        }
        if (root.has("profiles") && !root.get("profiles").isNull() && !root.get("profiles").isObject()) {
            throw new IllegalArgumentException("Profile config must contain a profiles object");
        }

        Map<String, Profile> profiles = new LinkedHashMap<>();
        JsonNode profilesNode = root.get("profiles");
        if (profilesNode != null && profilesNode.isObject()) {
            profilesNode.fields().forEachRemaining(entry -> {
                String name = entry.getKey();
                JsonNode node = entry.getValue();
                if (!node.isObject()) {
                    throw new IllegalArgumentException("Profile must be an object: " + name);
                }
                profiles.put(name, parseProfile(name, node));
            });
        }

        return new ProfileStore(profiles, parseLogConfig(root));
    }

    private static LogConfig parseLogConfig(JsonNode root) {
        JsonNode node = root.get("logDiagnostic");
        if (node == null || node.isNull()) {
            return LogConfig.empty();
        }
        if (!node.isObject()) {
            throw new IllegalArgumentException("logDiagnostic must be an object");
        }
        String defaultEnvironment = textOrNull(node, "defaultEnvironment");
        String logTable = textOrNull(node, "logTable");

        Map<String, String> services = new LinkedHashMap<>();
        JsonNode servicesNode = node.get("services");
        if (servicesNode != null && !servicesNode.isNull()) {
            if (!servicesNode.isObject()) {
                throw new IllegalArgumentException("logDiagnostic.services must be an object");
            }
            servicesNode.fields().forEachRemaining(entry -> {
                if (!entry.getValue().isTextual()) {
                    throw new IllegalArgumentException("logDiagnostic.services values must be strings: " + entry.getKey());
                }
                services.put(entry.getKey(), entry.getValue().asText());
            });
        }

        Map<String, LogEnv> environments = new LinkedHashMap<>();
        java.util.Set<String> blockedEnvironments = new java.util.LinkedHashSet<>();
        JsonNode environmentsNode = node.get("environments");
        if (environmentsNode != null && !environmentsNode.isNull()) {
            if (!environmentsNode.isObject()) {
                throw new IllegalArgumentException("logDiagnostic.environments must be an object");
            }
            environmentsNode.fields().forEachRemaining(entry -> {
                // Production environments are never loaded; they are only remembered so the
                // rejection can be explained when somebody asks for them.
                if (LogConfig.isProductionName(entry.getKey())) {
                    blockedEnvironments.add(entry.getKey());
                    return;
                }
                environments.put(entry.getKey(), parseLogEnv(entry.getKey(), entry.getValue()));
            });
        }

        return LogConfig.of(defaultEnvironment, logTable, services, environments, blockedEnvironments);
    }

    private static LogEnv parseLogEnv(String name, JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new IllegalArgumentException("logDiagnostic environment must be an object: " + name);
        }
        JsonNode mysql = node.get("mysql");
        if (mysql == null || !mysql.isObject()) {
            throw new IllegalArgumentException("log diagnostic environment requires a mysql object: " + name);
        }
        String host = textOrNull(mysql, "host");
        String database = textOrNull(mysql, "database");
        String user = textOrNull(mysql, "user");
        String passwordEnv = textOrNull(mysql, "passwordEnv");
        if (host == null || database == null || user == null || passwordEnv == null) {
            throw new IllegalArgumentException(
                    "MySQL log environment requires host, database, user, and passwordEnv: " + name);
        }
        int port = mysql.has("port") && mysql.get("port").canConvertToInt() ? mysql.get("port").asInt() : 3306;

        LogEnv.Builder builder = LogEnv.builder(name)
                .mysql(host, port, database, user, passwordEnv)
                .logTimeZone(textOrNull(node, "logTimeZone"));

        JsonNode apollo = node.get("apollo");
        if (apollo != null && !apollo.isNull()) {
            if (!apollo.isObject()) {
                throw new IllegalArgumentException("logDiagnostic.apollo must be an object: " + name);
            }
            String appId = textOrNull(apollo, "appId");
            String meta = textOrNull(apollo, "meta");
            if (appId == null || meta == null) {
                throw new IllegalArgumentException("Apollo log environment requires appId and meta: " + name);
            }
            builder.apollo(appId, meta, stringList(apollo, "namespaces"), textOrNull(apollo, "accessKeyEnv"));
        }

        return builder.build();
    }

    private static Profile parseProfile(String name, JsonNode node) {
        String typeText = textOrNull(node, "type");
        if (typeText == null) {
            throw new IllegalArgumentException("Profile is missing type: " + name);
        }

        Profile.Type type;
        if ("mysql".equalsIgnoreCase(typeText)) {
            type = Profile.Type.MYSQL;
        } else if ("mongo".equalsIgnoreCase(typeText)) {
            type = Profile.Type.MONGO;
        } else {
            throw new IllegalArgumentException("Unsupported profile type: " + typeText);
        }

        if (node.has("allowedTables") || node.has("allowedCollections")) {
            throw new IllegalArgumentException(
                    "allowedTables/allowedCollections are no longer supported; use blockedTables/blockedCollections: "
                            + name);
        }

        Profile.Builder builder = Profile.builder(name, type)
                .blockedTables(stringList(node, "blockedTables"))
                .blockedCollections(stringList(node, "blockedCollections"))
                .sensitiveFields(stringList(node, "sensitiveFields"));

        if (builderIsUsingDefaults(node, "sensitiveFields")) {
            builder.sensitiveFields(DEFAULT_SENSITIVE_FIELDS);
        }

        if (type == Profile.Type.MYSQL) {
            String host = textOrNull(node, "host");
            String database = textOrNull(node, "database");
            String user = textOrNull(node, "user");
            String passwordEnv = textOrNull(node, "passwordEnv");
            if (host == null || database == null || user == null || passwordEnv == null) {
                throw new IllegalArgumentException("MySQL profile requires host, database, user, and passwordEnv: " + name);
            }
            int port = node.has("port") && node.get("port").canConvertToInt() ? node.get("port").asInt() : 3306;
            builder.host(host).port(port).database(database).user(user).passwordEnv(passwordEnv);
        } else {
            String uriEnv = textOrNull(node, "uriEnv");
            String database = textOrNull(node, "database");
            if (uriEnv == null || database == null) {
                throw new IllegalArgumentException("Mongo profile requires uriEnv and database: " + name);
            }
            builder.uriEnv(uriEnv).database(database);
        }

        return builder.build();
    }

    private static boolean builderIsUsingDefaults(JsonNode node, String field) {
        return !node.has(field) || node.get(field).isNull();
    }

    private static String textOrNull(JsonNode node, String field) {
        if (!node.has(field) || node.get(field).isNull()) {
            return null;
        }
        JsonNode value = node.get(field);
        if (!value.isTextual()) {
            throw new IllegalArgumentException(field + " must be a string");
        }
        return value.asText();
    }

    private static List<String> stringList(JsonNode node, String field) {
        if (!node.has(field) || node.get(field).isNull()) {
            return Collections.emptyList();
        }
        JsonNode value = node.get(field);
        if (!value.isArray()) {
            throw new IllegalArgumentException(field + " must be an array");
        }
        List<String> result = new ArrayList<>();
        for (JsonNode item : value) {
            if (!item.isTextual()) {
                throw new IllegalArgumentException(field + " must contain strings");
            }
            result.add(item.asText());
        }
        return result;
    }

    private static Path defaultConfigPath() {
        String configured = System.getenv(CONFIG_ENV);
        if (configured != null && !configured.trim().isEmpty()) {
            return Paths.get(configured.trim());
        }
        Path local = Paths.get(".", "profiles.json").toAbsolutePath().normalize();
        if (Files.exists(local)) {
            return local;
        }
        return Paths.get(System.getProperty("user.home"), ".business-diagnostic", "profiles.json");
    }

    public Map<String, Profile> getProfiles() {
        return profiles;
    }

    public Profile require(String name) {
        Profile profile = profiles.get(name);
        if (profile == null) {
            throw new IllegalArgumentException("Unknown profile: " + name);
        }
        return profile;
    }
}
