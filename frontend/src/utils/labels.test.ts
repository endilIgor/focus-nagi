import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PERIOD_LABEL,
  FOCUS_SESSION_STATUS_LABEL,
  GOAL_PERIOD_LABEL,
  GOAL_STATUS_LABEL,
  GOAL_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "./labels";

describe("enum labels", () => {
  it("covers every task priority with a non-empty label", () => {
    expect(Object.keys(TASK_PRIORITY_LABEL).sort()).toEqual(["HIGH", "LOW", "MEDIUM"]);
    expect(TASK_PRIORITY_LABEL.LOW).toBe("Baixa");
    expect(TASK_PRIORITY_LABEL.MEDIUM).toBe("Média");
    expect(TASK_PRIORITY_LABEL.HIGH).toBe("Alta");
  });

  it("covers every goal type with a non-empty label", () => {
    expect(Object.keys(GOAL_TYPE_LABEL).sort()).toEqual([
      "FOCUS_MINUTES",
      "FOCUS_SESSIONS",
      "TASKS_COMPLETED",
    ]);
    for (const label of Object.values(GOAL_TYPE_LABEL)) {
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_/);
    }
  });

  it("covers every goal period with a non-empty label", () => {
    expect(Object.keys(GOAL_PERIOD_LABEL).sort()).toEqual(["CUSTOM", "DAILY", "MONTHLY", "WEEKLY"]);
    expect(GOAL_PERIOD_LABEL.DAILY).toBe("Diária");
    expect(GOAL_PERIOD_LABEL.WEEKLY).toBe("Semanal");
    expect(GOAL_PERIOD_LABEL.MONTHLY).toBe("Mensal");
    expect(GOAL_PERIOD_LABEL.CUSTOM).toBe("Personalizada");
  });

  it("covers every analytics period with a non-empty label", () => {
    expect(Object.keys(ANALYTICS_PERIOD_LABEL).sort()).toEqual(["MONTH", "TODAY", "WEEK"]);
    expect(ANALYTICS_PERIOD_LABEL.TODAY).toBe("Hoje");
    expect(ANALYTICS_PERIOD_LABEL.WEEK).toBe("Semana");
    expect(ANALYTICS_PERIOD_LABEL.MONTH).toBe("Mês");
  });

  it("translates every visible status enum", () => {
    expect(Object.keys(TASK_STATUS_LABEL).sort()).toEqual(["CANCELLED", "COMPLETED", "IN_PROGRESS", "TODO"]);
    expect(Object.keys(PROJECT_STATUS_LABEL).sort()).toEqual(["ACTIVE", "ARCHIVED", "COMPLETED"]);
    expect(Object.keys(GOAL_STATUS_LABEL).sort()).toEqual(["ACTIVE", "ARCHIVED", "COMPLETED"]);
    expect(Object.keys(FOCUS_SESSION_STATUS_LABEL).sort()).toEqual(["CANCELLED", "COMPLETED", "PAUSED", "RUNNING"]);
    for (const label of [
      ...Object.values(TASK_STATUS_LABEL),
      ...Object.values(PROJECT_STATUS_LABEL),
      ...Object.values(GOAL_STATUS_LABEL),
      ...Object.values(FOCUS_SESSION_STATUS_LABEL),
    ]) {
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_/);
    }
  });
});
