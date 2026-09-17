package com.focusnagi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FocusNagiApplication {

  public static void main(String[] args) {
    SpringApplication.run(FocusNagiApplication.class, args);
  }
}
