package com.opay.occ.mcp.businessdiagnostic.tools;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts trace ids from log content lines.
 *
 * <p>The log pattern embeds the MDC trace id as {@code traceId:[...]}, which is the
 * only reliable link between a business identifier and the full request log trail.</p>
 */
public final class TraceIdExtractor {

    private static final Pattern TRACE_ID_PATTERN = Pattern.compile("traceId:\\[([^\\]]*)\\]");

    private TraceIdExtractor() {
    }

    public static String extract(String content) {
        if (content == null) {
            return null;
        }
        Matcher matcher = TRACE_ID_PATTERN.matcher(content);
        if (!matcher.find()) {
            return null;
        }
        String value = matcher.group(1).trim();
        return value.isEmpty() ? null : value;
    }

    /** Returns the most frequent trace ids, capped at {@code max}. */
    public static List<String> topTraceIds(List<String> contents, int max) {
        List<String> result = new ArrayList<>();
        if (contents == null || contents.isEmpty() || max <= 0) {
            return result;
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String content : contents) {
            String traceId = extract(content);
            if (traceId == null) {
                continue;
            }
            counts.put(traceId, counts.containsKey(traceId) ? counts.get(traceId) + 1 : 1);
        }
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
        entries.sort(new Comparator<Map.Entry<String, Integer>>() {
            @Override
            public int compare(Map.Entry<String, Integer> left, Map.Entry<String, Integer> right) {
                int byCount = right.getValue().compareTo(left.getValue());
                return byCount != 0 ? byCount : left.getKey().compareTo(right.getKey());
            }
        });
        for (Map.Entry<String, Integer> entry : entries) {
            if (result.size() >= max) {
                break;
            }
            result.add(entry.getKey());
        }
        return result;
    }
}
