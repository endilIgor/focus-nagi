import type {
  AnalyticsPeriod,
  FocusSessionStatus,
  GoalPeriod,
  GoalStatus,
  GoalType,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "../api/types";

/** Visible PT-BR labels for API enums. Keys are the exact wire values — never send the
 * labels to the API; map back through the enum type before building a request. */

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  FOCUS_MINUTES: "Minutos focados",
  FOCUS_SESSIONS: "Sessões de foco",
  TASKS_COMPLETED: "Tarefas concluídas",
};

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  DAILY: "Diária",
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  CUSTOM: "Personalizada",
};

export const ANALYTICS_PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  TODAY: "Hoje",
  WEEK: "Semana",
  MONTH: "Mês",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  ARCHIVED: "Arquivado",
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  ACTIVE: "Ativa",
  COMPLETED: "Concluída",
  ARCHIVED: "Arquivada",
};

export const FOCUS_SESSION_STATUS_LABEL: Record<FocusSessionStatus, string> = {
  RUNNING: "Em execução",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};
