package com.focusnagi.auth;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Idempotent seed of the single application owner, controlled by configuration only. */
@Component
public class OwnerSeeder implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(OwnerSeeder.class);

  private final OwnerRepository ownerRepository;
  private final PasswordEncoder passwordEncoder;
  private final OwnerProperties properties;
  private final Clock clock;

  public OwnerSeeder(
      OwnerRepository ownerRepository,
      PasswordEncoder passwordEncoder,
      OwnerProperties properties,
      Clock clock) {
    this.ownerRepository = ownerRepository;
    this.passwordEncoder = passwordEncoder;
    this.properties = properties;
    this.clock = clock;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (ownerRepository.count() > 0) {
      return;
    }
    String password = properties.password();
    if (password == null || password.isBlank()) {
      throw new IllegalStateException(
          "No owner exists and APP_OWNER_PASSWORD is not set. Refusing to start.");
    }
    ownerRepository.save(
        new Owner(properties.username(), passwordEncoder.encode(password), clock.instant()));
    log.info("Seeded owner account '{}'", properties.username());
  }
}
