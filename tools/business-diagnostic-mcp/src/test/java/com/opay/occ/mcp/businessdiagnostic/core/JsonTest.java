package com.opay.occ.mcp.businessdiagnostic.core;
import com.opay.occ.mcp.businessdiagnostic.core.Json;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class JsonTest {
    @Test
    void shouldReadAndWriteObjects() {
        Map<String, Object> value = Json.readObject("{\"name\":\"test\",\"count\":3}");
        assertThat(value).containsEntry("name", "test").containsEntry("count", 3);
        assertThat(Json.write(value)).isEqualTo("{\"name\":\"test\",\"count\":3}");
    }
}
