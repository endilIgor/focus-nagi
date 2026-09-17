package com.focusnagi.auth;

public record CsrfResponse(String headerName, String parameterName, String token) {}
