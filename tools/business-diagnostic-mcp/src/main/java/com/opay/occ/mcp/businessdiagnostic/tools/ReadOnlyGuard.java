package com.opay.occ.mcp.businessdiagnostic.tools;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Last line of defence before a statement reaches the JDBC driver.
 *
 * <p>{@link SqlBuilder} already emits nothing but SELECT / COUNT / EXPLAIN, but the database
 * account may be read-write (a dedicated read-only account is not always available). This
 * guard therefore fails closed: anything that is not a single, comment-free read statement is
 * rejected before execution, so a later change to a builder can never silently turn into a
 * write.</p>
 */
public final class ReadOnlyGuard {

    /** Statement keywords that may only ever appear as a trailing modifier, never as verbs. */
    private static final List<String> FORBIDDEN_FRAGMENTS = Arrays.asList(
            ";", "--", "/*", "*/", "#",
            " INTO OUTFILE", " INTO DUMPFILE", " FOR UPDATE", " LOCK IN SHARE MODE",
            " INSERT ", " UPDATE ", " DELETE ", " REPLACE ", " MERGE ",
            " TRUNCATE ", " DROP ", " ALTER ", " CREATE ", " RENAME ",
            " GRANT ", " REVOKE ", " SET ", " USE ", " CALL ", " DO ", " LOAD ",
            " HANDLER ", " PREPARE ", " EXECUTE ", " COMMIT", " ROLLBACK", " START TRANSACTION"
    );

    private static final int ABBREVIATE_LIMIT = 120;

    private ReadOnlyGuard() {
    }

    /**
     * Rejects the statement unless it is a single read-only SELECT / EXPLAIN.
     *
     * @throws IllegalArgumentException when the statement is empty
     * @throws IllegalStateException    when the statement could modify data or structure
     */
    public static void requireReadOnly(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("SQL must not be empty");
        }
        String normalized = sql.trim().toUpperCase(Locale.ROOT);
        if (!normalized.startsWith("SELECT") && !normalized.startsWith("EXPLAIN")) {
            throw new IllegalStateException(
                    "Refusing to run a non read-only statement: " + abbreviate(sql));
        }
        for (String fragment : FORBIDDEN_FRAGMENTS) {
            if (normalized.contains(fragment)) {
                throw new IllegalStateException("Refusing to run a statement containing '"
                        + fragment.trim() + "': " + abbreviate(sql));
            }
        }
    }

    private static String abbreviate(String sql) {
        String flat = sql.replaceAll("\\s+", " ").trim();
        return flat.length() <= ABBREVIATE_LIMIT
                ? flat
                : flat.substring(0, ABBREVIATE_LIMIT) + "...";
    }
}
