package com.focusnagi.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

@Configuration
public class OwnerUserDetailsService {

  @Bean
  UserDetailsService userDetailsService(OwnerRepository ownerRepository) {
    return username -> {
      Owner owner =
          ownerRepository
              .findByUsername(username)
              .orElseThrow(() -> new UsernameNotFoundException("User not found"));
      return User.withUsername(owner.getUsername())
          .password(owner.getPasswordHash())
          .authorities("OWNER")
          .build();
    };
  }
}
