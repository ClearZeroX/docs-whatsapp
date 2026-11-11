package com.opay.occ.mcp.businessdiagnostic.transport.stdio;
import com.opay.occ.mcp.businessdiagnostic.core.Audit;
import com.opay.occ.mcp.businessdiagnostic.core.Json;
import com.opay.occ.mcp.businessdiagnostic.core.ProfileStore;
import com.opay.occ.mcp.businessdiagnostic.tools.ToolRegistry;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Local stdio MCP server.
 *
 * <p>The server speaks newline-delimited JSON-RPC 2.0 over stdin and stdout.
 * Diagnostic logs are written to stderr so stdout remains protocol-clean.</p>
 */
public final class McpServer {
    private static final String PROTOCOL_VERSION = "2024-11-05";
    private static final String SERVER_NAME = "business-diagnostic-mcp";
    private static final String SERVER_VERSION = "0.2.0";

    private final ProfileStore profiles;
    private final BufferedWriter output;

    private McpServer(ProfileStore profiles, BufferedWriter output) {
        this.profiles = profiles;
        this.output = output;
    }

    public static void main(String[] args) throws IOException {
        ProfileStore profiles = ProfileStore.loadDefault();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8))) {
            McpServer server = new McpServer(profiles, writer);
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) {
                    continue;
                }
                Map<String, Object> response = server.handleLine(line);
                if (response != null) {
                    writer.write(Json.write(response));
                    writer.write('\n');
                    writer.flush();
                }
            }
        }
    }

    private Map<String, Object> handleLine(String line) {
        Map<String, Object> request;
        try {
            request = Json.readObject(line);
        } catch (Exception e) {
            return error(null, -32700, "Parse error");
        }

        Object id = request.get("id");
        String method = request.get("method") == null ? null : request.get("method").toString();
        if (method == null) {
            return error(id, -32600, "Invalid request");
        }
        if (id == null && !request.containsKey("id")) {
            return null;
        }

        try {
            if ("initialize".equals(method)) {
                return success(id, initializeResult());
            }
            if ("ping".equals(method)) {
                return success(id, new LinkedHashMap<String, Object>());
            }
            if ("tools/list".equals(method)) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("tools", ToolRegistry.listTools());
                return success(id, result);
            }
            if ("tools/call".equals(method)) {
                return success(id, callTool(request));
            }
            if (method.startsWith("notifications/")) {
                return null;
            }
            return error(id, -32601, "Method not found: " + method);
        } catch (Exception e) {
            return error(id, -32000, e.getMessage() == null ? "Tool execution failed" : e.getMessage());
        }
    }

    private Map<String, Object> initializeResult() {
        Map<String, Object> capabilities = new LinkedHashMap<>();
        Map<String, Object> toolsCapability = new LinkedHashMap<>();
        toolsCapability.put("listChanged", false);
        capabilities.put("tools", toolsCapability);

        Map<String, Object> serverInfo = new LinkedHashMap<>();
        serverInfo.put("name", SERVER_NAME);
        serverInfo.put("version", SERVER_VERSION);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("protocolVersion", PROTOCOL_VERSION);
        result.put("capabilities", capabilities);
        result.put("serverInfo", serverInfo);
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> callTool(Map<String, Object> request) {
        Object paramsObject = request.get("params");
        if (!(paramsObject instanceof Map)) {
            throw new IllegalArgumentException("tools/call params must be an object");
        }
        Map<String, Object> params = (Map<String, Object>) paramsObject;
        Object nameObject = params.get("name");
        if (!(nameObject instanceof String) || ((String) nameObject).trim().isEmpty()) {
            throw new IllegalArgumentException("tools/call name must be a non-empty string");
        }
        Object argsObject = params.get("arguments");
        Map<String, Object> args;
        if (argsObject == null) {
            args = new LinkedHashMap<>();
        } else if (argsObject instanceof Map) {
            args = (Map<String, Object>) argsObject;
        } else {
            throw new IllegalArgumentException("tools/call arguments must be an object");
        }

        long startedAt = System.currentTimeMillis();
        Map<String, Object> toolResult;
        try {
            toolResult = ToolRegistry.call((String) nameObject, args, profiles);
        } catch (Exception e) {
            Audit.failure((String) nameObject, e, System.currentTimeMillis() - startedAt);
            throw e;
        }
        Audit.success((String) nameObject, toolResult, System.currentTimeMillis() - startedAt);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "text");
        content.put("text", Json.write(toolResult));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", java.util.Collections.singletonList(content));
        result.put("isError", false);
        return result;
    }

    private static Map<String, Object> success(Object id, Map<String, Object> result) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("result", result);
        return response;
    }

    private static Map<String, Object> error(Object id, int code, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("error", error);
        return response;
    }
}
