package com.focusnagi;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
public abstract class AbstractIntegrationTest {

  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

  @Autowired JdbcTemplate jdbcTemplate;

  /**
   * The container is shared between test classes in the same JVM, so each test starts from a clean
   * schema. The owner account and Flyway history are preserved.
   */
  @BeforeEach
  void cleanDatabase() {
    List<String> tables =
        jdbcTemplate.queryForList(
            """
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> 'owner'
              AND tablename <> 'flyway_schema_history'
            """,
            String.class);
    if (!tables.isEmpty()) {
      jdbcTemplate.execute(
          "TRUNCATE TABLE " + String.join(", ", tables) + " RESTART IDENTITY CASCADE");
    }
  }

  /** Simulates the logged-in owner without requiring a real session. */
  protected static org.springframework.test.web.servlet.request.RequestPostProcessor asOwner() {
    return org.springframework.security.test.web.servlet.request
        .SecurityMockMvcRequestPostProcessors.user("owner")
        .roles("OWNER");
  }
}
