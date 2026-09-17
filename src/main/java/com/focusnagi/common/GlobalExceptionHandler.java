package com.focusnagi.common;

import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(DomainException.class)
  ResponseEntity<ApiError> handleDomain(DomainException ex) {
    return ResponseEntity.status(ex.status())
        .body(ApiError.of(ex.code(), ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
    String message =
        ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + " " + e.getDefaultMessage())
            .distinct()
            .collect(Collectors.joining("; "));
    return badRequest("VALIDATION_ERROR", message.isBlank() ? "Invalid request body." : message);
  }

  @ExceptionHandler(BindException.class)
  ResponseEntity<ApiError> handleBind(BindException ex) {
    String message =
        ex.getFieldErrors().stream()
            .map(e -> e.getField() + " " + e.getDefaultMessage())
            .distinct()
            .collect(Collectors.joining("; "));
    return badRequest("VALIDATION_ERROR", message.isBlank() ? "Invalid parameters." : message);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  ResponseEntity<ApiError> handleConstraint(ConstraintViolationException ex) {
    return badRequest("VALIDATION_ERROR", "Invalid request parameters.");
  }

  @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
  ResponseEntity<ApiError> handleMalformed(Exception ex) {
    return badRequest("MALFORMED_REQUEST", "Malformed request.");
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ApiError.of("NOT_FOUND", "Resource not found."));
  }

  @ExceptionHandler({AuthenticationException.class, AccessDeniedException.class})
  ResponseEntity<ApiError> handleAuth(Exception ex) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(ApiError.of("UNAUTHENTICATED", "Authentication required."));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> handleUnexpected(Exception ex) {
    log.error("Unexpected error", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("INTERNAL_ERROR", "Unexpected server error."));
  }

  private ResponseEntity<ApiError> badRequest(String code, String message) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiError.of(code, message));
  }
}
