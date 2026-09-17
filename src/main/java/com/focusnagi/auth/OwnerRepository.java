package com.focusnagi.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnerRepository extends JpaRepository<Owner, Long> {

  Optional<Owner> findByUsername(String username);
}
