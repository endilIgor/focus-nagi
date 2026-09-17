package com.focusnagi.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class AuthIntegrationTest extends AbstractIntegrationTest {

  private static final String USERNAME = "owner";
  private static final String PASSWORD = "test-password";

  @Autowired MockMvc mvc;
  @Autowired OwnerRepository ownerRepository;
  @Autowired LoginRateLimiter rateLimiter;

  @AfterEach
  void clearRateLimiter() {
    rateLimiter.reset();
  }

  private MvcResult login(String username, String password) throws Exception {
    return mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"username": "%s", "password": "%s"}
                    """
                        .formatted(username, password)))
        .andReturn();
  }

  private MockHttpSession authenticatedSession() throws Exception {
    MvcResult result = login(USERNAME, PASSWORD);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return (MockHttpSession) result.getRequest().getSession(false);
  }

  @Nested
  @DisplayName("login")
  class Login {

    @Test
    void shouldLoginWithValidCredentialsAndCreateServerSession() throws Exception {
      MvcResult result = login(USERNAME, PASSWORD);
      assertThat(result.getResponse().getStatus()).isEqualTo(200);
      // MockMvc does not write the Set-Cookie header; the session is carried by the
      // MockHttpSession. The real FOCUS_SESSION cookie is validated via HTTP in manual checks.
      assertThat(result.getRequest().getSession(false)).isNotNull();

      mvc.perform(
              get("/api/auth/me").session((MockHttpSession) result.getRequest().getSession(false)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.username").value(USERNAME))
          .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void shouldRejectInvalidCredentialsWithoutEnumeration() throws Exception {
      mvc.perform(
              post("/api/auth/login")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"username\": \"owner\", \"password\": \"wrong\"}"))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

      mvc.perform(
              post("/api/auth/login")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"username\": \"ghost\", \"password\": \"whatever\"}"))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void shouldRejectBlankCredentials() throws Exception {
      mvc.perform(
              post("/api/auth/login")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"username\": \"\", \"password\": \"\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldRejectOversizedCredentialsInsteadOfErroringInThePasswordEncoder() throws Exception {
      String tooLongUsername = "u".repeat(51);
      String tooLongPassword = "p".repeat(73);

      mvc.perform(
              post("/api/auth/login")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"username\": \"%s\", \"password\": \"%s\"}"
                          .formatted(tooLongUsername, tooLongPassword)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldTemporarilyLockAfterRepeatedFailures() throws Exception {
      for (int i = 0; i < 5; i++) {
        login(USERNAME, "wrong-" + i);
      }
      mvc.perform(
              post("/api/auth/login")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"username\": \"%s\", \"password\": \"%s\"}".formatted(USERNAME, PASSWORD)))
          .andExpect(status().isTooManyRequests())
          .andExpect(jsonPath("$.code").value("LOGIN_LOCKED"));
    }
  }

  @Nested
  @DisplayName("current session")
  class Current {

    @Test
    void shouldReturnCurrentOwnerWhenAuthenticated() throws Exception {
      mvc.perform(get("/api/auth/me").session(authenticatedSession()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.username").value(USERNAME));
    }

    @Test
    void shouldRejectUnauthenticatedMeRequest() throws Exception {
      mvc.perform(get("/api/auth/me"))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
  }

  @Nested
  @DisplayName("logout")
  class Logout {

    @Test
    void shouldLogoutAndInvalidateSession() throws Exception {
      MockHttpSession session = authenticatedSession();
      mvc.perform(post("/api/auth/logout").with(csrf()).session(session))
          .andExpect(status().isNoContent());
      mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }
  }

  @Nested
  @DisplayName("change password")
  class ChangePassword {

    @Test
    void shouldChangePasswordWithValidCurrentPassword() throws Exception {
      String newPassword = "brand-new-secret-123";

      MockHttpSession session = authenticatedSession();
      mvc.perform(
              post("/api/auth/password")
                  .with(csrf())
                  .session(session)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"currentPassword\": \"%s\", \"newPassword\": \"%s\"}"
                          .formatted(PASSWORD, newPassword)))
          .andExpect(status().isNoContent());

      login(USERNAME, newPassword);
      assertThat(login(USERNAME, PASSWORD).getResponse().getStatus()).isEqualTo(401);

      // restore original password for other tests
      MockHttpSession session2 =
          (MockHttpSession) login(USERNAME, newPassword).getRequest().getSession(false);
      mvc.perform(
              post("/api/auth/password")
                  .with(csrf())
                  .session(session2)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"currentPassword\": \"%s\", \"newPassword\": \"%s\"}"
                          .formatted(newPassword, PASSWORD)))
          .andExpect(status().isNoContent());
    }

    @Test
    void shouldRejectChangeWithWrongCurrentPassword() throws Exception {
      mvc.perform(
              post("/api/auth/password")
                  .with(csrf())
                  .session(authenticatedSession())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"currentPassword\": \"nope\", \"newPassword\": \"brand-new-secret-123\"}"))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void shouldRejectWeakNewPassword() throws Exception {
      mvc.perform(
              post("/api/auth/password")
                  .with(csrf())
                  .session(authenticatedSession())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"currentPassword\": \"%s\", \"newPassword\": \"short\"}"
                          .formatted(PASSWORD)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
  }

  @Nested
  @DisplayName("csrf")
  class Csrf {

    @Test
    void shouldExposeCsrfTokenThroughEndpoint() throws Exception {
      MvcResult result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
      String token = JsonPath.read(result.getResponse().getContentAsString(), "$.token");
      String headerName = JsonPath.read(result.getResponse().getContentAsString(), "$.headerName");
      assertThat(token).isNotBlank();
      assertThat(headerName).isNotBlank();
    }

    @Test
    void shouldRejectStateChangingRequestWithoutCsrfToken() throws Exception {
      mvc.perform(post("/api/auth/logout").session(authenticatedSession()))
          .andExpect(status().isForbidden());
    }

    @Test
    void shouldAcceptStateChangingRequestWithCsrfToken() throws Exception {
      // The real token/cookie round-trip (XSRF-TOKEN cookie + X-XSRF-TOKEN header) is
      // validated against a running server; under MockMvc the security-test support swaps
      // the repository, so the csrf() request post-processor is the portable way to
      // simulate a browser sending the matching token.
      mvc.perform(post("/api/auth/logout").with(csrf()).session(authenticatedSession()))
          .andExpect(status().isNoContent());
    }
  }

  @Nested
  @DisplayName("seed")
  class Seed {

    @Test
    void shouldHaveSeededSingleOwnerWithHashedPassword() {
      assertThat(ownerRepository.count()).isEqualTo(1);
      Owner owner = ownerRepository.findByUsername(USERNAME).orElseThrow();
      assertThat(owner.getPasswordHash()).startsWith("$2");
      assertThat(owner.getPasswordHash()).isNotEqualTo(PASSWORD);
    }
  }
}
