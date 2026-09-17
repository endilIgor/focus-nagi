package com.focusnagi.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

class SpaIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;

  @Test
  void shouldServeTheSpaShellWithoutAuthentication() throws Exception {
    mvc.perform(get("/")).andExpect(status().isOk());
  }

  @Test
  void shouldForwardKnownClientRoutesToTheSpaShell() throws Exception {
    mvc.perform(get("/tarefas")).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
  }

  @Test
  void shouldKeepApiRoutesProtected() throws Exception {
    mvc.perform(get("/api/today")).andExpect(status().isUnauthorized());
  }
}
