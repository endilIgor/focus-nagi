package com.focusnagi.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.owner")
public record OwnerProperties(String username, String password) {

  public OwnerProperties {
    if (username == null || username.isBlank()) {
      username = "owner";
    }
  }
}
