package com.focusnagi.today;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/today")
public class TodayController {

  private final TodayService todayService;

  public TodayController(TodayService todayService) {
    this.todayService = todayService;
  }

  @GetMapping
  TodayResponse today() {
    return todayService.today();
  }
}
