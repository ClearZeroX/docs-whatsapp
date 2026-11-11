package com.opay.occ.mcp.businessdiagnostic.tools;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;

class TraceIdExtractorTest {

    @Test
    void shouldExtractTraceIdFromStandardLine() {
        String line = "2026-10-14 10:00:01.123 [http-nio-9201-exec-1] INFO  "
                + "- traceId:[0ADC020B49EE31CE] com.opay.occ.whatsapp.Demo -- send ok";
        assertThat(TraceIdExtractor.extract(line)).isEqualTo("0ADC020B49EE31CE");
    }

    @Test
    void shouldReturnNullWhenTraceIdMissingOrEmpty() {
        assertThat(TraceIdExtractor.extract("no trace id here")).isNull();
        assertThat(TraceIdExtractor.extract("traceId:[] started")).isNull();
        assertThat(TraceIdExtractor.extract(null)).isNull();
    }

    @Test
    void shouldRankTraceIdsByHitCount() {
        java.util.List<String> contents = Arrays.asList(
                "traceId:[aaa] one",
                "traceId:[bbb] one",
                "traceId:[aaa] two",
                "traceId:[aaa] three",
                "traceId:[ccc] one"
        );
        assertThat(TraceIdExtractor.topTraceIds(contents, 2)).containsExactly("aaa", "bbb");
    }

    @Test
    void shouldHandleEmptyInput() {
        assertThat(TraceIdExtractor.topTraceIds(Collections.<String>emptyList(), 5)).isEmpty();
        assertThat(TraceIdExtractor.topTraceIds(null, 5)).isEmpty();
    }
}
