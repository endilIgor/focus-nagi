package com.focusnagi.auth;

import com.focusnagi.common.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Clock;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

  private final AuthenticationManager authenticationManager;
  private final SecurityContextRepository securityContextRepository;
  private final OwnerRepository ownerRepository;
  private final PasswordEncoder passwordEncoder;
  private final LoginRateLimiter rateLimiter;
  private final Clock clock;

  public AuthService(
      AuthenticationManager authenticationManager,
      SecurityContextRepository securityContextRepository,
      OwnerRepository ownerRepository,
      PasswordEncoder passwordEncoder,
      LoginRateLimiter rateLimiter,
      Clock clock) {
    this.authenticationManager = authenticationManager;
    this.securityContextRepository = securityContextRepository;
    this.ownerRepository = ownerRepository;
    this.passwordEncoder = passwordEncoder;
    this.rateLimiter = rateLimiter;
    this.clock = clock;
  }

  public OwnerResponse login(
      LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
    String key = rateLimitKey(request.username(), httpRequest);
    rateLimiter.assertNotLocked(key);

    Authentication authentication;
    try {
      authentication =
          authenticationManager.authenticate(
              UsernamePasswordAuthenticationToken.unauthenticated(
                  request.username(), request.password()));
    } catch (BadCredentialsException ex) {
      rateLimiter.recordFailure(key);
      throw invalidCredentials();
    }
    rateLimiter.recordSuccess(key);
    establishSession(authentication, httpRequest, httpResponse);

    Owner owner = ownerByUsername(authentication.getName());
    return OwnerResponse.from(owner);
  }

  public void logout(HttpServletRequest request) {
    SecurityContextHolder.clearContext();
    HttpSession session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
  }

  public OwnerResponse current(Authentication authentication) {
    return OwnerResponse.from(ownerByUsername(authentication.getName()));
  }

  public void changePassword(Authentication authentication, ChangePasswordRequest request) {
    Owner owner = ownerByUsername(authentication.getName());
    if (!passwordEncoder.matches(request.currentPassword(), owner.getPasswordHash())) {
      throw invalidCredentials();
    }
    owner.changePassword(passwordEncoder.encode(request.newPassword()), clock.instant());
    ownerRepository.save(owner);
  }

  private void establishSession(
      Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
    // Rotate the session id on privilege change to prevent session fixation.
    request.getSession(true);
    request.changeSessionId();
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(authentication);
    SecurityContextHolder.setContext(context);
    securityContextRepository.saveContext(context, request, response);
  }

  private Owner ownerByUsername(String username) {
    return ownerRepository
        .findByUsername(username)
        .orElseThrow(
            () ->
                new DomainException(
                    "INVALID_CREDENTIALS",
                    "Invalid username or password.",
                    HttpStatus.UNAUTHORIZED));
  }

  private DomainException invalidCredentials() {
    return new DomainException(
        "INVALID_CREDENTIALS", "Invalid username or password.", HttpStatus.UNAUTHORIZED);
  }

  private String rateLimitKey(String username, HttpServletRequest request) {
    String ip = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    return username.toLowerCase() + "|" + ip;
  }
}
