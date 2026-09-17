package com.focusnagi.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimeConfig {

  private final AppProperties properties;

  public TimeConfig(AppProperties properties) {
    this.properties = properties;
  }

  /** System clock used for all server-side time computations (replaceable in tests). */
  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }

  /** Zone used to translate Instants into conceptual days/weeks/months for analytics. */
  @Bean
  ZoneId appZoneId() {
    return ZoneId.of(properties.timeZone());
  }

  @ConfigurationProperties("app")
  public record AppProperties(String timeZone, Cors cors, Swagger swagger) {
    public AppProperties {
      if (timeZone == null || timeZone.isBlank()) {
        timeZone = "UTC";
      }
      if (cors == null) {
        cors = new Cors("");
      }
      if (swagger == null) {
        swagger = new Swagger(false);
      }
    }

    public record Cors(String allowedOrigins) {}

    public record Swagger(boolean enabled) {}
  }
}
