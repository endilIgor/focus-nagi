# Focus Nagi — execução da fase Analytics e saúde

## Fontes e autorização

Leia spec.md, plan.md e .hermes/plans/2026-10-10_112705-treino-alimentacao-analytics.md. Preserve o histórico v3; permissões antigas de publicação não autorizam publicação desta fase. Usuário autorizou todas as tarefas restantes sequenciais, sem confirmação por tarefa. Tarefas 1–4 prontas localmente, tarefa 4 verificada independentemente. UUID/modelo/limites aprovados no complemento de spec.md. Tarefa5 migration/CRUD SQL verificada localmente por Hermes (Worker329/329, frontend281/281, reviewer passed=true e gates). Tarefa6 API de treino verificada por Hermes (Worker416/416, frontend281/281, reviewer passed=true). Tarefa7 verificada por Hermes (Worker501/501, frontend281/281, typecheck/lint/build e diff-check0; fresh reviewer passed=true). Próxima: Tarefa8 API alimentação, bloqueada nesta tentativa por quota Claude Pro antes de testes/produção (proc_91051f7242af exit1; transcript .hermes/evidence/health-task8/claude.jsonl). Tarefas8–14 pendentes; sem retry automático ou fallback de implementador. Não refazer1–7. RED original5 preservado; não refazer tarefas verdes nem descartar testes pendentes para fabricar suíte verde.

## Papéis e execução

Claude Code CLI implementa produção; Hermes supervisiona, revisa e verifica. Login Claude Pro observado nesta retomada. Um único escritor neste checkout. Commits locais autorizados posteriormente em .hermes/commit-authorization.md, exclusivamente pelo parent principal após audit; supervisor e Claude não commitam. Sem push/deploy, provisionamento/migration remota, leitura de .env/credenciais ou dependências novas. Não inserir automaticamente conta real em migrations estruturais. Use identidades sintéticas em testes.

Cada handoff nomeia Tarefa N concreta. Ler arquivos/símbolos reais e seus consumidores. Definir contratos técnicos coerentes com padrões existentes antes do RED, registrando no checkpoint; decisões de negócio novas exigem esclarecimento. Testes primeiro e output RED original preservado em .hermes/evidence/health-taskN/, depois implementação mínima, GREEN, suite/gates e revisão antes da tarefa seguinte. Não enfraquecer assertions antigas. Mocks não comprovam persistência real. PGlite executa SQL real local, não serviço remoto. Não alterar outros projetos/processos para aliviar memória.

## Escopo e documentação

Tarefas/arquivos/aceite conforme plano da fase. Saúde não altera métricas/streak/diário/foco. Atualizar plan.md com estado/testes/limitações por tarefa é exceção documental explícita. Documentos e relatórios em português, identificadores em inglês. Preserve alterações locais herdadas. Execute builds no pacote correto e gate final Worker/frontend, além de QA navegador quando disponível. Se houver quota, recurso indisponível ou ambiguidade bloqueante, preserve mudanças e checkpoint verificável, não declare completo.
