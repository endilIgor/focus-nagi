# Focus Nagi — Analytics mensal, treino e alimentação: plano de implementação

> **Para Hermes:** coordenar implementação tarefa por tarefa pelo Claude Code CLI e revisar conformidade com a especificação, qualidade e evidências de execução. Não implementar produção neste turno de planejamento. Não executar instruções de publicação do plano antigo como autorização desta fase.

**Objetivo:** melhorar o Analytics de foco e adicionar cadastro pessoal de treinos e alimentos, sem acompanhamento diário de saúde.

**Arquitetura:** preservar React/TypeScript, CSS Modules e TanStack Query no frontend; Hono no Cloudflare Worker e persistência via RPC SQL no Supabase. Analytics usa os endpoints existentes; treino e alimentação exigem novas tabelas/RPCs e rotas autenticadas, sem reutilizar registros de foco/checklist.

**Stack:** React 18, React Router, TanStack Query, TypeScript, Vitest/Testing Library; Hono, Zod, PostgreSQL/Supabase, PGlite nos testes, Wrangler.

**Status:** escopo funcional definido na conversa; decisões técnicas abaixo são propostas de implementação, não código entregue. Este documento preserva `spec.md` e `plan.md` da versão v3. Antes da execução, incorporar a nova fase à documentação canônica com autorização para editá-la, sem apagar o histórico. Nenhum commit, push, migração remota ou deploy autorizado por este documento.

---

## 1. Especificação funcional desta fase

### 1.1 Decisões confirmadas pelo usuário

- Durações de foco por dia em horas e minutos, como `1h 30min`, não horas decimais.
- Mapa de foco de um mês completo, inspirado no GitHub.
- Usuário já tem treino de calistenia em casa; cadastrará depois no app.
- Usuário já tem alimentos; cadastrará depois nas quatro refeições: Café da manhã, Almoço, Café da tarde, Janta.
- Apenas cadastrar e consultar treino e refeições nesta primeira versão, incluindo edição/exclusão conforme escopo resumido na conversa. Sem registro diário de execução.
- Uso pessoal; indicadores de saúde não entram no Analytics de foco.

### 1.2 Analytics de foco

- Preservar resumo, filtros Hoje/Semana/Mês, avaliação semanal, streak e demais gráficos existentes.
- No gráfico Foco por dia, exibir rótulos e detalhes com unidade explícita: abaixo de uma hora, `30min`; horas exatas, `1h`; duração mista, `1h 30min`; zero no detalhe, `0min`. Valores continuam armazenados/agregados em minutos. Não alterar globalmente o helper existente sem avaliar seus outros consumidores.
- Mapa mensal possui seleção própria, iniciada no mês atual. Alterar filtros/semana do restante do Analytics não muda o mapa; mudar o mês do mapa não altera os outros gráficos.
- Botões de mês anterior/próximo; bloquear navegação a meses futuros. Não exigir novo seletor além desses botões nesta fase.
- Grade de quadrados com sete linhas (segunda a domingo) e colunas de semanas, como contribuição GitHub. Mostrar apenas o mês selecionado; espaços fora do mês são preenchimentos sem dados e sem interação.
- Mostrar todos os dias do mês. Passados sem foco = zero; futuros = estado diferente, sem indicação de falha. Consulta vai do início do mês até o último dia passado/hoje; geração dos dias futuros é de calendário, não dados inventados.
- Cada dia pode ser selecionado por teclado, mouse ou toque para mostrar data e duração. Não depender apenas de `title` ou hover. Estado futuro deve ser legível também sem cor.
- Faixas fixas propostas: zero; >0 e <60 min; 60 a <120 min; 120 a <240 min; >=240 min. Legenda explicita as faixas, sem sugerir meta obrigatória. Cores seguem os tokens existentes e têm distinção adequada para o tema escuro.
- Falha de consulta não deve virar mapa de zeros; mostrar erro e permitir nova tentativa. Loading não se apresenta como ausência de foco.

### 1.3 Treino — cadastro, não diário

Proposta de modelo mínimo para organizar a rotina já existente:
- Criar rotinas com nome e dias da semana opcionais (sem calendário de execução).
- Cada rotina contém exercícios, preservando a ordem de cadastro.
- Exercício: nome obrigatório, número de séries positivo, modo `REPETITIONS` ou `DURATION`, alvo positivo em repetições ou segundos, observação opcional.
- Escolher um único modo por exercício; alternar o modo limpa o alvo incompatível.
- Permitir consultar, editar e excluir rotinas/exercícios. Excluir rotina pede confirmação e remove seus exercícios de forma transacional.
- Nenhum botão de treino concluído, timer de treino, cálculo de carga/volume, sugestão automática de rotina ou histórico de evolução nesta fase.
- Começar vazio, com ação clara para cadastrar. Não adicionar exercícios fictícios nem defaults de treino prescritos.

### 1.4 Alimentação — plano de refeições, não consumo diário

- Tela com quatro seções fixas, nesta ordem: Café da manhã, Almoço, Café da tarde, Janta.
- Cadastrar alimento na seção escolhida, com nome obrigatório e quantidade textual opcional, por exemplo unidades ou gramas informadas pelo usuário. Campo textual evita exigir conversão nutricional ou catálogo de unidades.
- Editar nome/quantidade/refeição e excluir com confirmação. Preservar ordem de cadastro dentro da refeição; mover para outra refeição deve refletir imediatamente na tela.
- Sem calorias, macros, banco nutricional externo, receitas, registro diário, check de refeição realizada ou recomendação de dieta.
- Quatro seções vazias continuam visíveis; nenhum alimento pré-cadastrado.

### 1.5 Navegação e persistência

- Novas páginas autenticadas `/treino` e `/alimentacao`, com rótulos Treino e Alimentação no shell. Não criar Analytics de saúde sem dados históricos.
- Preservar `/analytics` e sua semântica exclusivamente de foco/produtividade.
- Layout segue a identidade v3; uso em desktop e celular, sem overflow horizontal. Não importar um pacote de UI ou gráficos novo.
- Persistência real no Supabase; não usar localStorage como fonte de cadastro. Os dados devem permanecer após recarga/login e em outro dispositivo da mesma conta.
- Queries/mutations de saúde com chaves próprias, sem invalidar `analytics`, checklist, diário ou sessões de foco. Incluir identidade do usuário nas novas chaves para evitar reaproveitar cache entre contas.
- Forms preservam entradas após falha; botão de envio fica indisponível durante envio, sem sucesso otimista falso. Após sucesso, invalidar/atualizar listas corretamente.

### 1.6 Segurança e ponto obrigatório antes da implementação de saúde

Evidência no repo: `worker/src/env.ts` possui `ALLOWED_USER_IDS` (vazio aceita qualquer usuário autenticado). Isso NÃO prova que produção está configurada para uma conta só. RPCs públicas podem ser chamadas diretamente no Supabase; restrição somente no Worker ou no menu é insuficiente.

- Todos os registros pertencem ao `auth.uid()` obtido no servidor, nunca a um owner informado pelo cliente.
- RPCs devem escopar leitura/escrita por proprietário, usar `search_path` seguro, `security definer` conforme padrão atual, revogar `public`/`anon` e conceder somente permissões necessárias. Fechar acesso direto a tabelas/sequências; habilitar RLS como defesa adicional.
- Testar usuário A/B, acesso anônimo, relações entre exercícios e rotinas de outro usuário, e chamada direta das RPCs.
- Como o requisito é uso exclusivo do proprietário, antes da tarefa 4 confirmar a identidade UUID da conta sem acessar senhas/tokens, e definir uma habilitação por UUID protegida também no banco (por exemplo tabela privada de permissões, sem auto-habilitação por cliente). Não deduzir UUID pelo e-mail de contato público nem hardcodificar e-mail como autorização.
- Usuários não habilitados não devem obter recursos de saúde mesmo por chamada direta ao Supabase. Frontend deve descobrir a capacidade por resposta autenticada do servidor, não só por comparação local de e-mail.
- Provisionar essa habilitação em produção é uma ação administrativa separada; exigir autorização e preservar acesso já existente às áreas de foco para outras contas.
- Esta pendência NÃO bloqueia as tarefas 1–3 de Analytics.

### 1.7 Fora de escopo

Acompanhamento diário de saúde, estatísticas de treino/dieta, contagem de calorias, prescrição, IA, integrações externas, notificações, fotos de progresso, medidas corporais, compartilhamento, catálogo público, novos planos de assinatura e refatoração global.

## 2. Critérios verificáveis de aceite

- AC01: dia com 90 minutos mostra `1h 30min`; 60, 30 e 0 têm unidades corretas, sem alterar agregação nem proporção das barras.
- AC02: mapa contém cada dia do mês uma única vez, alinhado ao dia da semana correto, inclusive fevereiro bissexto e virada de ano.
- AC03: filtro semanal/diário não encurta o mapa; seleção do mapa não altera o período dos demais gráficos.
- AC04: dias futuros e espaços fora do mês não aparecem como falhas; erro/loading não aparecem como zeros.
- AC05: seleção de um quadrado mostra data/duração por toque e teclado, com legenda de intensidade fixa entre meses.
- AC06: cadastro de rotina/exercício valida ambos os modos, persiste após recarga e suporta edição/exclusão com confirmação.
- AC07: exclusão de rotina não deixa exercícios órfãos; falha de gravação não limpa formulário nem mostra sucesso.
- AC08: as quatro refeições aparecem na ordem aprovada; alimento com ou sem quantidade persiste e pode ser editado/movido/excluído.
- AC09: conta não habilitada e anônimo não têm acesso ao módulo/CRUD; IDs e vínculos de outra conta não expõem nem alteram seus dados, inclusive RPC direta.
- AC10: saúde não muda métricas, avaliação, streak, checklist ou histórico de foco. Não existem controles de conclusão diária de saúde.
- AC11: rotas existentes, timer/auto-finish/logout continuam funcionais; novas páginas usáveis em 320px, 390px e desktop, com teclado e reduced motion.
- AC12: suítes frontend e Worker, typecheck/build/lint apropriados e revisão de diff passam. Evidências reais de execução são exigidas antes de declarar implementação concluída; QA simulada é identificada como tal.

## 3. Contexto e arquivos inspecionados

- `frontend/src/pages/AnalyticsPage.tsx`: `byDayQuery` e período global alimentam o mapa atual; rótulos/detalhes de barras estão em minutos. Mapa atual usa cor relativa ao máximo do período.
- `frontend/src/utils/analytics.ts`: aritmética de datas civis e `periodRange` já evitam conversão de datas para o timezone local; reutilizar o padrão.
- `frontend/src/hooks/useClock.ts`: `formatMinutesAsHm` retorna formato compacto `1h30`; evitar alterar consumidores indiscriminadamente.
- `frontend/src/layout/AppShell.tsx`, `frontend/src/App.tsx`: navegação e rotas reais. `frontend/src/auth/AuthContext.tsx` fornece owner/estado autenticado.
- `worker/src/routes/notes.ts`, `worker/test/notes.test.ts`: padrão CRUD autenticado, validação e testes de isolamento.
- `worker/src/routes/index.ts`: registro central de rotas; `worker/src/db.ts`: transporte RPC usando JWT do usuário.
- `worker/test/support/database.ts`: aplica todas as migrations em PGlite; suporte disponível para testar SQL real sem produção.
- `supabase/migrations/20260921000300_api_helpers.sql` e `20260921001000_rpc_only_access.sql`: identidade/segurança de RPCs. Migrations novas executadas depois do fechamento global precisam configurar explicitamente permissões de novas funções.
- `frontend/package.json` e `worker/package.json`: comandos e dependências existentes. Não adicionar biblioteca nesta fase.
- `spec.md` e `plan.md` descrevem a entrega v3; suas restrições antigas de não alterar backend não são autorização nem especificação para os novos cadastros.

## 4. Plano incremental — tarefas numeradas

Todos os arquivos marcados **novo** abaixo são propostas, não caminhos/símbolos já existentes. Antes de editar, ler o arquivo real e os consumidores. Cada tarefa segue: teste RED real → implementação mínima por Claude → teste alvo GREEN → revisão Hermes. Não alterar assertions apenas para fazer a implementação passar; explicar mudanças de contrato intencionais. Não extrapolar para a próxima tarefa sem registrar estado e verificação.

### Tarefa 1 — Duração legível no gráfico diário (AC01)

- Editar: `frontend/src/pages/AnalyticsPage.tsx`.
- Testar: `frontend/src/pages/AnalyticsPage.test.tsx`.
- Criar, se necessário: `frontend/src/utils/focusDuration.ts` e `.test.ts` (novo helper específico, sem mudar globalmente o formato compacto existente).
- RED: 90/60/30/0 minutos, duração >24h agregada, unidade no detalhe e preservação da altura relativa das barras.
- Implementar apenas rótulos/detalhes do gráfico diário; preservar outros consumidores.
- Executar no frontend: `npm test -- src/pages/AnalyticsPage.test.tsx`; se houver helper, incluir seu teste; `npm run typecheck`.

### Tarefa 2 — Calendário e níveis fixos do mapa (AC02, AC05)

- Editar: `frontend/src/utils/analytics.ts` e `frontend/src/utils/analytics.test.ts`.
- RED: meses de 28/29/30/31 dias, início em domingo/segunda, dezembro/janeiro, padding sem dados, dias futuros e limites exatos de 60/120/240 minutos.
- Implementar geração de células a partir de datas civis ISO, preenchimento explícito de passados sem registro e classificação de nível. Não converter data civil para timestamp local.
- Separar intervalo consultado de intervalo exibido.
- Executar no frontend: `npm test -- src/utils/analytics.test.ts src/utils/date.test.ts`; `npm run typecheck`.

### Tarefa 3 — Mapa mensal independente e acessível (AC03–05)

- Editar: `frontend/src/pages/AnalyticsPage.tsx`, `.module.css`, `.test.tsx`.
- Usar `frontend/src/api/analytics.ts` sem mudar o contrato se a consulta `byDay` atender ao intervalo mensal.
- RED: Semana/Hoje não limitam mapa; navegação histórica/futura; teclado/toque; carregamento/erro e refetch; troca rápida de meses sem dados do mês errado; resumo e avaliação seguem o filtro original.
- Query mensal com sua própria seleção/intervalo, mantendo namespace de Analytics para invalidar após conclusão de foco. Reutilizar dados se chave/intervalo forem idênticos, sem duplicar request desnecessário.
- Grade de quadrados com legenda e painel de detalhes; placeholders sem interação. Não fazer redesign global.
- Executar no frontend: `npm test -- src/pages/AnalyticsPage.test.tsx src/utils/analytics.test.ts`; `npm test`; `npm run typecheck`; `npm run build`.
- Marco entregável: ajustes de foco podem ser verificados independentemente do módulo de saúde, sem publicar automaticamente.

### Tarefa 4 — Definir e testar habilitação pessoal (AC09)

- Pré-condição: confirmar UUID da conta e estratégia de habilitação no banco. Não usar placeholders em configuração de produção.
- Ler antes de executar: `worker/src/app.ts`, `worker/src/context.ts`, `worker/src/env.ts`, `worker/test/auth.test.ts`, `worker/test/database.test.ts` e migrations de grants/RLS.
- Criar: `supabase/migrations/20261010120000_personal_health_access.sql`, `worker/test/health-access.test.ts` (novos; confirmar ordenação/nomes livres antes).
- Editar, conforme contrato definido: `worker/src/routes/auth.ts`, `frontend/src/api/types.ts` e testes de autenticação correspondentes para expor capacidade de saúde sem expor UUIDs de terceiros. Definir campos exatos antes do RED.
- RED em SQL e HTTP: proprietário habilitado, não habilitado, anon, tentativa de auto-habilitação; chamada direta não bypassa restrição. Conta B mantém acesso normal ao foco se antes permitido.
- Implementar habilitação privada e verificação compartilhada de RPCs; permissões administrativas não concedidas ao cliente.
- Executar no Worker: `npm test -- test/health-access.test.ts test/auth.test.ts test/database.test.ts`; `npm run typecheck`.

### Tarefa 5 — Persistência de rotinas e exercícios (AC06, AC07, AC09)

- Criar: `supabase/migrations/20261010121000_training_catalog.sql`, `worker/test/training-database.test.ts` (novos).
- Modelo proposto: rotina com owner/nome/dias opcionais; exercício ligado à rotina, owner coerente, ordem, nome, séries, modo/alvo e observação.
- Antes do RED definir contrato de limites: proposta nome 150 caracteres, observação 2000, séries/repetições 1..1000, duração 1..86400 segundos; dias únicos 1..7. Valores são limites de validação, não recomendações de treino.
- RED SQL: criação/listagem/edição/exclusão, tipos/limites inválidos, relação de outra conta, ordem determinística, exclusão em cascata/atomicidade, RPC direta/anon e tabelas inacessíveis diretamente.
- Implementar constraints, RPCs específicas e grants explícitos. Não aceitar owner do payload.
- Executar no Worker: `npm test -- test/training-database.test.ts test/database.test.ts`; revisar migration idempotente conforme convenção real.

### Tarefa 6 — API de treino (AC06, AC07, AC09)

- Criar: `worker/src/routes/training.ts`, `worker/test/training.test.ts` (novos).
- Editar: `worker/src/routes/index.ts`; `worker/src/domain.ts` apenas se houver contratos centrais aplicáveis.
- Proposta de rotas: CRUD `/api/training/routines`, detalhe `/:id`, exercícios por rotina e edição/exclusão por ID com vínculo validado. Fechar envelope/paginação/payloads antes do RED seguindo o padrão existente.
- RED HTTP: status 201/200/204, validação, edição parcial sem apagar campos omitidos, troca de modo com alvo consistente, ID inexistente, acesso não habilitado/entre contas.
- Executar no Worker: `npm test -- test/training.test.ts test/training-database.test.ts test/health-access.test.ts`; `npm run check`.

### Tarefa 7 — Persistência dos alimentos por refeição (AC08, AC09)

- Criar: `supabase/migrations/20261010122000_meal_catalog.sql`, `worker/test/nutrition-database.test.ts` (novos).
- Modelo proposto: owner, meal enum `BREAKFAST/LUNCH/AFTERNOON_SNACK/DINNER`, nome, quantidade textual opcional, ordem estável e timestamps do servidor.
- Limites propostos: nome 150, quantidade 150 caracteres; trim obrigatório; quantidade vazia normaliza para null.
- RED SQL: quatro valores válidos, enum/nome inválidos, quantidade opcional, edição/mudança de refeição/exclusão, ordem estável, isolamento/habilitação/grants.
- Nenhuma tabela de consumo diário ou campo completed.
- Executar no Worker: `npm test -- test/nutrition-database.test.ts test/database.test.ts`.

### Tarefa 8 — API de alimentação (AC08, AC09)

- Criar: `worker/src/routes/nutrition.ts`, `worker/test/nutrition.test.ts` (novos).
- Editar: `worker/src/routes/index.ts` e contrato central somente se necessário.
- Proposta: CRUD `/api/nutrition/foods`, detalhe `/:id`; listagem paginada seguindo convenções existentes. Garantir que frontend obtém todos os registros necessários, não só a primeira página.
- RED HTTP: validar enum/trim/limites, preservar quantidade quando omitida no PATCH, limpar quando null explícito, mudar seção, exclusão, anônimo/usuário não habilitado/ID alheio.
- Executar no Worker: `npm test -- test/nutrition.test.ts test/nutrition-database.test.ts test/health-access.test.ts`; `npm run check`.

### Tarefa 9 — Clientes e contratos frontend (AC06–10)

- Editar: `frontend/src/api/types.ts`.
- Criar: `frontend/src/api/training.ts`, `.test.ts`, `frontend/src/api/nutrition.ts`, `.test.ts` (novos).
- Ler `frontend/src/api/client.ts` e `pagination.ts` antes; reutilizar transporte, tratamento de erros e envelope reais.
- RED: payload/URL corretos, autenticação/erro propagados, paginação, PATCH omitido versus null, sem dados demonstrativos.
- Executar no frontend: `npm test -- src/api/training.test.ts src/api/nutrition.test.ts`; `npm run typecheck`.

### Tarefa 10 — Tela de rotinas (AC06, AC07)

- Criar: `frontend/src/pages/TrainingPage.tsx`, `.module.css`, `.test.tsx` (novos).
- RED: vazio, cadastro de rotina, seleção/listagem, edição/exclusão confirmada, dias opcionais, loading/erro, erro de save preservando valores, bloqueio de envio duplicado e cache por usuário.
- Implementar forms consistentes com v3. Não integrar exercício complexo antes da tarefa seguinte.
- Executar no frontend: `npm test -- src/pages/TrainingPage.test.tsx`; `npm run typecheck`.

### Tarefa 11 — Exercícios dentro da rotina (AC06, AC07)

- Editar: os três arquivos da TrainingPage.
- RED: criar/editar/excluir exercício, modos repetição/duração, valores inválidos, alternância de modo, ordem e atualização após mutation sem consultar Analytics.
- Sem histórico diário, timer ou checkbox de treino concluído.
- Executar no frontend: `npm test -- src/pages/TrainingPage.test.tsx`; `npm run typecheck`.

### Tarefa 12 — Tela das quatro refeições (AC08)

- Criar: `frontend/src/pages/NutritionPage.tsx`, `.module.css`, `.test.tsx` (novos).
- RED: quatro seções/ordem/labels, vazio, alimento com/sem quantidade, editar/mover/excluir confirmado, paginação completa, formulário preservado em erro, envio duplo bloqueado e isolamento de cache.
- Quantidade sem cálculo nutricional; não criar ações de cumprimento diário.
- Executar no frontend: `npm test -- src/pages/NutritionPage.test.tsx`; `npm run typecheck`.

### Tarefa 13 — Rotas, navegação e capacidade de acesso (AC09–11)

- Editar: `frontend/src/App.tsx`, `frontend/src/layout/AppShell.tsx`, `.module.css`, `.test.tsx`; teste de integração de rotas novo se necessário.
- RED: conta habilitada vê/abre Treino/Alimentação; conta não habilitada não vê links e URL direta é bloqueada; saúde não altera nav/rotas existentes, timer, logout e auto finish.
- Layout com sete entradas precisa validação móvel; preferir adaptação pequena a redesenhar o shell inteiro. A UI não é a barreira de segurança do backend.
- Executar no frontend: `npm test -- src/layout/AppShell.test.tsx src/auth/AuthContext.test.tsx src/pages/TrainingPage.test.tsx src/pages/NutritionPage.test.tsx`; `npm test`; `npm run typecheck`; `npm run build`.

### Tarefa 14 — Revisão e verificação integrada (AC01–12)

- Hermes revisa diff contra escopo e REDs por tarefa. Claude reviewer em modo somente leitura avalia UX/segurança; corrigir bloqueadores com regressão antes de integrar.
- Rodar `git diff --check`; no frontend `npm test && npm run typecheck && npm run build`; no Worker `npm run check`.
- Testar migrações novas no banco local PGlite e, se disponível, ambiente de staging autorizado. Não aplicar automaticamente no Supabase de produção.
- Browser QA desktop/390/320px: mapa mensal em filtros distintos, leitura por teclado/toque, troca de mês, forms/confirm dialogs, recarga, rotas protegidas, erro/loading e reduced motion. Evidenciar ausência de overflow.
- Exercitar persistência real em ambiente autorizado; mocks comprovam UI, não sincronização real. Não declarar login/mutations de produção verificados com fixtures.
- Confirmar cadastro de saúde não modifica nenhum resumo/streak/avaliação de foco. Saúde não se torna evento de diário automaticamente.
- Relatório: resultado, comandos/outputs reais, riscos, pendências, commit/autoria e conclusão. Neste plano não há autorização de commit/push/deploy; solicitar escopo dessas ações antes de executá-las.

## 5. Riscos, decisões e próximos passos

- **Acesso pessoal:** definir/provisionar UUID e habilitação no SQL antes de saúde; não confundir isolamento entre usuários com exclusividade do módulo. Não alterar allowlist global de foco para resolver um requisito específico de saúde.
- **Persistência:** os novos cadastros exigem migrations/Worker/frontend, diferente dos ajustes de Analytics que podem ser entregues primeiro.
- **Datas:** consultas existentes usam timezone de backend configurável e frontend usa datas civis. Preservar contrato atual; se houver divergência comprovada, tratar explicitamente sem reformular timezone global silenciosamente.
- **Limites e modelo:** limites técnicos e rotina com dias opcionais são propostas mínimas. Qualquer necessidade de descanso entre séries, progressão, intervalos de repetições, drag-and-drop ou cronograma diário fica para novo escopo.
- **Exclusão:** não introduzir soft delete ou histórico oculto sem necessidade; confirmação é obrigatória para operações destrutivas.
- **Tamanho do menu:** verificar mobile com sete entradas e timer; não assumir que adicionar links basta.
- **Planos antigos:** `plan.md` contém instruções históricas de push/deploy para v3; não reutilizar como aprovação de publicação desta fase.

**Próximo passo sugerido:** executar primeiro a tarefa 1 pelo Claude Code CLI, depois tarefas 2–3. Antes das tarefas de saúde, fechar a habilitação pessoal e promover o escopo para `spec.md`/`plan.md`/AGENTS.md conforme fluxo Spec-Driven. Não implementar todas as tarefas em uma chamada sem checkpoints.
