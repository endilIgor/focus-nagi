# Plano de implementação — Focus Nagi v3

## Continuação atual — autorização e fronteiras

Nova autorização: proprietário pediu “faz vc mesmo agora” após quotaT12. Takeover GPT/Hermes para review12, correções se necessárias,13/14 sequenciais com TDD/gates/review e commits locais parent. Sem retryClaude/credentialschange/remoto/publicação/depsnovas. Preservar draftT12 e REDs, não repetir1–11. Próximo passo review12 e baseline independente antes liberar13; autorização supersede pausa/executorClaude históricos abaixo.

T12 commitda76473; fresh reviewGPTsuplementar approved/hashesunchanged confirmado. T13 concluída/reviewfreshGPTpassedtrue, semblockers: rotas /treino /alimentacao sobRequireAuth e guardstrictcapability===true; URLdeniednão montahealthpages, navconditional7,count/indexvariável,responsivo, timer/logout unchanged. REDroutes3AssertionError14pass/nav3AssertionError23pass preproduction; denialcasesjáverdes=regressão, revocationREDfalhainitialmountnão transição. Gates parent frontend414/414, Worker580/580, typecheck/lintWorker/build/diff0, integrado124/124. Chromiumreal syntheticAPI/auth: links/textgeométrico e dot1440/390/320, CRUDforms/confirmations/recarga mockstate, keyboardtouch/reducedmotion, denieddirectURLssemhealthrequests; sourcesruntimeverificados nãoautenticaçãoremota. QA14 permanece fechamento local/comprovaçãopersistência e relatório; semdeploy/migrationremota. Evidências health-task13/gpt-review.json/gpt-final-gates.json e health-task14/browser-preflight/health-final/report.json/edge-cases/report.json.

T12 concluída localmente por integração parent: produçãoClaudepreservada, reviewGPTparent independente do coder semP1/P2, nova baseline alvo26/26/frontend388/388/Worker580/580,typecheck/lintWorker/build/diff0. Evidência health-task12/gpt-parent-review.md e gpt-baseline-*. Ainda sembrowser/remoteproof, cabe14. T13 testespreparadosRED3AssertionError/14pass semprodução; essa pendênciafutura permanececheckout e nãointegra commit12, semalegarworkingtreeverde. Implementação13 liberada apóscommit12; gatefull13/review antes14. Subagentreview12suplementar emexecução, nãoafirmarverdictantesretorno.

Estado mais recente: T11 commit local d1596a7 concluída. T12 implementada draftCRUD apósREDsS1–S3, testesS4regressão salvos, mas quota Claude real429 usage_limit_reached/statusrejected interrompeu writer proc_6dfdcc3a3eb5 exit1. Sem freshreview12/aprovação/commit de fontes12; T13/14 não iniciadas nesta continuação. Parent verificou Nutrition26/26, frontend388/388, Worker580/580,typecheck/lintWorker/builds/diff0, ledger health-task12/hermes-final-gates.json; mocks/SQLlocal nãoSupabase remoto. Próximo passo obrigatório review12 após recursos/autorização, sem retry/fallback automático nem avançar13. Checkpoint health-task12/hermes-quota-checkpoint.md. S4verde originalmente = regressão; S1RED estrutural6, S2matcherNull6+6passnãoAssertionErrortipado, S3AssertionError6+12pass; stdout/XML originais préprodução preservados. T12files novos não versionados; evidência local não versionada; nenhum escritor ativo desta supervisão. Sem publicação/depsnovas/credentialschange.

Checkpoint atual: T11 concluída/revisada/verificada localmente. Fresh Claude review passed=true sem blockers após correção de refetch/cache da rotina excluída. RED de correção executado parent Hermes antes fix Claude:2AssertionError47pass; GREEN parent49/49. Gates parent frontend362/362, Worker580/580, typecheck/lint/build/diff0. Evidências health-task11/hermes-final-gates.json, hermes-fix-red*, claude-final-review.jsonl; relatório claude-fix-implementation-report.md. Testes de isolamento já verdes são regressões, não REDs fabricados; logs GPT originais preservados com limitações da revisão. QA navegador/persistência integrada fica T14, sem remoto verificado. Próxima12 (quatro refeições), seguida13/14 por Claude CLI, parent review/gates/commits locais exclusivos; sem publicação/dependências novas. Se captura RED negada, escritor encerra e parent captura pré-produção, sem bypass.

Atualização de autoridade: proprietário solicitou “pode mandar o claude continuar o projeto”. Retomada pelo Claude Code CLI com conta API atual já autorizada, sem mudança de credenciais. Supersede GPT exclusivo/no-retry histórico apenas para esta nova tentativa explícita. Draft T11 preservado; parent repetiu TrainingPage45/45 e git diff --check exit0 nesta retomada. Gates herdados T11 registram exit0, mas review independente ainda pendente; próximo passo concreto revisão11, correções TDD se necessárias e gates antes12. Não refazer1–10 nem fabricar novos REDs do comportamento herdado verde. Continuação12–14 sequencial com um escritor e gates por tarefa; commit local parent após audit; sem publicação, remoto ou dependências novas. Nenhum processo Claude/Vitest ativo observado antes do lançamento. Disponibilidade de quota será determinada pela execução, não pelo login.

O usuário voltou a autorizar “pode continuar todas as tarefas”, agora na sessão GPT/OpenAI Codex. Mantida a exceção GPT/Hermes para T11–14 e os commits locais exclusivos do parent após review/gates. Sem retry Claude, publicação, migração remota, credenciais ou dependências novas. T1–10 preservadas. Ao retomar, T11 já tinha escritor GPT ativo (`deleg_1cd3f039`); não foi criado escritor concorrente. Baseline parcial observada: TrainingPage 32/36, quatro falhas esperadas em edição/exclusão ainda ausentes. Essa execução não é gate final nem substitui os REDs originais registrados pelo escritor. Preparação independente de QA14 pode ler fontes e exercitar harnesses locais, sem avançar a implementação12/13 antes do gate11.

Base: spec.md aprovado nesta conversa; cancelamentos não reiniciam o período ocioso. Executar tarefas na ordem, com teste RED antes da implementação de cada comportamento e revisão independente. Código por Claude Code CLI; Hermes integra, verifica e publica.

## Arquitetura e restrições

Frontend React/TypeScript, CSS modules e TanStack Query existentes. Sem dependências novas, alterações de backend/migrations ou runtime support.js. A fonte de design está em /tmp/focus-nagi-design-v3/Focus Nagi v3.dc.html e seu support.js foi lido apenas para compreender o protótipo. Não transportar dados fictícios.

Usar um componente decorativo de partículas com RAF/listeners limpos, suporte a reduced motion, controles não bloqueados e renderização estática quando movimento reduzido. Adaptar geometria real do robô/anel da referência, não substituí-la por ilustração inventada.

A API de histórico aceita status=COMPLETED e retorna sessões por startedAt desc. Como existe apenas uma sessão ativa por usuário, a última sessão concluída também é a mais recente nessa ordem. Consultar status=COMPLETED, page=0, size=1 em chave compartilhada própria. Atualizar imediatamente com a resposta de finish, cancelando consultas em voo antes da escrita; cancel não escreve nessa chave. Usar endedAt do servidor, não relógio/hora local como base.

Mini menu: usar controle acessível com presets e formulário de minutos personalizados; validar inteiro no intervalo efetivamente aceito pelo backend (ler domain/routes/migration antes). Não permitir seleção RUNNING/PAUSED/início pendente. Escape devolve foco, seleção fecha e atualiza minutos/payload.

## Tarefas

### 1 — Contador ocioso baseado na última sessão COMPLETED

Arquivos: frontend/src/hooks/useFocusSession.ts, layout/AppShell.tsx, pages/FocusPage.tsx e testes correspondentes; helper/testes adicionais de duração se necessário.

- Primeiro escrever regressões e observar RED: histórico COMPLETED filtrado, remount usa endedAt, manual/auto finish atualiza base imediatamente, cancel preserva base, sem histórico=00:00, futuro/inválido=00:00, mais de uma hora, RUNNING/PAUSED preservados, request histórico atrasado não sobrescreve fim recente.
- Implementar consulta/cache compartilhados, cálculo seguro e formatação de duração.
- Não alterar contrato nem banco.
- Verificação: npm test -- src/layout/AppShell.test.tsx src/pages/FocusPage.test.tsx src/hooks/useFocusSession.test.ts; npm test; npm run typecheck.

### 2 — Mini menu de duração

Arquivos: frontend/src/components/FocusDurationMenu.tsx e CSS/testes, pages/FocusPage.tsx e testes.

- Ler limites reais do backend. Primeiro testes RED para abrir/fechar, Escape/foco, presets, custom válido/payload, inválidos e bloqueio durante sessão/início pendente.
- Implementar controle sem dependência nova e mantendo default=50/presets existentes.
- Verificação: npm test -- src/components/FocusDurationMenu.test.tsx src/pages/FocusPage.test.tsx; npm test; npm run typecheck.

### 3 — Sistema visual, partículas, login e cabeçalho

Arquivos: frontend/index.html, src/styles/global.css, theme/themes.ts (somente tokens necessários), componentes decorativos CSS/TSX/testes, auth/LoginPage.tsx e CSS/testes, layout/AppShell.tsx e CSS/testes.

- Ler todos os estilos atuais e fonte de design, especialmente geometria/motion da referência.
- Primeiro testes RED para presença/acessibilidade da composição, integração decorativa e cleanup/reduced motion; preservar testes de autenticação existentes (adaptar labels intencionalmente sem enfraquecer assertions).
- Implementar fundo, tokens, Geist/Geist Mono, login, marca triangular, cabeçalho flutuante e nav. Preservar estado de favicon/timer/logout/conclusão automática; card e partículas não ocultam form.
- Verificação: npm test; npm run typecheck; npm run build. Browser smoke desktop/mobile/reduced motion.

### 4 — Hoje, Foco, Checklist, Diário e Analytics

Arquivos: frontend/src/pages/{Today,Focus,Checklist,Journal,Analytics}Page.tsx, CSS/testes e componentes diretamente necessários.

- Primeiro testes RED para integração do visual (hero/âncora do robô, âncora do anel de foco, seções/composição) e qualquer novo comportamento de UI.
- Adaptar layouts da referência, preservando dados, mutations, histórico, journal append-only, seletores analytics de semana/mês e checklist por data. Não criar métricas inventadas. Não substituir composição por mero recolor.
- Verificação: npm test; npm run typecheck; npm run build. Browser smoke nas cinco rotas, mobile e ações de duração (dados simulados apenas em smoke documentado, não produção).

### 5 — Revisão independente e publicação

- Hermes inspeciona diff, outputs RED reais e comandos; Claude revisor somente leitura avalia fidelidade/UX e bugs por severidade. Corrigir bloqueadores via Claude com regressões.
- Gates: git diff --check; frontend npm test && npm run typecheck && npm run build; worker npm run check como regressão de contrato; smoke navegador/HTTP.
- Descobrir projeto/remoto/produção e capacidades reais antes de publicar. Reutilizar Vercel existente e config/variáveis já provisionadas; não ler/imprimir credenciais nem criar plataforma paralela. Worker/Supabase não precisam de publicação se não mudaram.
- Commit de fontes/documentação verificados com endilIgor <kitsunetech6@gmail.com>, sem trailers/assinaturas de IA; push normal main como etapa de deploy Git-triggered autorizada. Verificar conteúdo servido/bundle novo em https://focus-nagi.vercel.app e /api/health; consultar metadata Vercel quando acessível. Se falhar autenticação/publicação, reportar bloqueio real, sem simular sucesso.

## Estado

### Retomada — nova fase, tarefa 1

Autorização atual do proprietário: executar todas as tarefas restantes da nova fase, em ordem, pelo Claude Code CLI com a conta API atual e revisão/verificação independente Hermes por tarefa. Essa autorização não resolve decisões explicitamente pendentes (habilitação UUID e contratos de saúde), não autoriza dependências novas, enfraquecer assertions, ações destrutivas, commit/push/deploy nem migrações remotas. Avançar nas tarefas 2–3; fechar os contratos e a identidade antes da tarefa 4. Preservar checkpoints por tarefa; sem escritores concorrentes neste checkout.

- Referência: `.hermes/plans/2026-10-10_112705-treino-alimentacao-analytics.md`, tarefa 1 (AC01); especificação do recorte em `spec.md`. Não confundir esta numeração com as tarefas v3 abaixo.
- Arquivos: `frontend/src/pages/AnalyticsPage.tsx` e `.test.tsx`; helper específico `frontend/src/utils/focusDuration.ts` e `.test.ts` somente se necessário. Exceção documental: atualizar este estado após verificação.
- Testes primeiro: 90/60/30/0 minutos, >24h, detalhes e alturas relativas. Preservar assertions existentes, exceto o rótulo intencionalmente alterado de `600` para `10h` no gráfico diário.
- Gates: teste alvo (incluindo helper se criado), `npm test`, `npm run typecheck`, `npm run build` no frontend e `git diff --check`.
- Estado: tarefa 1 concluída e revisada. Baseline Analytics 13/13; RED Vitest 3 falhas/12 verdes (15), preservado em `.hermes/evidence/analytics-task1/red-junit.xml`; `red.log` é transcrição parcial, não stdout integral. Claude Code implementou somente formatação local dos rótulos/detalhes diários, com duas regressões novas e ajuste intencional de `600` para `10h`.
- Verificação independente Hermes: `npm test` 252/252 (24 arquivos), `npm run typecheck`, `npm run build` e `git diff --check` passaram. Chromium real com APIs/autenticação simuladas em 1440/390/320px, filtros Semana/Mês: rótulos corretos, nenhuma exceção JavaScript e nenhum overflow da página; no mês alguns rótulos quebram em duas linhas dentro da coluna. Isso não verifica autenticação/persistência de produção nem um mês histórico completo de 31 dias.
- Evidências: `.hermes/evidence/analytics-task1/`; Claude Code CLI autorizado com a conta API atual. Sem commit/push/deploy nesta retomada. Próxima tarefa pendente: 2, calendário e níveis fixos do mapa mensal.

### Nova fase — tarefas restantes

- Tarefa 2 concluída/revisada: helpers em `frontend/src/utils/analytics.ts`, 17 regressões novas; alvo analytics/date 31/31, suíte independente Hermes 269/269, typecheck/build/diff check verdes. RED original Vitest 17 falhas/14 verdes: funções ausentes e uma assertion de legenda ausente; não descrever todas as falhas como assertion-level. Evidências `.hermes/evidence/analytics-task2/`.
- Tarefa 3 concluída/revisada: mapa mensal independente de filtros/gráficos, grade segunda–domingo com padding e futuro explícito, níveis fixos, detalhes acessíveis e loading/erro/retry. Queries compartilham o namespace/range existente. Escopo AnalyticsPage TSX/CSS/testes, sem alterar contratos da API. RED original 12 falhas/38 verdes (50); revisão Claude somente leitura encontrou dois problemas de UX confirmados em Chromium: rótulos do mês sobrepostos e anel de seleção futura apagado. Correções mínimas via Claude: colunas com mínimo 64px/nowrap e rolagem interna do painel; regra de seleção depois do reset futuro. Duas regressões CSS novas com RED, preservando demais assertions.
- Verificação independente final Hermes: frontend `npm test` 281/281 (24 arquivos), `npm run typecheck`, `npm run build` e `git diff --check` verdes. Chromium real com autenticação/APIs simuladas: Enter, toque nativo no futuro, filtros preservando mapa e oito meses de março–outubro em 1440/390/320px, células quadradas/linhas alinhadas/sem overflow da página; reduced motion ativo. Regressão visual RED/GREEN confirmou anel futuro branco de 4px após transição e rótulos mensais inteiros dentro das colunas. Não comprova dados/login de produção. Evidências `.hermes/evidence/analytics-task3/`.
- Gate adicional Worker não passou nesta execução: `npm run check` excedeu 180s; nova tentativa e teste serial tiveram processos encerrados por SIGKILL, incluindo platform/data-migration; build separado excedeu 120s. Sem alterações no Worker. Memória disponível baixa e swap cheio foram observados, mas causalidade não comprovada; preservar logs e reexecutar gate antes de finalizar integração da fase. Não marcar suite Worker como verde nem alterar testes/infra de outros projetos para contornar.
- Tarefas 4–13 aguardam confirmação explícita da habilitação privada, UUID do proprietário e limites/modelo propostos. Pergunta sem resposta não aprova decisões. Não aplicar configuração/migração remota nem usar UUID fictício como proprietário real.
- Tarefa 14 pendente; publicação permanece fora da autorização atual.

ESTADO_ATUAL: tarefas 1–3 da nova fase prontas localmente; nenhuma tarefa 4–13 iniciada. Nesta retomada, o proprietário respondeu “sim” à habilitação em tabela privada sem auto-habilitação e ao modelo/limites propostos: rotinas com dias opcionais; exercícios por repetições ou duração; nomes até 150 caracteres, observações até 2000, séries/repetições 1..1000, duração 1..86400 segundos; alimentos nas quatro refeições com quantidade textual opcional até 150 caracteres. O UUID da conta Supabase Auth continua pendente: pergunta específica sem resposta. Essa aprovação substitui a pendência de modelo/habilitação acima, mas não a pré-condição de identidade da tarefa 4. Não usar UUID fictício em configuração real. Nenhum agente escritor em andamento. Sem commit/push/deploy/migração remota. Recomeçar pela tarefa 4 após receber UUID; ler spec/plan/plano da fase e exigir RED/GREEN por tarefa.

A atualização deste estado por tarefa é exceção explícita ao escopo de arquivos de cada tarefa.

### Liberação das tarefas 4–14

O usuário forneceu o UUID `731f2e70-9d17-4b31-bed2-badde776ef95` após aprovar habilitação/modelo/limites. A pré-condição de identidade declarada está resolvida; não foi feita consulta remota da conta. Este checkpoint substitui ESTADO_ATUAL acima: próxima tarefa 4, seguida sequencialmente até 14, com RED/GREEN, revisão e gates por tarefa. `spec.md` contém escopo aprovado e contrato `healthAccess: boolean` em `/api/auth/me`. CLI Claude Pro confirmada nesta retomada. Habilitação real é ação administrativa separada: não inserir automaticamente o UUID em migration estrutural. Sem commit/push/deploy/migração remota. Preservar alterações de Analytics. Nenhum teste novo executado no momento desta liberação.

### Nova fase — Tarefa 4 (habilitação pessoal de saúde)

- Estado: implementada localmente por Claude Code em 2026-10-10, **aguardando verificação independente Hermes**; não declarada concluída. Tarefa 5 não iniciada.
- Contratos registrados antes do RED em `.hermes/evidence/health-task4/contracts.md`: tabela privada `app_private.health_access` (RLS sem policies, sem grants a clientes, nenhuma conta inserida pela migration), helpers `app_private.has_health_access(uuid)` e `app_private.require_health_access()` (guarda compartilhada, `HEALTH_ACCESS_DENIED` → 403), RPC `public.api_health_access()` sem argumentos; `GET /api/auth/me` → `{ id, email, healthAccess }`, `healthAccess` só `true` se o banco retornar exatamente `true`; erro/resultado inválido ⇒ `false` com 200.
- Arquivos: nova migration `supabase/migrations/20261010120000_personal_health_access.sql`, novo `worker/test/health-access.test.ts` (34 testes), `worker/src/routes/auth.ts`, `worker/src/errors.ts`, `frontend/src/api/types.ts` (tipo apenas); fixture estrita de `/auth/me` em `worker/test/platform.test.ts` passou a incluir `healthAccess: false` (novo contrato, ainda `toEqual`).
- RED original (`red-stdout.log`, `red-junit.xml`): 1 falha de assertion (platform `/auth/me`) + suíte health-access falhou no `beforeAll` por tabela inexistente, 34 skipped — RED de pré-condição, não falhas individuais.
- GREEN/gates do implementador (serial, `--maxWorkers=1 --no-file-parallelism`, 512MB): alvo health-access/auth/database/platform 66/66; Worker typecheck e lint ok; suíte Worker completa 208/208 (16 arquivos); `npm run build` dry-run ok; frontend typecheck ok e testes de auth 13/13; `git diff --check` limpo. Suíte/build frontend completos não executados nesta tarefa.
- Limitações: PGlite é SQL real local, não Supabase remoto; nada aplicado remotamente; habilitação real do UUID do proprietário segue como ação administrativa separada não autorizada; `/api/auth/me` passa a consultar o banco por requisição. Relatório: `.hermes/evidence/health-task4/report.md`.
- Gate Hermes da tentativa acima: **reprovado** (34 skipped por `beforeAll` não comprovam RED SQL/HTTP). Reinício TDD em 2026-10-10 pelo mesmo implementador (Claude Code): logs/relatório originais preservados (hashes em `red-original-sha256.txt`), produção T4 arquivada (`superseded-*`) e retirada; Analytics intocado e assertion nova de `platform.test.ts` mantida. Teste corrigido: sem `beforeAll` SQL global, asserção explícita de migration/tabela/funções antes de qualquer seed, fail closed e mapeamento em suítes sem banco (35 testes). Tentativa 0 do RED corrigido foi erro de CLI sem testes (`red-corrected-attempt0-cli-error.log`). RED corrigido sem produção: 36 falhas, todas `AssertionError`, 31 ok, 0 skipped (`red-corrected-*`). Reimplementação mínima a partir dos contratos, idêntica à tentativa original (declarado). GREEN 67/67 (`green-corrected-*`). Gates seriais: Worker typecheck/lint ok, suíte 209/209, build dry-run ok; frontend 281/281, typecheck ok, build ok; `git diff --check` limpo. QA navegador não executado (sem mudança de UI). Estado: aguardando nova verificação Hermes; Tarefa 5 não iniciada.

- Tarefa 1 — concluída (2026-09-30), sem commit. RED real em /tmp/focus-nagi-task1-red.log (JUnit do vitest: 40 testes, 21 falhas antes da produção; "cancel never moves the idle base" já passava, é guarda de regressão). Implementado em useFocusSession.ts (LAST_COMPLETED_FOCUS_SESSION_KEY, useLastCompletedFocusSession com status=COMPLETED/page=0/size=1, applyFinishedFocusSession cancelando leituras em voo antes de escrever, computeIdleSeconds, formatDuration), AppShell.tsx (OCIOSO = tempo desde endedAt; role="timer" "Tempo ocioso"/"Tempo de foco"; auto finish via helper) e FocusPage.tsx (finish manual via helper; cancel não toca a base). Verificação: 3 arquivos alvo 40/40; npm test 139/139; npm run typecheck ok.
- Tarefa 2 — concluída (2026-09-30), sem commit. Limites lidos: worker/src/routes/focusSessions.ts plannedFocusMinutes boundedInt(1, 1440) (zod int) + CHECK 1..1440 na migration de schema. RED real em /tmp/focus-nagi-task2-red.log (JUnit: 19 testes, 9 falhas antes da produção — módulo FocusDurationMenu inexistente e gatilho "Duração da sessão" ausente no FocusPage). Implementado components/FocusDurationMenu.tsx + .module.css (disclosure com aria-expanded/aria-controls, painel role="dialog", presets 25/50/60/90/15 com aria-pressed, setas/Home/End, Escape devolve foco ao acionador, seleção fecha e devolve foco, clique fora/foco fora fecham, custom inteiro 1..1440 com erro role="alert"/aria-invalid; fecha ao ficar disabled) e FocusPage.tsx (substitui chips sempre visíveis; default 50; disabled em RUNNING/PAUSED e início pendente; mostra duração da sessão ativa). Teste antigo do preset 60 passou a abrir o menu antes. Verificação: 2 arquivos alvo 41/41; npm test 169/169; npm run typecheck ok; git diff --check ok.
- Tarefa 3 — concluída (2026-09-30), sem commit. Referência lida inteira (Focus Nagi v3.dc.html, 741 linhas) e support.js inspecionado só para entender o runtime (sc-if/sc-for/helmet/ref; não importado). RED real em /tmp/focus-nagi-task3-red.log (JUnit: 26 testes, 18 falhas — módulos particleGeometry/ParticleScene inexistentes; login sem headline h1 fora do card, rótulos E-mail/Senha, bloqueio de duplo envio, âncora; shell sem logo triangular/nav "Principal"/cena decorativa e rótulos Ocioso/Em foco/Pausada). Implementado: components/particles/particleGeometry.ts (robô/anel/deriva livres portados das linhas 477-560; BLOBS/cx/cy descartados por não serem usados no frame) + ParticleScene.tsx/.module.css (grade 88px com máscara, feixe cônico, canvas fixo aria-hidden pointer-events none; ParticleAnchor por contexto com data-shape/progress/running; RAF só com movimento permitido e aba visível; reduced motion em runtime cancela RAF e desenha quadro estático redesenhado em resize/scroll/mudança de âncora; cleanup de RAF e listeners); auth/LoginPage (h1 "Focus Nagi" fora do card glass, h2 "Acesse seu console" rotulando o form, labels E-mail/Senha via htmlFor com dica "Supabase Auth" aria-hidden, guarda síncrona contra duplo envio + aria-busy, robô vira anel durante o envio); layout/AppShell (pill flutuante: logo triangular com data-focus-state, "Focus Nagi", nav "Principal" com ponto deslizante, Ocioso/Em foco/Pausada + timer, Sair; streak/spark removidos do header — continuam em Hoje/Analytics); global.css (tokens Geist/Geist Mono, #05060f, violeta/âmbar, fundo antigo removido, fn-btn-primary texto branco por contraste); themes.ts violeta/âmbar; index.html Geist + título "Focus Nagi"; test/setup.ts getContext nulo no jsdom. Favicon/auto finish/notificação/idle/cancel inalterados. Verificação: npm test 191/191; npm run typecheck ok; npm run build ok. Pendências: smoke em navegador desktop/mobile/reduced motion (sem navegador headless no ambiente); fontes legadas Chakra Petch/JetBrains Mono/Barlow ainda carregadas para as páginas da tarefa 4 — remover ao migrá-las; "Fechar" do aviso de conclusão da referência não adicionado para não mudar a semântica favicon "completed".
- Tarefa 4 — concluída (2026-09-30), sem commit. RED real pré-existente (/tmp/focus-nagi-task4-red.log: 236 testes, 39 falhas antes da T4; ao retomar, 12 falhas restavam: JournalPage 6, AnalyticsPage 2, fonts.test 4). Implementado: FocusPage.module.css reescrito para as classes do novo TSX (ring anchor 580px com relógio clamp(64–113px) tabular, headline gradiente, liveDot por estado, ações 36px de respiro, histórico em grid 110px/1fr/auto/auto com status colorido, Geist, responsivo); FocusDurationMenu.module.css em vidro com botões 44px e painel max 300px cabendo na viewport; JournalPage.tsx reescrito (hero "Diário." + eyebrow "Registro pessoal · {hoje}" + âncora cloud única; editor sticky estilo referência com borda esquerda; timeline real agrupada por mês/dia mesclando journal + analytics.byDay + checklistDaily do intervalo dos registros visíveis, eventos "Escreveu no diário"/"Focou {hm}"/"Concluiu {c} de {t} missões" com trilhos, filtros Tudo/Diário/Foco/Checklist aria-pressed, resumo "{dias} · {hm} · {entradas}", paginação 10 com Anterior/Próxima, save permitido mesmo com GET recent falho, append-only e editor limpo preservados); AnalyticsPage.tsx reestruturado (hero "Analytics." + "Telemetria" + chips com aria-pressed + âncora cloud; Resumo do período com 4 <article> em vidro; seção de avaliação "Excelente." capitalizada com ponto, range humano só quando difere da semana selecionada; regions "Mapa de foco" (círculos fnPop), "Foco por dia" e "Por hora do dia"; painel mensal de semanas preservado) SEM alterar a lógica de datas/queries/gating de avaliações; CSS dos dois em Geist/glass fiéis à referência, sem recolorir (tokens de tema mantidos). Testes RED da T4 preservados sem enfraquecer assertions. Verificação: npm test 236/236; npm run typecheck ok; npm run build ok; git diff --check ok. Pendente: smoke em navegador das cinco rotas + screenshots (agendado para Hermes, Chromium headless disponível, Vite isolado porta 5179 com valores Supabase falsos).
- Tarefa 5 — bloqueada, sem commit/push/deploy. Gates independentes Hermes: frontend 236/236 + typecheck/build; worker check com 174/174 + lint/typecheck/build; git diff --check verde. Chromium real (APIs simuladas, sessão disposable) abriu login e cinco rotas em 1440/390/320px sem overflow horizontal; CRUD checklist e duas entradas de diário preservando conteúdo/data local passaram. Smoke completo parou no menu aberto: viewport390, painel left=-47.078125/right252.921875, confirmado clipping apesar da largura limitada. Pendências completas em /tmp/focus-nagi-qa-blockers.md: alinhamento do menu; eventos de foco/checklist sem anotação; meta literal240 inventada; agregações com carregamento/erro mascarados como zero (revisão independente /tmp/focus-nagi-independent-review.json, passed=false). Reduced-motion/fluxo completo ainda não verificados por esse smoke. Claude Code atingiu limite de sessão; Kimi atingiu 403 limite de5h antes de aplicar fixes. Necessário aguardar cota dos implementadores aprovados ou autorização explícita para GPT. Clarify sem resposta não autoriza mudança de implementador. Deploy existente https://focus-nagi.vercel.app permanece na versão anterior; projeto Vercel/branch Git main confirmados, SHA remoto==HEAD a9f59587b08dc1c0dee595b000499dca79d9385c. Status Vercel ligado a SHA exato pode ser verificado sem credenciais na API pública GitHub /repos/endilIgor/focus-nagi/commits/{sha}/status; sempre conferir também asset novo na produção, não somente health200.
- Tarefa 5 — correções de QA 1-5 concluídas (2026-10-01) por Claude Code, sem commit/push/deploy; publicação ainda pendente (revisão independente/Hermes). RED real em /tmp/focus-nagi-task5-red.log (3 arquivos, 60 testes, 12 falhas antes da produção: menu 5, diário 5, sync 2; 2 guardas já passavam). (1) FocusDurationMenu.tsx: painel medido em useLayoutEffect, centrado sob o acionador e limitado a [16px, innerWidth-16px-largura], recalculado em resize; foco/Escape/validação/vidro preservados. (2) JournalPage.tsx: timeline = união de datas do diário + foco (>0) + checklist (total>0); página 0 vai de min(entradas, hoje) até hoje (diário vazio/falho ⇒ hoje), páginas históricas usam o próprio intervalo; desc, por mês civil, filtros/paginação/append preservados. (3) Meta 240/“meta de 4h” removidas; barra relativa ao maior foco do intervalo (“Maior foco do período”/“Relativo ao maior foco do período”). (4) Agregações: role="alert" por falha de foco/checklist, aviso aria-live durante carregamento, resumo mostra “foco —”/“foco indisponível” em vez de 0min; save continua disponível. (5) useLastCompletedFocusSession com refetchInterval 20s (mesmo ritmo do current), cobrindo sessão iniciada/concluída entre polls; cancel-before-write e exclusão de CANCELLED inalterados. (6) não reproduzido: smoke real mantém frames estáveis após reduced motion; sem mudança. Verificação: npm test 250/250; npm run typecheck ok; npm run build ok; git diff --check ok; node /tmp/focus-nagi-browser-smoke.mjs completo sem erros (painel 390px: left16/right316, APIs simuladas). Worker npm run check não reexecutado (worker inalterado).
- Tarefa 5 — integração e publicação concluídas (2026-10-01). Hermes repetiu frontend 250/250 sem warnings act, typecheck/build, worker check 174/174, diff --check e smoke Chromium completo (API simulada, login e cinco rotas em 1440/390/320, ações de checklist/diário/foco, reduced motion). Revisão independente não encontrou P1/P2 nos fixes; observações P3 sobre lacunas entre páginas históricas do diário ficam fora do escopo aprovado, que preserva a paginação. Commit de implementação 7d85c4a (endilIgor, sem trailers de IA) enviado a main; status GitHub/Vercel success ligado ao SHA; domínio https://focus-nagi.vercel.app/ respondeu 200, serviu JS com marcadores do novo design e /api/health respondeu UP. Smoke local usa sessão Supabase fictícia e respostas simuladas: não comprova login nem mutações reais de produção.


### Checkpoint supervisor — retomada autorizada 4–14, interrompida por quota Claude

- Nova tentativa explicitamente autorizada após recusa anterior; Claude CLI Pro iniciou com sucesso, sem contornar recusa nova. Tarefa4 concluída localmente por Claude, verificada Hermes e reviewer read-only passed=true. Evidência: `.hermes/evidence/health-task4/hermes-verified.md`. SQL privado/RPC e `/api/auth/me` healthAccess strict boolean/failclosed, sem provisionamento da conta real.
- TDD4: RED inicial inadequado (34 skipped por setup), preservado; Hermes rejeitou e Claude retirou própria produção, corrigiu harness, rodou RED do reinício antes reimplementação (67 testes36 falhas31 verdes sem skipped), GREEN67/67. Não alegar todas falhas SQL como regras comportamentais: guardas estruturais assert migration ausente. Logs/junit e transcripts preservados.
- Gates independentes4: Worker209/209, typecheck/lint/dry-run build; frontend281/281,typecheck/build; git diff --check verde. Revisor observações baixas: futuras RPCs devem SECURITY DEFINER e testar guard owner via RPC real.
- Tarefa5 iniciada após gates4: Claude criou apenas contratos técnicos e draft `worker/test/training-database.test.ts`; migration20261010121000 NÃO criada, nenhuma produção5. Interrompida erro real429 `usage_limit_reached`, `You've hit your session limit · resets 5:40pm (America/Sao_Paulo)`. CLI session4a720d78-0563-4dd0-9386-569e7f2d15ba, proc_5309545622d2 terminou exit1. Não trocar credenciais/modelo/implementador nem retry de quota.
- Hermes observou primeiro RED5 após saída Claude e antes qualquer produção5: alvo163 testes120 falhas43 verdes; suite completa Worker329 testes120 falhas209 verdes, sem errors. Todos120 novos falham assertion da migration ausente; não comprovam regras SQL individualmente. Worker typecheck/lint e git diff --check verdes no draft. Evidências `.hermes/evidence/health-task5/hermes-partial-{red,full}*`. Não declarar full suite verde neste checkout parcial.
- Tarefas6–14 não iniciadas; tarefa5 pendente de implementar/GREEN/revisão/gates, contratos precisam review antes continuar. Tarefas1–3 herdadas preservadas. Nenhum writer em andamento após saída. Sem commit/push/deploy/dependências/credenciais/provisionamento remoto. Próximo executor permanece Claude CLI tarefa5 após quota disponível, só avançar6 com gates5 verdes. QA navegador saúde/persistência integrada ainda pendente14, nenhum produto completo declarado.

### Verificação independente Tarefa5

Tarefa5 concluída/revisada localmente. Hermes executou Worker329/329 + typecheck/lint/build dry-run e frontend281/281 + typecheck/build; git diff --check verde. Reviewer fresh Claude passed=true sem blockers. RED original herdado preservado, baseline nova329/120falhas209verdes pré-produção. Migration training CRUD/FK/PATCH/grants/RLS real PGlite. Ajuste harness pg_get_serial_sequence sem enfraquecer expected; delete JSONnull em vez void aceito tecnicamente e documentado. Evidências `.hermes/evidence/health-task5/hermes-verified.md`. Próxima6; continuar sequencialmente até14 conforme autorização, sem publicação/provisionamento remoto.

### Nova retomada após quota

Usuário solicitou “pode mandar continuar”. Retomar pela tarefa 5 com Claude Code CLI (auth status atual: Claude Pro); a disponibilidade de quota ainda precisa ser comprovada pela nova execução. Preservar tarefa 4 verificada, contratos e RED parcial da tarefa 5. A autorização sequencial das tarefas restantes continua válida, sem commit/push/deploy/provisionamento remoto. Verificar baseline atual e revisar contratos antes de produção; avançar por tarefa somente após GREEN/revisão/gates. Sem alegar novos testes aprovados apenas pelo lançamento da supervisão.

### Nova fase — Tarefa 5 (persistência de rotinas e exercícios)

- Tarefa 4: concluída e verificada pelo Hermes (`.hermes/evidence/health-task4/hermes-verified.md`).
- Estado da Tarefa 5: implementada localmente por Claude Code em 2026-10-10 e **aguardando revisão/verificação Hermes**. Não foi declarada concluída. A Tarefa 6 não começou.
- Produção: `supabase/migrations/20261010121000_training_catalog.sql`.
  - Tabelas `training_routine` e `training_exercise`, com FK composta dono-coerente e cascade, CHECKs de limite/modo/dias, e RLS com policies de dono.
  - Tabelas e sequências fechadas a clientes.
  - 10 RPCs `api_training_*` `security definer` com `search_path=''` e guarda `require_health_access()` antes de qualquer validação ou consulta.
  - PATCH em `jsonb`: chave omitida mantém o valor; `null` só limpa campos opcionais; a troca de modo exige o novo alvo e limpa o incompatível.
  - Paginação no envelope `page_json`, ordem de cadastro (`id`).
  - Sem seed de conta.
- Contratos e adendo: `.hermes/evidence/health-task5/contracts.md`. Pontos do adendo para revisão:
  - As exclusões retornam `jsonb null` em vez de `void` (o PGlite serializa `void` como `""`).
  - Consulta `pg_get_serial_sequence` corrigida no próprio teste, sem mudar valores esperados.
- Testes: `worker/test/training-database.test.ts` (120). Em `worker/test/database.test.ts`, `TABLES` inclui as 2 tabelas novas, com igualdade estrita mantida.
  - RED herdado do Hermes preservado (120 falhas estruturais por assertion de migration ausente).
  - RED da ampliação de `TABLES` capturado antes da migration: 2 falhas `AssertionError`, 6 ok.
  - Primeiro GREEN: 3 falhas de 163. GREEN corrigido: alvo 163/163.
- Gates seriais:
  - Worker: typecheck/lint ok, suíte 329/329, build dry-run local ok.
  - Frontend: 281/281, typecheck/build ok.
  - `git diff --check` não executado (git negado nesta sessão).
- Limitações:
  - Códigos `TRAINING_*_NOT_FOUND` sem mapeamento HTTP até a Tarefa 6.
  - PGlite local, nada remoto.
  - QA navegador/persistência integrada pendente (Tarefa 14).
- Relatório: `.hermes/evidence/health-task5/report.md`.

### Nova fase — Tarefa 6 (API de treino)

- Tarefa 5: concluída e verificada pelo Hermes (`.hermes/evidence/health-task5/hermes-verified.md`).
- Estado da Tarefa 6: **concluída e verificada por Hermes**, Worker416/416/frontend281/281, typecheck/lint/build e fresh review passed=true, conforme `.hermes/evidence/health-task6/hermes-verified.md`; descrição abaixo preserva os gates históricos do implementador.
- Contratos registrados antes do RED: `.hermes/evidence/health-task6/contracts.md`.
  - 10 rotas aninhadas em `/api/training/routines[/:id[/exercises[/:exerciseId]]]`, 1:1 com as RPCs da Tarefa 5.
  - Status 201/200/204. Envelope Spring de paginação com tamanho padrão 20 (máximo 100). Erros no formato `{ code, message, timestamp }`.
  - PATCH envia à RPC só as chaves validadas presentes: omitido mantém, `null` limpa só os campos opcionais.
- Produção:
  - `worker/src/routes/training.ts` (novo).
  - `worker/src/routes/index.ts` (registro das rotas).
  - `worker/src/errors.ts`: `TRAINING_ROUTINE_NOT_FOUND` e `TRAINING_EXERCISE_NOT_FOUND`, ambos 404.
  - `worker/src/domain.ts`: `TRAINING_EXERCISE_MODES`.
- Testes: `worker/test/training.test.ts` (87), HTTP sobre SQL real em PGlite, sem mocks de SQL.
  - Coberto: CRUD, validação e limites, PATCH com campo omitido e com `null`, troca de modo, IDs e vínculos, isolamento A/B, 403 nas 10 rotas para conta não habilitada, 401 nas 10 rotas para anônimo, revogação, e RPC direta (guarda antes do payload inválido; anon negado).
  - Nenhum teste antigo foi alterado.
- RED antes da produção: 67 falhas, todas `AssertionError`, 0 skipped. Os 20 testes que passaram são guardas de regressão de RPC direta da Tarefa 5.
- GREEN: alvo 87/87 na primeira tentativa; alvo do plano 242/242.
- Gates seriais:
  - Worker: typecheck e lint ok; suíte 416/416; build dry-run ok.
  - Frontend: 281/281; typecheck e build ok.
  - `git diff --check` não foi executado (git negado nesta sessão).
- Limitações:
  - Na camada HTTP, payload malformado retorna 400 antes do 403 (convenção do Worker, sem acesso a dados).
  - O PostgREST remoto não foi exercitado.
  - QA de navegador e persistência integrada ficam para a Tarefa 14.
- Relatório: `.hermes/evidence/health-task6/report.md`.

### Tarefa 9 — clientes e contratos frontend

- Estado: **concluída, revisada e verificada independentemente pelo Hermes**. Parent repetiu frontend313/313, Worker580/580, typecheck/lint/build/diff-check; fresh Claude reviewer passed=true. Evidência RED original JUnit/JSON e cronologia aceitas explicitamente pelo parent, com stdout parcial rotulado (decisão abaixo). Próxima10; tarefas10–14 pendentes.
- Contratos registrados antes do RED: `.hermes/evidence/health-task9/contracts.md`. Relatório: `.hermes/evidence/health-task9/report.md`.
- Produção: `frontend/src/api/types.ts` (tipos de treino/alimentação espelhando o JSON das RPCs; resposta de exercício e create discriminados por `mode`), `frontend/src/api/training.ts` (`trainingApi`: rotinas e exercícios aninhados, `allRoutines`/`allExercises` via `fetchAllContent`) e `frontend/src/api/nutrition.ts` (`nutritionApi`, `all` via `fetchAllContent`). Transporte, erros/refresh 401 e paginação centrais reutilizados sem alteração.
- Testes: `frontend/src/api/training.test.ts` (20) e `nutrition.test.ts` (12) com `fetch` stubado; RED assert-level (S1 corrigido 20/20, S2 12/12 `AssertionError`), GREEN alvo 32/32.
- Gates do implementador: frontend 313/313 (281 regressão + 32 novos), typecheck e build; Worker 580/580, typecheck, lint e build dry-run.
- Limitações: `git diff --check` e captura de stdout em arquivo foram negados na sessão Claude (equivalente: busca de whitespace final sem ocorrências; JUnit/JSON do vitest preservados). Testes usam `fetch` simulado; persistência real e UI ficam para T10–14.

### Tarefa 10 — tela de rotinas

Retomada autorizada: usuário pediu implementação pelo próprio GPT/Hermes até limite. Supersede bloqueio de implementador/reviewer Claude abaixo: sem retry Claude; implementação Hermes e review fresh GPT. Baseline parent335/335 frontend e580/580 Worker. Não refazer1–9. Corrigir com novas regressões RED os controles mutáveis durante envio antes de integrar10 e avançar11–14. Commit local parent após gates, sem publicação ou infraestrutura remota.

- Estado atual: **concluída após takeover autorizado GPT/Hermes**. Parent repetiu baseline335/335 e580/580; escreveu3 regressões e observou RED por matcher de disabled (3falhas/22verdes), corrigiu bloqueio de campos/cancel/seleção durante mutations e observou alvo25/25, frontend338/338 e typecheck/lint/build/diff-check verdes. Fresh GPT reviewer passed=true sem blockers; sugestões foco inline e falha de refetch para QA14. Evidências novas `.hermes/evidence/health-task10/gpt-*`; revisão em `gpt-review.json`. Quota Claude histórica preservada em `hermes-verified.md`, sem retry. Próxima11; tarefas11–14 pendentes.
- Contratos registrados antes do RED: `.hermes/evidence/health-task10/contracts.md`. Relatório com cronologia: `.hermes/evidence/health-task10/report.md`.
- Produção: `frontend/src/pages/TrainingPage.tsx` e `.module.css` (novos). Query `["health", owner.id, "training", "routines"]` via `trainingApi.allRoutines`; loading/erro com retry sem falso vazio; criar (trim 1..150, dias ISO opcionais únicos ordenados), selecionar, editar e excluir com `alertdialog`; guarda síncrona contra envio duplo; erro de save preserva valores; remount por `key={owner.id}` na troca de conta; invalidação só da chave de saúde do owner capturado. Sem exercícios, rota/navegação ou bloqueio por `healthAccess` (T11/T13).
- Testes: `frontend/src/pages/TrainingPage.test.tsx` (22, API mockada). RED S1 original foi de setup (preservado) e o corrigido 6/6 `AssertionError`; S2 7 e S3 6 falhas por elemento ausente; S4 sem RED observado (comportamento já introduzido no S1) e sensibilidade demonstrada por mutação temporária sem `key` (2/3 falham). GREEN final 22/22; `npm run typecheck` sem erros.
- Limitações: suíte completa/build não executados pelo coder (gates do Hermes); mocks não provam persistência; sem QA de navegador; stdout do transcript filtrado (JUnit/JSON completos preservados).

### Retomada atual — Tarefa 8

O proprietário solicitou continuar o projeto e autorizou explicitamente o Claude Code CLI com a conta API atual, ciente de possível consumo de créditos. O status de autenticação nesta retomada retornou `Claude API account`; isso substitui a exigência de Pro para esta continuação, sem alterar credenciais. Tarefas 1–7 preservadas. Baseline independente Hermes: Worker 501/501 e frontend 281/281, em execução serial, logs em `.hermes/evidence/health-task8/resume/`. Próxima tarefa: 8, API alimentação; seguir 9–14 somente após revisão e gates por tarefa. Commit local somente pelo parent após audit conforme `.hermes/commit-authorization.md`; sem push/deploy/provisionamento ou migration remota.

- Estado da Tarefa 8: **concluída e verificada independentemente por Hermes**. Próxima: Tarefa9 clientes frontend. Hermes repetiu alvo199/199, Worker580/580 e frontend281/281, typecheck/lint/build/diff-check com stdout integral em `.hermes/evidence/health-task8/resume/hermes-*.log` e ledger `hermes-gates.json`. Fresh Claude reviewer `passed=true`, sem blockers, em `claude-review.json` e `review-verdict.json`. O estado abaixo registra os gates históricos do implementador; o git negado refere-se somente à sessão Claude. Limitação menor herdada: helpers HTTP medem comprimento UTF-16; SQL usa code points, podendo haver rejeição mais estrita de caracteres fora do BMP no HTTP. Sem refatoração global nesta tarefa.
- Contratos registrados antes do RED: `.hermes/evidence/health-task8/resume/contracts.md`.
- Produção:
  - `worker/src/routes/nutrition.ts` (novo): CRUD `/api/nutrition/foods[/:id]` sobre as 5 RPCs da T7, com POST 201, GET paginado (`pageQuery` padrão 20, máx. 100), GET/PATCH 200 e DELETE 204.
  - PATCH: omitido mantém; `null` limpa somente `quantity`. Mover de refeição = PATCH de `meal`, preservando id e ordem.
  - `routes/index.ts` registra as rotas; `domain.ts` ganhou `NUTRITION_MEALS`; `errors.ts` mapeia `NUTRITION_FOOD_NOT_FOUND` ⇒ 404 "Nutrition food not found.".
  - Sem migration nova; a migration da T7 e os testes antigos não foram alterados.
- Testes: `worker/test/nutrition.test.ts` (79), com HTTP Hono e SQL real PGlite.
  - TDD vertical em 4 fatias: create/get+mapeamento, list, PATCH, DELETE+capacidade.
  - RED: 67 falhas, todas `AssertionError`, 0 errors e 0 skipped (37 + 5 + 21 + 4).
  - Guardas verdes por herança, rotuladas como regressão e não como RED: 401 anônimo (middleware), 10 RPCs diretas (T7) e persistência via RPC direta.
- Gates seriais, com 768MB e `--maxWorkers=1 --no-file-parallelism`:
  - Alvo do plano: 199/199.
  - Worker: 580/580; typecheck, lint e build dry-run ok.
  - Frontend: 281/281; typecheck e build ok.
  - `git diff --check` não executado (git negado nesta sessão). A busca por espaços finais nos arquivos tocados não achou nada.
- Limitações:
  - PGlite local, não PostgREST/Supabase remoto.
  - Clientes frontend/UI pendentes (Tarefas 9–12); QA navegador pendente (Tarefa 14).
- Relatório: `.hermes/evidence/health-task8/resume/report.md`.

### Nova fase — Tarefa 7 (persistência dos alimentos por refeição)

- Tarefa 6: concluída e verificada pelo Hermes (`.hermes/evidence/health-task6/hermes-verified.md`: Worker 416/416, frontend 281/281, typecheck/lint/build, reviewer passed=true).
- Estado da Tarefa 7: **concluída e verificada independentemente por Hermes**: Worker501/501, frontend281/281, typecheck/lint/build, diff-check0 e fresh reviewer passed=true sem blockers. Evidências `.hermes/evidence/health-task7/hermes-verified.md` e `hermes-gates.json`. Tarefa8 iniciada somente para leitura e interrompida por quota real antes de testes/produção; detalhes no checkpoint8.
- Contratos registrados antes do RED: `.hermes/evidence/health-task7/contracts.md`.
- Produção: `supabase/migrations/20261010122000_meal_catalog.sql`.
  - Tabela `nutrition_food`: meal `BREAKFAST/LUNCH/AFTERNOON_SNACK/DINNER`, nome até 150, quantidade textual opcional até 150, trim e brancos ⇒ null.
  - RLS e policies de dono; tabela e sequência fechadas a clientes. Sem seed e sem campo diário/`completed`.
  - 5 RPCs `api_nutrition_food_*` `security definer` com `search_path=''` e `require_health_access()` primeiro.
  - PATCH `jsonb`: omitido mantém, `null` limpa só a quantidade, mover = PATCH de `meal`.
  - Ordem `id` asc (cadastro); o alimento movido mantém a posição. Envelope `page_json`. Delete retorna `jsonb null`.
- Testes: `worker/test/nutrition-database.test.ts` (85). Em `worker/test/database.test.ts`, `TABLES` inclui `nutrition_food`, com igualdade estrita mantida.
  - TDD vertical em 5 fatias (estrutura, create/get, list, update, delete), cada uma com RED antes da produção. JUnit `red-s*-junit.xml`; stdout no transcript do supervisor.
  - RED: 87 falhas no total, todas `AssertionError`, 0 skipped. São pré-condição por fatia, e não regras SQL individuais, exceto as 2 de `TABLES`. Nenhum teste novo nasceu verde.
  - GREEN do alvo do plano: 93/93.
- Gates seriais:
  - Worker: typecheck/lint ok; suíte 501/501 (768MB); build dry-run ok.
  - Frontend: 281/281; typecheck/build ok.
  - `git diff --check` não executado (git negado nesta sessão). A busca por espaços finais nos arquivos novos não achou nada.
- Limitações:
  - `NUTRITION_FOOD_NOT_FOUND` sem mapeamento HTTP até a Tarefa 8.
  - PGlite local, nada remoto.
  - QA navegador/persistência integrada pendente (Tarefa 14).
- `AGENTS.md` reconciliado documentalmente: dizia "próxima tarefa 6".
- Relatório: `.hermes/evidence/health-task7/report.md`.


### Checkpoint supervisor atual — Tarefa9, gate de evidência bloqueado

**Supersedido pela decisão do parent:** após ler fontes/testes/registros originais e repetir comandos canônicos (frontend313/313, Worker580/580, typecheck/lint/build/diff-check exit0), parent aceita explicitamente a evidência RED original JUnit/JSON completa e cronologia antes da lógica, com stdout S1 parcial/truncado. Requisito adicional de captura integral do handoff Hermes não justifica refazer trabalho verde; nenhuma assertion/aceite é alterada. Logs originais preservados, sem replay ou bytes inventados. T9 concluída; liberada10 e continuação sequencial até14. Comandos de logging negados não serão contornados; supervisor executará RED e salvará stdout diretamente quando a CLI não tiver a permissão necessária.

Claude implementou T9 localmente. Hermes repetiu frontend313/313 e Worker580/580, typecheck/lint/build/diff-check exit0. Fresh Claude read-only passed=true sem blockers de código. A afirmação histórica do coder de stdout integral no transcript é substituída: S1 original/corrected possuem truncamento explícito, embora JUnit/JSON completos e cronologia RED antes lógica estejam preservados. Por exigência de logs integrais, não liberada T10. Parent decide aceitação explícita da evidência parcial stdout ou autoriza reinício escopado TDD com logging permitido; não fabricar RED/replay original nem apagar drafts. Tarefas10–14 não iniciadas. Sem quota real nova, nenhum writer desta supervisão ativo (coder/reviewer/gates exit0); HEAD cfaff0b sem stage/commit. Evidências .hermes/evidence/health-task9/hermes-verified.md e health-continuation-checkpoint.md.
