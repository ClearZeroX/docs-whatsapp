package com.opay.occ.mcp.businessdiagnostic.tools;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReadOnlyGuardTest {

    @Test
    void shouldAcceptBuilderGeneratedStatements() {
        assertThatCode(() -> ReadOnlyGuard.requireReadOnly(
                "SELECT `id`,`msg_status` FROM `message_record` WHERE `customer_phone` = ? "
                        + "ORDER BY `send_time` DESC LIMIT ? OFFSET ?")).doesNotThrowAnyException();
        assertThatCode(() -> ReadOnlyGuard.requireReadOnly(
                "SELECT COUNT(*) AS `count` FROM `task` WHERE `id` IN (?,?)")).doesNotThrowAnyException();
        assertThatCode(() -> ReadOnlyGuard.requireReadOnly(
                "SELECT `id`,`update_time` FROM `task` WHERE `create_time` > ?")).doesNotThrowAnyException();
        assertThatCode(() -> ReadOnlyGuard.requireReadOnly(
                "EXPLAIN SELECT * FROM `task` WHERE `id` = ?")).doesNotThrowAnyException();
        assertThatCode(() -> ReadOnlyGuard.requireReadOnly(
                "SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?")).doesNotThrowAnyException();
    }

    @Test
    void shouldRejectEmptyStatements() {
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("   "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shouldRejectWritesAndStructureChanges() {
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("DELETE FROM `task`"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("UPDATE `task` SET `remark` = 'x'"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("INSERT INTO `task` (`id`) VALUES (1)"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("TRUNCATE TABLE `task`"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("DROP TABLE `task`"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("GRANT ALL ON *.* TO 'x'@'%'"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("CALL some_procedure()"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void shouldRejectStackedStatementsCommentsAndEscapes() {
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("SELECT 1; DROP TABLE `task`"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("SELECT 1 -- x\nUNION SELECT 2"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("SELECT /* x */ 1"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly(
                "SELECT * FROM `task` INTO OUTFILE '/tmp/x.csv'"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ReadOnlyGuard.requireReadOnly("SELECT * FROM `task` FOR UPDATE"))
                .isInstanceOf(IllegalStateException.class);
    }
}
