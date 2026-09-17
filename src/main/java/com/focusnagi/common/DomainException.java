package com.focusnagi.common;

import org.springframework.http.HttpStatus;

/** Expected business/validation failure rendered as a consistent API error body. */
public class DomainException extends RuntimeException {

  private final String code;
  private final HttpStatus status;

  public DomainException(String code, String message, HttpStatus status) {
    super(message);
    this.code = code;
    this.status = status;
  }

  public static DomainException notFound(String code, String message) {
    return new DomainException(code, message, HttpStatus.NOT_FOUND);
  }

  public static DomainException conflict(String code, String message) {
    return new DomainException(code, message, HttpStatus.CONFLICT);
  }

  public static DomainException badRequest(String code, String message) {
    return new DomainException(code, message, HttpStatus.BAD_REQUEST);
  }

  public String code() {
    return code;
  }

  public HttpStatus status() {
    return status;
  }
}
