package com.focusnagi.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.login")
public record LoginProperties(int maxFailures, int lockMinutes) {

  public LoginProperties {
    if (maxFailures <= 0) {
      maxFailures = 5;
    }
    if (lockMinutes <= 0) {
      lockMinutes = 5;
    }
  }
}
