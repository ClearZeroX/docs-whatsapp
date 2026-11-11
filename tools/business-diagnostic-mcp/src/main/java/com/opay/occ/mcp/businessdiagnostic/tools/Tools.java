package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.core.Profile;
import com.opay.occ.mcp.businessdiagnostic.core.ProfileStore;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tool argument parsing and execution.
 */
public final class Tools {
    private Tools() {
    }

    public static Map<String, Object> call(String name, Map<String, Object> args, ProfileStore profiles) {
        if ("list_profiles".equals(name)) {
            return listProfiles(profiles);
        }
        if ("get_schema".equals(name)) {
            return getSchema(args, profiles);
        }
        if ("query_mysql".equals(name)) {
            return queryMysql(args, profiles);
        }
        if ("count_mysql".equals(name)) {
            return countMysql(args, profiles);
        }
        if ("explain_mysql".equals(name)) {
            return explainMysql(args, profiles);
        }
        if ("query_mongo".equals(name)) {
            return queryMongo(args, profiles);
        }
        if ("count_mongo".equals(name)) {
            return countMongo(args, profiles);
        }
        if ("explain_mongo".equals(name)) {
            return explainMongo(args, profiles);
        }
        if ("list_log_environments".equals(name)) {
            return LogTools.listEnvironments(profiles.getLogConfig());
        }
        if ("query_logs".equals(name)) {
            return queryLogs(args, profiles);
        }
        if ("get_apollo_configs".equals(name)) {
            return ApolloTools.getConfigs(
                    profiles.getLogConfig(),
                    optionalStringArg(args, "env"),
                    optionalStringArg(args, "namespace"),
                    optionalStringArg(args, "keyKeyword"),
                    stringListArg(args, "configKeys"),
                    optionalStringArg(args, "source"),
                    stringArg(args, "reason"),
                    longArg(args, "timeStart"),
                    longArg(args, "timeEnd"),
                    intArg(args, "limit", 50)
            );
        }
        throw new IllegalArgumentException("Unknown tool: " + name);
    }

    private static Map<String, Object> queryLogs(Map<String, Object> args, ProfileStore profiles) {
        return LogTools.query(
                profiles.getLogConfig(),
                optionalStringArg(args, "env"),
                optionalStringArg(args, "service"),
                optionalStringArg(args, "traceId"),
                optionalStringArg(args, "keyword"),
                optionalStringArg(args, "logLevel"),
                longArg(args, "timeStart"),
                longArg(args, "timeEnd"),
                intArg(args, "limit", LogTools.DEFAULT_LIMIT),
                optionalStringArg(args, "order")
        );
    }

    private static Long longArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return null;
        }
        if (!(value instanceof Number)) {
            throw new IllegalArgumentException(name + " must be a number");
        }
        return ((Number) value).longValue();
    }

    private static Map<String, Object> listProfiles(ProfileStore profiles) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Profile profile : profiles.getProfiles().values()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", profile.getName());
            item.put("type", profile.getType().name().toLowerCase());
            item.put("database", profile.getDatabase());
            item.put("blockedTables", new ArrayList<>(profile.getBlockedTables()));
            item.put("blockedCollections", new ArrayList<>(profile.getBlockedCollections()));
            result.add(item);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("profiles", result);
        return response;
    }

    private static Map<String, Object> getSchema(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        String table = stringArg(args, "table");
        return MySqlTools.getSchema(profile, table);
    }

    private static Map<String, Object> queryMysql(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MySqlTools.query(
                profile,
                stringArg(args, "table"),
                stringListArg(args, "columns"),
                mapListArg(args, "where"),
                mapListArg(args, "orderBy"),
                intArg(args, "limit", 100),
                intArg(args, "offset", 0),
                optionalStringArg(args, "cursor")
        );
    }

    private static Map<String, Object> countMysql(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MySqlTools.count(profile, stringArg(args, "table"), mapListArg(args, "where"));
    }

    private static Map<String, Object> explainMysql(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MySqlTools.explain(
                profile,
                stringArg(args, "table"),
                stringListArg(args, "columns"),
                mapListArg(args, "where"),
                mapListArg(args, "orderBy"),
                intArg(args, "limit", 100),
                intArg(args, "offset", 0)
        );
    }

    private static Map<String, Object> queryMongo(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MongoTools.query(
                profile,
                stringArg(args, "collection"),
                mapArg(args, "filter"),
                mapArg(args, "projection"),
                mapArg(args, "sort"),
                intArg(args, "limit", 100),
                intArg(args, "skip", 0)
        );
    }

    private static Map<String, Object> countMongo(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MongoTools.count(profile, stringArg(args, "collection"), mapArg(args, "filter"));
    }

    private static Map<String, Object> explainMongo(Map<String, Object> args, ProfileStore profiles) {
        Profile profile = profiles.require(stringArg(args, "profile"));
        return MongoTools.explain(
                profile,
                stringArg(args, "collection"),
                mapArg(args, "filter"),
                mapArg(args, "projection"),
                mapArg(args, "sort"),
                intArg(args, "limit", 100),
                intArg(args, "skip", 0)
        );
    }

    private static String stringArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw new IllegalArgumentException(name + " must be a non-empty string");
        }
        return (String) value;
    }

    private static String optionalStringArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return null;
        }
        if (!(value instanceof String)) {
            throw new IllegalArgumentException(name + " must be a string");
        }
        return (String) value;
    }

    private static int intArg(Map<String, Object> args, String name, int defaultValue) {
        Object value = args.get(name);
        if (value == null) {
            return defaultValue;
        }
        if (!(value instanceof Number)) {
            throw new IllegalArgumentException(name + " must be a number");
        }
        return ((Number) value).intValue();
    }

    private static List<String> stringListArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return Collections.emptyList();
        }
        if (!(value instanceof List)) {
            throw new IllegalArgumentException(name + " must be an array");
        }
        List<String> result = new ArrayList<>();
        for (Object item : (List<?>) value) {
            if (!(item instanceof String)) {
                throw new IllegalArgumentException(name + " must contain strings");
            }
            result.add((String) item);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> mapListArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return Collections.emptyList();
        }
        if (!(value instanceof List)) {
            throw new IllegalArgumentException(name + " must be an array");
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : (List<?>) value) {
            if (!(item instanceof Map)) {
                throw new IllegalArgumentException(name + " must contain objects");
            }
            result.add((Map<String, Object>) item);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapArg(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return Collections.emptyMap();
        }
        if (!(value instanceof Map)) {
            throw new IllegalArgumentException(name + " must be an object");
        }
        return (Map<String, Object>) value;
    }
}
