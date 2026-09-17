import { ApiRequestError } from "../api/client";

const KNOWN_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Dados inválidos. Verifique os campos.",
  UNAUTHENTICATED: "Sessão expirada. Faça login novamente.",
  ACCESS_DENIED: "Acesso negado.",
  TASK_NOT_FOUND: "Tarefa não encontrada.",
  PROJECT_NOT_FOUND: "Projeto não encontrado.",
  GOAL_NOT_FOUND: "Meta não encontrada.",
  NOTE_NOT_FOUND: "Nota não encontrada.",
  SUBTASK_NOT_FOUND: "Subtarefa não encontrada.",
  JOURNAL_ENTRY_NOT_FOUND: "Entrada de diário não encontrada.",
  FOCUS_SESSION_NOT_FOUND: "Sessão de foco não encontrada.",
  INVALID_TASK_STATE: "Transição de status inválida para esta tarefa.",
  INVALID_PROJECT_STATE: "Transição de status inválida para este projeto.",
  INVALID_GOAL_STATE: "Transição de status inválida para esta meta.",
  INVALID_FOCUS_SESSION_STATE: "Transição de status inválida para esta sessão.",
  FOCUS_SESSION_ALREADY_RUNNING: "Já existe uma sessão de foco ativa.",
  FOCUS_SESSION_PROJECT_MISMATCH: "O projeto informado não corresponde ao projeto da tarefa.",
  FOCUS_SESSION_CONCURRENT_MODIFICATION: "A sessão foi alterada em outro lugar. Recarregue e tente de novo.",
  TASK_HAS_FOCUS_SESSIONS: "Esta tarefa tem sessões de foco registradas e não pode ser excluída.",
  PROJECT_INVALID_DATES: "O prazo não pode ser anterior à data de início.",
  GOAL_INVALID_DATES: "A data final não pode ser anterior à data de início.",
  JOURNAL_INVALID_RANGE: "Intervalo de datas inválido.",
  JOURNAL_FUTURE_DATE: "A data da entrada não pode ser no futuro.",
  LOGIN_LOCKED: "Muitas tentativas. Aguarde alguns minutos.",
  INVALID_CREDENTIALS: "Usuário ou senha incorretos.",
};

export function describeApiError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return KNOWN_MESSAGES[err.code] ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Ocorreu um erro inesperado.";
}
