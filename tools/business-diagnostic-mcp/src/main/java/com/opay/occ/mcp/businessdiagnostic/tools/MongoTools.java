package com.opay.occ.mcp.businessdiagnostic.tools;
import com.opay.occ.mcp.businessdiagnostic.core.Masking;
import com.opay.occ.mcp.businessdiagnostic.core.Profile;

import com.mongodb.MongoException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.CountOptions;
import org.bson.Document;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Read-only Mongo diagnostic operations.
 */
public final class MongoTools {

    /**
     * Server-side cap so a query that would scan the whole collection fails with a clear
     * message instead of holding the tool call open for minutes.
     */
    private static final int MAX_TIME_MS = 30_000;

    /** Reused clients keyed by profile name and URI. */
    private static final Map<String, MongoClient> CLIENTS = new ConcurrentHashMap<>();

    private MongoTools() {
    }

    public static Map<String, Object> query(
            Profile profile,
            String collection,
            Map<String, Object> filter,
            Map<String, Object> projection,
            Map<String, Object> sort,
            int limit,
            int skip
    ) {
        requireNotBlockedCollection(profile, collection);
        MongoBuilder.validatePagination(limit, skip);
        Document bsonFilter = MongoBuilder.buildFilter(filter);
        Document bsonProjection = MongoBuilder.buildProjection(projection);
        Document bsonSort = MongoBuilder.buildSortWithDefault(sort);
        try {
            MongoClient client = createClient(profile);
            MongoDatabase database = client.getDatabase(profile.getDatabase());
            List<Map<String, Object>> rows = new ArrayList<>();
            database.getCollection(collection).find(bsonFilter)
                    .projection(bsonProjection)
                    .sort(bsonSort)
                    .skip(skip)
                    .limit(limit)
                    .maxTime(MAX_TIME_MS, TimeUnit.MILLISECONDS)
                    .map(document -> (Map<String, Object>) Masking.maskRow(document, profile))
                    .into(rows);
            Map<String, Object> result = envelope(profile, collection);
            result.put("rows", rows);
            result.put("type", "find");
            result.put("sort", new LinkedHashMap<>(bsonSort));
            result.put("limit", limit);
            result.put("skip", skip);
            return result;
        } catch (MongoException e) {
            throw queryFailed(collection, e);
        }
    }

    public static Map<String, Object> count(
            Profile profile,
            String collection,
            Map<String, Object> filter
    ) {
        requireNotBlockedCollection(profile, collection);
        Document bsonFilter = MongoBuilder.buildFilter(filter);
        try {
            MongoClient client = createClient(profile);
            MongoDatabase database = client.getDatabase(profile.getDatabase());
            MongoCollection<Document> mongoCollection = database.getCollection(collection);
            // An empty filter is answered from collection metadata (no scan at all).
            boolean estimated = bsonFilter.isEmpty();
            long count = estimated
                    ? mongoCollection.estimatedDocumentCount()
                    : mongoCollection.countDocuments(bsonFilter,
                            new CountOptions().maxTime(MAX_TIME_MS, TimeUnit.MILLISECONDS));
            Map<String, Object> result = envelope(profile, collection);
            result.put("count", count);
            result.put("estimated", estimated);
            return result;
        } catch (MongoException e) {
            throw queryFailed(collection, e);
        }
    }

    public static Map<String, Object> explain(
            Profile profile,
            String collection,
            Map<String, Object> filter,
            Map<String, Object> projection,
            Map<String, Object> sort,
            int limit,
            int skip
    ) {
        requireNotBlockedCollection(profile, collection);
        MongoBuilder.validatePagination(limit, skip);
        Document bsonFilter = MongoBuilder.buildFilter(filter);
        Document bsonProjection = MongoBuilder.buildProjection(projection);
        Document bsonSort = MongoBuilder.buildSortWithDefault(sort);

        Document find = new Document("find", collection)
                .append("filter", bsonFilter)
                .append("projection", bsonProjection)
                .append("sort", bsonSort)
                .append("skip", skip)
                .append("limit", limit);
        Document command = new Document("explain", find).append("verbosity", "executionStats");
        requireReadOnlyExplain(command);
        try {
            MongoClient client = createClient(profile);
            MongoDatabase database = client.getDatabase(profile.getDatabase());
            Document plan = database.runCommand(command);
            Map<String, Object> result = envelope(profile, collection);
            result.put("plan", Masking.maskRow(plan, profile));
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("sort", new LinkedHashMap<>(bsonSort));
            summary.put("winningStage", winningStage(plan));
            result.put("summary", summary);
            return result;
        } catch (MongoException e) {
            throw queryFailed(collection, e);
        }
    }

    /**
     * The explain command is the only raw server command this tool issues, so it is asserted to
     * wrap a read-only {@code find} explicitly. A write command can therefore never be smuggled
     * in through the explain path.
     */
    private static void requireReadOnlyExplain(Document command) {
        if (command.size() > 2 || !command.containsKey("explain")) {
            throw new IllegalStateException("Refusing to run a non read-only Mongo command");
        }
        if (command.size() == 2 && !command.containsKey("verbosity")) {
            throw new IllegalStateException("Refusing to run a non read-only Mongo command");
        }
        if (command.containsKey("verbosity")
                && !("queryPlanner".equals(command.getString("verbosity"))
                || "executionStats".equals(command.getString("verbosity"))
                || "allPlansExecution".equals(command.getString("verbosity")))) {
            throw new IllegalStateException("Refusing to run an invalid Mongo explain command");
        }
        Document inner = command.get("explain", Document.class);
        if (inner == null || !inner.containsKey("find")) {
            throw new IllegalStateException("Refusing to explain a non read-only Mongo command");
        }
        java.util.Set<String> allowedFindFields = new java.util.HashSet<>(java.util.Arrays.asList(
                "find", "filter", "projection", "sort", "skip", "limit"
        ));
        if (!allowedFindFields.containsAll(inner.keySet())) {
            throw new IllegalStateException("Refusing to explain a non read-only Mongo command");
        }
        if (inner.get("find") == null || !(inner.get("find") instanceof String)) {
            throw new IllegalStateException("Refusing to explain a non read-only Mongo command");
        }
    }

    /** Extracts the winning plan stage name (COLLSCAN / IXSCAN / SORT / ...) from an explain. */
    private static String winningStage(Document plan) {
        Document planner = plan.get("queryPlanner", Document.class);
        if (planner == null) {
            return null;
        }
        Document winningPlan = planner.get("winningPlan", Document.class);
        return winningPlan == null ? null : winningPlan.getString("stage");
    }

    private static IllegalStateException queryFailed(String collection, MongoException e) {
        String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        if (message.contains("time limit")) {
            return new IllegalStateException(
                    "Mongo query on " + collection + " exceeded " + (MAX_TIME_MS / 1000)
                            + "s and was aborted: sorting or scanning on a non-indexed field walks the "
                            + "whole collection. Sort by _id (the default), filter on an indexed field, "
                            + "or narrow the filter.", e);
        }
        return new IllegalStateException("Mongo query failed on " + collection + ": " + message, e);
    }

    /**
     * Mongo clients are pooled and reused across tool calls. Creating a client performs a full
     * connection handshake with the server, which costs about a second over the public network
     * and dwarfs the query itself once an index is used. The clients live for the lifetime of
     * the MCP server process and are intentionally never closed.
     */
    private static MongoClient createClient(Profile profile) {
        String uri = profile.getUri();
        if (uri == null || uri.trim().isEmpty()) {
            throw new IllegalStateException("Missing Mongo URI environment variable");
        }
        return CLIENTS.computeIfAbsent(profile.getName() + "|" + uri,
                key -> MongoClients.create(uri));
    }

    private static void requireNotBlockedCollection(Profile profile, String collection) {
        if (!profile.isCollectionAllowed(collection)) {
            throw new IllegalArgumentException("Collection is blocked by profile: " + collection);
        }
    }

    private static Map<String, Object> envelope(Profile profile, String collection) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("profile", profile.getName());
        result.put("collection", collection);
        return result;
    }
}
