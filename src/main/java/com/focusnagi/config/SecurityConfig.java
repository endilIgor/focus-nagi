package com.focusnagi.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.focusnagi.auth.LoginProperties;
import com.focusnagi.auth.LoginRateLimiter;
import com.focusnagi.common.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

  private static final String[] PUBLIC_ENDPOINTS = {
    "/api/auth/login", "/api/auth/csrf", "/actuator/health", "/actuator/info"
  };

  // The compiled SPA shell (static/index.html + hashed assets) carries no secrets and must be
  // publicly loadable so the browser can render the login screen and client-side routes before
  // any session exists. All actual data still flows through /api/** behind authentication.
  private static final String[] STATIC_ENDPOINTS = {
    "/",
    "/index.html",
    "/assets/**",
    "/favicon.ico",
    "/login",
    "/hoje",
    "/foco",
    "/tarefas",
    "/projetos",
    "/metas",
    "/notas",
    "/diario",
    "/analytics"
  };

  private static final String[] SWAGGER_ENDPOINTS = {
    "/swagger-ui.html", "/swagger-ui/**", "/api/openapi", "/api/openapi/**"
  };

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  org.springframework.security.web.context.SecurityContextRepository securityContextRepository() {
    return new org.springframework.security.web.context.HttpSessionSecurityContextRepository();
  }

  @Bean
  org.springframework.security.authentication.AuthenticationManager authenticationManager(
      org.springframework.security.config.annotation.authentication.configuration
              .AuthenticationConfiguration
          configuration)
      throws Exception {
    return configuration.getAuthenticationManager();
  }

  @Bean
  LoginRateLimiter loginRateLimiter(LoginProperties properties, Clock clock) {
    return new LoginRateLimiter(properties, clock);
  }

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http, TimeConfig.AppProperties properties, ObjectMapper objectMapper)
      throws Exception {
    http.csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .authorizeHttpRequests(
            auth -> {
              auth.requestMatchers(PUBLIC_ENDPOINTS).permitAll();
              auth.requestMatchers(STATIC_ENDPOINTS).permitAll();
              if (properties.swagger().enabled()) {
                auth.requestMatchers(SWAGGER_ENDPOINTS).permitAll();
              }
              auth.anyRequest().authenticated();
            })
        .exceptionHandling(
            handling ->
                handling
                    .authenticationEntryPoint(jsonEntryPoint(objectMapper))
                    .accessDeniedHandler(jsonAccessDeniedHandler(objectMapper)))
        .formLogin(form -> form.disable())
        .httpBasic(basic -> basic.disable())
        .logout(logout -> logout.disable());

    if (properties.cors().allowedOrigins() != null
        && !properties.cors().allowedOrigins().isBlank()) {
      http.cors(cors -> cors.configurationSource(corsSource(properties.cors().allowedOrigins())));
      log.info("CORS enabled for origins: {}", properties.cors().allowedOrigins());
    }
    return http.build();
  }

  private CorsConfigurationSource corsSource(String allowedOrigins) {
    CorsConfiguration config = new CorsConfiguration();
    // Explicit origins only; credentials are never combined with wildcards.
    config.setAllowedOriginPatterns(Arrays.asList(allowedOrigins.split(",")));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  private AuthenticationEntryPoint jsonEntryPoint(ObjectMapper objectMapper) {
    return (request, response, authException) ->
        writeError(response, objectMapper, 401, "UNAUTHENTICATED", "Authentication required.");
  }

  private AccessDeniedHandler jsonAccessDeniedHandler(ObjectMapper objectMapper) {
    return (request, response, accessDeniedException) ->
        writeError(response, objectMapper, 403, "ACCESS_DENIED", "Access denied.");
  }

  private void writeError(
      HttpServletResponse response,
      ObjectMapper objectMapper,
      int status,
      String code,
      String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getWriter(), ApiError.of(code, message));
  }
}
