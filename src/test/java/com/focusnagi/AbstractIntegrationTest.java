package com.focusnagi;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
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

  /** Simulates the logged-in owner without requiring a real session. */
  protected static org.springframework.test.web.servlet.request.RequestPostProcessor asOwner() {
    return org.springframework.security.test.web.servlet.request
        .SecurityMockMvcRequestPostProcessors.user("owner")
        .roles("OWNER");
  }
}
