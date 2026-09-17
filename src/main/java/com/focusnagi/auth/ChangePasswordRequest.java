package com.focusnagi.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank(message = "is required") String currentPassword,
    @NotBlank(message = "is required") @Size(min = 8, max = 72, message = "must be 8-72 characters")
        String newPassword) {}
