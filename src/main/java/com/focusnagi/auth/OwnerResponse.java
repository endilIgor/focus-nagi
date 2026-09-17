package com.focusnagi.auth;

import java.time.Instant;

public record OwnerResponse(Long id, String username, Instant createdAt) {

  static OwnerResponse from(Owner owner) {
    return new OwnerResponse(owner.getId(), owner.getUsername(), owner.getCreatedAt());
  }
}
