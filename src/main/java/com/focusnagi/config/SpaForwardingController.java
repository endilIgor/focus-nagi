package com.focusnagi.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the SPA shell for direct loads/refreshes of client-side routes (e.g. GET /tarefas), which
 * otherwise have no matching static file and would 404. Scoped to the app's known screen paths
 * only, so unmatched /api/** requests keep returning a proper JSON 404.
 */
@Controller
public class SpaForwardingController {

  @GetMapping({
    "/login",
    "/hoje",
    "/foco",
    "/tarefas",
    "/projetos",
    "/metas",
    "/notas",
    "/diario",
    "/analytics"
  })
  String forwardToIndex() {
    return "forward:/index.html";
  }
}
