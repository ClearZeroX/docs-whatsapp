package com.opay.occ.mcp.businessdiagnostic.tools;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Read-only JDBC connection factory shared by the diagnostic queries.
 *
 * <p>The database account may be read-write, so read-only behaviour is enforced here instead
 * of by the account: the session is switched to read-only, {@link Connection#setReadOnly} is
 * set, the resulting session flag is verified, and every statement is passed through
 * {@link ReadOnlyGuard} before it is prepared.</p>
 */
public final class JdbcSupport {

    private JdbcSupport() {
    }

    /** Opens a MySQL connection and forces the session into read-only mode. */
    public static Connection openReadOnly(String host, int port, String database,
                                          String user, String password) throws SQLException {
        String url = "jdbc:mysql://" + host + ":" + port + "/" + database
                + "?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai"
                + "&connectTimeout=3000&socketTimeout=5000";
        Connection connection = DriverManager.getConnection(url, user, password);
        try {
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET SESSION TRANSACTION READ ONLY");
            }
            connection.setReadOnly(true);
            verifyReadOnlySession(connection);
            return connection;
        } catch (SQLException | RuntimeException e) {
            closeQuietly(connection);
            throw e;
        }
    }

    /** Prepares a statement only after {@link ReadOnlyGuard} has accepted it. */
    public static PreparedStatement prepareReadOnly(Connection connection, String sql)
            throws SQLException {
        ReadOnlyGuard.requireReadOnly(sql);
        return connection.prepareStatement(sql);
    }

    /**
     * Confirms the server side really did switch the session to read-only. Very old servers do
     * not expose the variable at all, in which case the client-side read-only flag is trusted.
     */
    private static void verifyReadOnlySession(Connection connection) {
        try (Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery("SELECT @@session.transaction_read_only")) {
            if (resultSet.next() && resultSet.getInt(1) == 0) {
                throw new IllegalStateException(
                        "Database session is not read-only; refusing to run diagnostic queries");
            }
        } catch (SQLException ignored) {
            // Unknown system variable (pre-5.6.5 servers): keep the client-side flag only.
        }
    }

    private static void closeQuietly(Connection connection) {
        try {
            connection.close();
        } catch (SQLException ignored) {
            // Nothing useful to do while already failing.
        }
    }
}
