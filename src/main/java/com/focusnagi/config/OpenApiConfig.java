package com.focusnagi.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

  @Bean
  OpenAPI focusNagiOpenAPI() {
    return new OpenAPI()
        .info(
            new Info()
                .title("Focus Nagi API")
                .description(
                    """
                    Single-user focus and productivity API.

                    Authentication is session-based: log in via POST /api/auth/login
                    (the session id travels in the FOCUS_SESSION cookie). All private
                    endpoints require that cookie. State-changing requests additionally
                    require the CSRF token obtained from GET /api/auth/csrf, sent in the
                    X-XSRF-TOKEN header together with the XSRF-TOKEN cookie.
                    """))
        .schemaRequirement(
            "session",
            new SecurityScheme()
                .type(SecurityScheme.Type.APIKEY)
                .in(SecurityScheme.In.COOKIE)
                .name("FOCUS_SESSION"));
  }
}
