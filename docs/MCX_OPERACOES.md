# MCX Operações — especificação para desenvolvimento (Claude Code)

> Local deste arquivo no repositório: `docs/MCX_OPERACOES.md` (raiz, fora de `agencia/`). Versão de 20/11/2026.

## 0. Como você vai trabalhar

Você está no repositório `mcxoperacoescomerciais-debug/mcx`. A pasta **`agencia/`** é o **MCX Campo, em produção em `mcx-campo.onrender.com`, com mais de 50 promotores usando agora**. As pastas `web/`, `suinco_app/`, `suinco_admin_app/` e `app/` são legados (SUINCO, já desativado) — não mexa nelas.

### REGRA Nº 1 — O MCX Campo não pode ser afetado. Em nenhuma hipótese.

O MCX Operações é um **sistema separado**: outra pasta, outro deploy e outro banco (detalhes na seção 3). Na prática:

- **Proibido alterar qualquer arquivo dentro de `agencia/`** sem minha aprovação explícita, por escrito, para aquela alteração específica. Isso inclui `package.json`, `package-lock.json`, migrations, schema, service worker, manifest, `next.config.ts`, rotas `/app` e `/api/*`.
  - A Fase 0 pode **ler** `agencia/` à vontade.
  - Se alguma funcionalidade parecer exigir mudança no Campo, pare e me explique o motivo e o risco antes.
- **Proibido** rodar migration, seed, script ou qualquer escrita no banco de produção do Campo. O Operações só **lê** dados do Campo, com um usuário de banco somente leitura (seção 3).
- **Proibido** fazer push na branch `main` ou em qualquer branch que dispare deploy do `mcx-campo`.
  - Trabalhe na branch `feat/mcx-operacoes`.
  - Na Fase 0, descubra e me informe qual branch e quais caminhos disparam o deploy automático do Campo no Render. O comando `start:render` roda `db:migrate` a cada início: um push errado aplica migration na produção.
- **Guarda automática:** crie um teste ou check de CI que **falhe** se o diff da branch alterar qualquer arquivo em `agencia/`.
- Antes de cada entrega, rode em `agencia/` (sem alterar nada) `npm run typecheck`, `npm test` e `npm run build`, para provar que o Campo continua íntegro.

Regras de trabalho:

1. **Trabalhe por fases e pare no fim de cada uma.** Ao terminar uma fase, entregue o resumo do que mudou, as migrations criadas, os testes rodados e o que precisa de decisão minha. Só avance quando eu aprovar.
2. **A Fase 0 não escreve código de produto.** Ela termina com um diagnóstico curto (máximo 2 páginas), o plano de tabelas e rotas da Fase 1 e o **plano de deploy separado** (seção 7).
3. **Testes:** o Operações tem a própria suíte (`typecheck`, `lint`, `test`, `build`), que precisa passar a cada entrega.
4. **Use o Campo como referência de padrões** (Next.js 16, Drizzle, server actions, sessão com `jose`, `audit()`, driver de storage, cron via GitHub Actions). **Copie e adapte** o que for útil para dentro de `operacoes/`. Não importe código direto de `agencia/`: uma mudança lá não pode quebrar o Operações, e vice-versa. Não introduza ORM, UI kit ou estado global diferentes sem me perguntar.
5. **Migrations só aditivas, e só no banco do Operações.** Nada roda em produção sem eu aprovar.
6. **Não invente dado operacional.** Se faltar informação (nome de cliente, regra, valor), pergunte. Sem dados fictícios fora do seed de desenvolvimento.
7. **Medição de tempo transparente, sem ponto.** Nada de bater ponto, captura de tela, teclado, navegação fora do sistema, nem bloqueio ou alerta por inatividade. O tempo é medido como descrito na seção 4.5, e a própria pessoa vê tudo o que é registrado sobre ela.

---

## 1. Contexto de negócio (o necessário)

**MCX Soluções Operacionais** (MEI, Divinópolis/MG) faz backoffice terceirizado para agências de promotoria e representantes comerciais, e vende o MCX Campo às agências.

Equipe:

- **Eduardo** — dono, comercial e desenvolvimento.
- **Maria** — sócia, toca a operação diária de todos os clientes.
- **Tainara** — prestadora de serviço pessoa física desde 28/10/2026. Faz acompanhamento de promotores, planilhas, e-mails e relatórios.

**Problema:** a operação interna está espalhada.

- Tarefas no Notion (banco "Projetos e Tarefas").
- Controles em Google Sheets e Excel.
- Documentos em Drive e WhatsApp.
- Pedidos de clientes chegando por WhatsApp e e-mail.

**Objetivo do MCX Operações:** a equipe MCX registrar, distribuir e concluir todas as demandas internas dentro do MCX Campo, com rotinas recorrentes geradas sozinhas, documentos de clientes guardados com segurança e **horas apontadas por cliente**, para saber quanto custa atender cada um.

**Volume real:** cerca de 30 demandas por semana (95 tarefas entre 29/10 e 20/11/2026).

### Clientes atuais (contratantes)

| Contratante | Tipo | Marcas / observação |
|---|---|---|
| Etros Promocional (Marcelo, BH) | Agência | Maior contrato. A MCX atua em white label |
| AF Merchandising (contato: Adriana) | Agência | Fixo de backoffice + app (26 promotores). **Confirmar se o "Adriana" do Notion é a AF** |
| Helvécio | Representante | Café Bravo, Barão (no Notion: "Helvecio-Café" e "Helvecio-Barão"; "Queijo" = Barão), Danper |
| Lucas | Representante | Amendupã, Junco, Brascoco, Fini, ZD |
| Regis | Representante | Papel Fofinho, Bel Chocolate, Fralda DTM |
| "William Danper" | ? | **Confirmar:** é contato do Helvécio ou contratante próprio? |

### O que a operação faz (categorias tiradas das tarefas reais)

| Categoria | Exemplos reais |
|---|---|
| Pedidos | Digitar pedido ABC/DTM/Junco/Fini; cadastrar cliente no sistema da indústria; erro de DANFE; prorrogar boleto |
| Roteiro e programação | Traçar/ajustar rota; programar visitas; remanejar loja; alterar dias de atendimento; enviar lojas ao promotor; lojas sem visita |
| Fechamento e financeiro | Fechamento mensal por cliente/marca (com e sem nota); conferir planilha de fechamento; cobrar NF de promotora; dados de PIX/CNPJ |
| Relatórios para marcas | Relatório SUINCO; acompanhamento MDias/Book; vídeo de ação; preencher planilha do cliente |
| Degustação | Planejar/validar degustações do mês; projeção; cotação de insumos |
| Promotores e RH | Abrir vaga; pedir dados para cadastro; enviar logins do app; treinamento; avisos (feriado) |
| Implantação do app | Configurar sistemática do cliente; cadastrar lojas de marca nova; apresentação |
| Comercial MCX | Prospecção, propostas, contatos com marcas |
| Interno MCX | Conteúdo, administração da própria MCX |

### Falhas do Notion que o sistema precisa resolver

- Responsável nunca preenchido.
- Quase nenhuma tarefa com prazo.
- Rotinas mensais recriadas à mão.
- Duplicatas.
- "Aguardando retorno" sem saber de quem nem quando cobrar.
- Zero medição de tempo.

---

## 2. O que já existe no Campo (verificado — confirme na Fase 0; serve de referência, não de lugar para construir)

- **Stack:** Next.js 16 (App Router) + TypeScript, Drizzle + PostgreSQL (Supabase), PGlite em desenvolvimento, PWA do promotor, testes com `node --test` via `tsx`, e `@anthropic-ai/sdk` já nas dependências.
- **Multiempresa:** a tabela `agencies` tem `kind` = `client` ou `platform`. **A MCX já é uma agência `platform`.**
  - Usuários da equipe MCX têm `users.platform = true` e `platformRole` = `owner` (Dono) ou `master` (membro da equipe MCX).
  - O cadastro da equipe fica em `src/server/platform-team.ts`, e só o `owner` cadastra.
- **Área da MCX já existente:** `/painel/mcx` (agências, armazenamento, equipe, escopos, melhorias). **Ela continua como está;** o Operações não é construído dentro dela.
- **Isolamento:** toda consulta passa pelo `Scope` (`src/server/auth.ts` e `src/server/scope.ts`) com `agencyId`. Não há RLS no banco; a segurança é feita no servidor — use o mesmo modelo (segurança no servidor) no Operações.
- **Arquivos:** o driver em `src/server/storage.ts` usa Cloudflare R2 privado (fallback no Supabase; disco local em dev). Arquivos nunca são servidos por URL pública: saem por rota autenticada que confere permissão (padrão `/api/photos/:id`). A exclusão é lógica (`deleted_at`).
- **Agendamento:** GitHub Actions chama `/api/cron/*` (`schedules`, `storage`). Use o mesmo padrão para as recorrências.
- **Auditoria:** `audit_logs` e a função `audit()`.
- **Alertas:** `whatsapp-alert.ts` (CallMeBot) para a equipe MCX.
- **Atenção a nomes parecidos — não reaproveite para o interno sem analisar:**
  - O módulo `financeiro` e a tabela `fixed_expenses` são o financeiro **das agências**.
  - `work-time.ts` mede o tempo **dos promotores**.
  - O módulo `pendencias` trata problemas **de campo**.

---

## 3. Decisões de arquitetura

1. **Aplicação separada:** nova pasta **`operacoes/`** na raiz do repositório, um app Next.js próprio, com `package.json`, build, testes e deploy independentes. Ele roda num **serviço separado no Render** (ex.: `mcx-operacoes`). Fazer deploy, reiniciar ou derrubar o Operações não toca no `mcx-campo`.
2. **Banco próprio:** um **projeto Supabase separado** (ou, se você justificar na Fase 0, um banco Postgres separado). Todas as tabelas do Operações vivem lá. Nada é criado no banco do Campo.
3. **Leitura do Campo, só quando necessário:** quando o Operações precisar de dados do Campo (lista de agências, marcas e lojas para vincular demandas; mais tarde, eventos como loja sem visita), a leitura usa uma **segunda conexão com usuário Postgres somente leitura** (`CAMPO_READONLY_DATABASE_URL`).
   - Consultas leves, paginadas e com timeout curto (ex.: 3 s), para não pesar no banco que os promotores usam.
   - Nunca rodam em loop de alta frequência.
   - Se o Campo estiver lento ou fora, o Operações continua funcionando sem esses dados.
   - A criação desse usuário somente leitura é uma ação no banco do Campo, então **eu faço**, seguindo instruções que você escreve.
4. **Vínculos com o Campo são referências, não chaves estrangeiras:** a demanda e o contratante guardam `campo_agency_id`, `campo_brand_id`, `campo_store_id` e `campo_promoter_id` (opcionais), mais uma cópia do nome para exibição. Quando a marca não existe no Campo (representantes), use texto livre.
5. **Login próprio:** tabela de usuários do Operações (Eduardo, Maria e Tainara para começar), sessão própria, com cookie e domínio diferentes dos do Campo. Nenhuma conta de agência ou promotor existe no Operações.
6. **Arquivos:** bucket R2 **separado** (ou, no mínimo, credenciais separadas restritas a um prefixo), com download só por rota autenticada.
7. **Permissões internas:**
   - `owner`: Eduardo — tudo, inclusive usuários e configurações.
   - `gestor`: Maria — vê e edita todas as demandas, distribui, configura rotinas, vê horas de todos, contratos e documentos.
   - `operacional`: Tainara — vê as próprias demandas e as que forem compartilhadas com ela; cria demandas; aponta as próprias horas. Não vê contratos (valores), documentos marcados como restritos nem horas de outras pessoas.
   - O desenho deve permitir uma nova pessoa ou um novo papel sem refatorar.
8. **Fuso:** `America/Sao_Paulo` em datas, prazos e geração de rotinas.
9. **Interruptor geral:** a variável `OPS_ENABLED` permite desligar o Operações inteiro sem afetar nada mais.

---

## 4. Escopo da V1

### 4.1 Contratantes e contratos (cadastro enxuto)

- **Contratante:**
  - nome;
  - tipo (agência ou representante);
  - CNPJ/CPF (opcional);
  - status;
  - contatos (nome, função, WhatsApp, e-mail);
  - marcas atendidas;
  - vínculo opcional com uma agência do Campo (`campo_agency_id`, apenas referência);
  - observações.
- **Ficha operacional:** um texto estruturado por seções fixas — como faz pedido, sistemas usados, regras de visita, fechamento, relatórios e particularidades. **Proibido guardar senha**: o máximo é um campo "onde está a credencial".
- **Contrato:**
  - contratante;
  - serviços;
  - valor mensal;
  - dia de vencimento;
  - início;
  - vigência (padrão de 6 meses);
  - renovação automática (sim/não);
  - status;
  - arquivo (via módulo de documentos);
  - histórico de aditivos (registro com data, descrição e novo valor).
- **Alertas de contrato:** 30 e 7 dias antes do fim da vigência, gerados como demanda para o `gestor`.

### 4.2 Demandas (núcleo)

**Campos obrigatórios** (com captura rápida possível):

- título;
- contratante (ou "Interno MCX");
- categoria (sugerida pelo histórico do contratante e editável);
- responsável;
- status;
- prioridade (padrão Média);
- prazo, com atalhos Hoje / Amanhã / Sexta / Data / Sem prazo. "Sem prazo" só é aceito com prioridade Baixa.

**Campos opcionais:**

- descrição;
- marca;
- loja;
- promotor;
- origem (Manual, WhatsApp, E-mail, Reunião, Ligação, Rotina, Sistema; padrão Manual);
- checklist;
- comentários;
- anexos;
- tempo estimado.

**Categorias:** as 9 da tabela da seção 1, editáveis pelo `gestor`.

**Status:** A fazer · Em andamento · Aguardando retorno · Em aprovação · Concluído · Cancelado.

**Prioridades:** Baixa · Média · Alta · Urgente (Urgente com destaque visual).

**Regras:**

- "Aguardando retorno" exige **de quem se espera** (texto livre) e **data de cobrança**. No dia da cobrança, a demanda volta a aparecer na fila do responsável.
- Atraso é calculado na hora da consulta (prazo menor que hoje e não concluída), não por job.
- Toda mudança de status, responsável ou prazo grava histórico (quem, quando, de, para). Concluir grava data e autor. Reabrir é permitido a `gestor` e `owner`.
- **Anti-duplicata:** ao criar, avisar se existir demanda aberta do mesmo contratante com título muito parecido, mas sem bloquear.
- **Subtarefas:** use checklist (ver seção 4.12, modelos de checklist). Subtarefa como demanda filha fica fora da V1.

**Visões:**

1. **Minha fila** — a tela inicial de cada usuário: atrasadas, depois hoje, depois "cobrar hoje", depois as próximas.
2. **Lista da equipe** — com filtros por responsável, contratante, categoria, status, prioridade, atrasadas e aguardando.
3. **Kanban por status** — arrastar e soltar persiste no banco e grava histórico. Precisa funcionar no celular; se o arrastar ficar ruim no mobile, use troca de status por toque.

**Captura rápida:** um botão fixo "+ Demanda" que funciona bem no celular. A meta é registrar uma demanda simples (título + contratante + responsável + prazo) em menos de 10 segundos.

### 4.3 Rotinas recorrentes

- **Cadastro:**
  - nome;
  - contratante;
  - categoria;
  - responsável padrão;
  - frequência (semanal em dias escolhidos, mensal em dia X, a cada N dias);
  - antecedência de geração (ex.: gerar 2 dias antes);
  - prazo relativo;
  - modelo de checklist da biblioteca (seção 4.12);
  - ativa/pausada.
- **Geração:** feita pelo cron (`/api/cron/...` via GitHub Actions), **idempotente**: chave única (`rotina_id`, data da ocorrência). Rodar duas vezes não duplica.
- **Exemplos reais para o seed de desenvolvimento:** fechamento mensal Café Bravo; fechamento mensal Barão; fechamento AF; fechamento Regis; fechamento Lucas; relatório semanal SUINCO; acompanhamento MDias; programação mensal de visitas; planejamento de degustações do mês.

### 4.4 Documentos

- Upload por um driver de storage próprio do Operações (adaptado do `storage.ts` do Campo), em bucket separado, com chave por contratante (ex.: `<contratante>/...`). Download e pré-visualização (PDF e imagem) por rota autenticada que confere permissão a cada acesso, seguindo o padrão das fotos.
- Vínculo com contratante, contrato, marca e promotor (cada um opcional), categoria e data de validade (opcional).
- **Categorias:** Contrato, Aditivo, Nota fiscal, Comprovante, Documento de promotor, Sistemática, Mix/Tabela de preço, Proposta, Interno, Outros.
- **Versões:** um novo upload do "mesmo documento" cria uma versão e mantém as anteriores.
- **Visibilidade na V1:** sempre interna. Um campo `restrito` (só `gestor`/`owner`) é obrigatório para Contrato e Documento de promotor. **Não há compartilhamento com cliente na V1.**
- **Log de acesso:** registrar no `audit()` o download de documento restrito.
- **Limites:** validar tipo (PDF, imagem, xlsx, docx, csv) e tamanho (ex.: 15 MB).
- Documento com validade próxima (30 dias) gera demanda para o `gestor`.

### 4.5 Visibilidade da equipe e tempo (sem bater ponto)

**Perguntas que o sistema precisa responder:**

1. Com quais contratantes gastamos mais tempo?
2. Quanto tempo leva, em média, cada tipo de demanda?
3. Quanto tempo cada pessoa passou trabalhando no MCX por dia, e qual é a carga dela?
4. Quando a equipe passa da capacidade, ou seja, quando contratar?

A ideia é medir com o mínimo de esforço da equipe. Ninguém bate ponto; o tempo é registrado de três formas, da mais confiável para a menos.

**A) Tempo por demanda — a fonte principal**

- **Ao concluir uma demanda**, o campo "Quanto tempo levou?" é obrigatório. Ele usa botões rápidos (5, 15, 30, 45 min, 1h, 2h, Outro) e vem pré-preenchido com o tempo do cronômetro, se a pessoa usou. Isso garante que 100% das demandas concluídas tenham tempo, mesmo quando o trabalho aconteceu fora do sistema (WhatsApp, planilha, sistema da indústria).
- **Cronômetro opcional** na demanda: iniciar e parar. Só um ativo por usuário; iniciar outro para o anterior, com aviso.
- **Lançamento manual:** data, duração e demanda. Edições ficam no histórico.
- **Campo "Tipo"** (subcategoria) com lista editável por categoria. Exemplo para Pedidos: Digitar pedido, Cadastrar cliente, Problema de NF/boleto. As rotinas preenchem o tipo sozinhas. Sem esse campo não dá para calcular tempo médio por tipo de demanda, porque os títulos livres variam demais.

**B) Tempo de atividade no MCX — passivo e indicativo**

- Enquanto a aba do MCX estiver **visível** e tiver havido interação (clique, toque, digitação) nos últimos 5 minutos, o navegador manda um sinal a cada 60 segundos. A soma vira "tempo ativo no sistema" do dia, junto com o horário do primeiro e do último sinal.
- Não registra conteúdo digitado, telas, URLs nem nada fora do MCX. Não gera bloqueio, alerta nem cobrança por inatividade.
- Na interface o rótulo é **"tempo no sistema"**, nunca "horas trabalhadas": boa parte do trabalho real acontece fora do MCX.

**C) Eventos do dia — sai do histórico, sem coleta extra**

Demandas criadas, movidas e concluídas por pessoa e por dia.

**Telas:**

- **"Meu dia"**, para cada usuário: o tempo no sistema, o tempo apontado em demandas e as concluídas. A pessoa vê exatamente o que o gestor vê sobre ela.
- **Painel da equipe**, para `owner` e `gestor`:
  - por pessoa e por dia: tempo no sistema, tempo apontado, demandas concluídas e carga aberta (quantidade e horas estimadas);
  - **adicionar ou redistribuir demandas na fila de qualquer pessoa** direto desse painel.
- **Relatórios do mês:**
  - horas por contratante;
  - horas por categoria e por tipo;
  - tempo médio, mediana e quantidade por tipo de demanda;
  - ranking de contratantes por horas.
- **Capacidade:** horas apontadas ÷ horas disponíveis da pessoa (configurável, por exemplo 40 h/semana), por semana. Destaque quando a equipe passar de 80% por 4 semanas seguidas; é o sinal de contratação.
- **Horas × Receita por contratante no mês:**
  - horas apontadas;
  - custo/hora configurável (um valor por pessoa, visível só para `owner` e `gestor`);
  - custo estimado;
  - valor mensal do contrato;
  - resultado e margem.

  Basta uma tabela ordenável.

**Regras:**

- O tempo no sistema não serve para pagamento, desconto ou advertência.
- Os dados de atividade ficam guardados por 12 meses.
- A tela "Meu dia" explica, em uma frase, o que é medido.

### 4.6 Painel inicial do MCX Operações

Uma tela, dados reais, filtro de período (mês atual por padrão):

- Abertas por responsável.
- Atrasadas.
- Aguardando retorno com cobrança vencida.
- Demandas sem responsável (deve ser zero).
- Concluídas no período.
- Rotinas geradas hoje.
- Contratos vencendo em até 30 dias.
- Documentos vencendo em até 30 dias.
- Horas por contratante no mês × valor do contrato (atalho para o relatório da seção 4.5).

### 4.7 Importação do Notion

- **Entrada:** o CSV exportado manualmente do banco "Projetos e Tarefas" e do banco "Clientes". Você não tem acesso ao Notion.
- **O que importar:**
  - demandas **não concluídas**, com status mapeado 1:1;
  - "Data de Término" vira prazo;
  - "Clientes" vira contratante, pela tabela de mapeamento.
- **O que não importar:** concluídas (ficam como arquivo no Notion) e registros de "Clientes" que não são clientes: "Maria", "Tainara" e "MCX" (este vira "Interno MCX").
- **Mapeamento:** "Helvecio-Café" e "Helvecio-Barão" → contratante Helvécio, marcas Café Bravo e Barão. "Adriana" e "William Danper" → **perguntar antes**.
- **Fluxo:** um script com pré-visualização (dry-run) que lista o que vai entrar, as duplicatas prováveis e as linhas sem responsável. Linhas sem responsável entram como "A distribuir" e aparecem para o `gestor`. Não invente responsável nem prazo.

### 4.8 Comercial — CRM e follow-up

**Objetivo:** cada lead em uma etapa do funil, sempre com a **próxima ação e a data** definidas. Todo dia, o sistema diz quem precisa ser contatado e entrega a mensagem pronta.

Prospecção é papel do `owner` (Eduardo); a `gestora` (Maria) também pode ter leads, por exemplo marcas. O `operacional` não acessa o CRM.

**Contexto comercial real (para orientar o desenho):**

- **ICP principal:** agências de promotoria. Também prospectamos representantes, agências de degustação/ação e marcas/indústrias (para tornar o MCX Trade o "app oficial" da marca).
- **Produtos e preços:**

  | Produto | Preço |
  |---|---|
  | Backoffice | Pacotes de R$ 1.250 a R$ 1.450/mês; agências sob proposta |
  | App MCX Trade | Por promotor/mês: até 20, R$ 60; de 21 a 50, R$ 55; acima de 50, R$ 50. Sem implantação |
  | Módulo degustação | Até 30 ações, R$ 590; de 31 a 50, R$ 900; de 51 a 80, R$ 1.200 |
  | Administrativo (RH/financeiro/pagamentos) | Sob proposta |

- **Processo atual:** lista de agências → abordagem pela dor (WhatsApp ou ligação) → demonstração do painel com dados reais → proposta (validade de 10 dias) → teste sem taxa de implantação → fechamento. Cadência: novo contato no D0 e follow-ups no D+3 e D+7.
- **Ritmo-alvo:** 5 contatos novos por dia. Na última rodada, 6 agências abordadas resultaram em 1 fechamento (a Etros).
- **Expansão nos clientes atuais também é pipeline.** Exemplos: vender o app aos promotores contratados da Etros e o painel às marcas atendidas pela AF; indicações de agências vindas das marcas.

**Lead (empresa + contato):**

- empresa;
- tipo (Agência de promotoria, Agência de degustação/ação, Representante, Marca/Indústria, Outro);
- cidade e região;
- contato principal (nome, cargo, WhatsApp, e-mail) e contatos adicionais;
- **origem:** Prospecção ativa, Indicação (com campo "indicado por": cliente, marca ou pessoa), Instagram, Anúncio, Evento, Outro;
- **produto(s) de interesse:** Backoffice, App, Degustação, Administrativo;
- **porte:** nº de promotores ou de ações por mês;
- **valor mensal potencial**, calculado automaticamente pelas tabelas acima a partir do porte, e editável;
- vínculo opcional com um contratante existente (oportunidade de expansão);
- responsável;
- tags.

**Funil** (etapas editáveis pelo `owner`; estas são as iniciais):

1. A prospectar (lista)
2. Primeiro contato feito
3. Em conversa (respondeu)
4. Demonstração agendada/feita
5. Proposta enviada — registrar valor, data e validade
6. Em teste/implantação
7. Ganho → cria o contratante e um contrato em rascunho, e gera uma demanda de implantação com checklist
8. Perdido → **motivo obrigatório** (Preço, Sem resposta, Já tem sistema, Sem dor agora, Escolheu concorrente, Outro)
9. Nutrição → lead que não é para agora; exige data de retomada

Mover o lead de etapa é feito por kanban (arrastar no desktop, botão no celular) e grava histórico com data. Isso permite medir o tempo de ciclo e a conversão por etapa.

**Follow-up — o centro do módulo:**

- **Toda etapa aberta exige "próxima ação" e "data da próxima ação".** Não é possível salvar um lead aberto sem essas duas informações.
- **Cadência automática:** ao registrar o primeiro contato, o sistema sugere as próximas ações em D+3 e D+7. Se não houver resposta após o D+7, sugere mover para Nutrição (retomada em 30 dias) ou Perdido.
- **Tela "Comercial hoje"**, com quatro grupos:
  1. follow-ups vencidos;
  2. follow-ups de hoje;
  3. propostas perto de vencer a validade;
  4. a meta de novos contatos do dia (ex.: 3 de 5).
- **Registro de interação:** tipo (WhatsApp, ligação, e-mail, reunião, demonstração), resumo curto e resultado. Registrar uma interação já pede a próxima ação.
- **Modelos de mensagem por etapa,** com variáveis `{nome}`, `{empresa}`, `{cidade}` e `{produto}`. O botão **"Abrir no WhatsApp"** monta um link `https://wa.me/<número>?text=<mensagem>` com o texto pronto, abre o WhatsApp de quem clicou e registra a interação. O envio continua sendo humano.
- **Preparar para automação futura, sem implementar:**
  - tabela de modelos com status de aprovação;
  - fila `outbound_messages` (lead, modelo, canal, agendado_para, status);
  - controle de opt-out por contato (o contato pediu para não receber mensagens).

  A automação real virá depois, pela **API oficial do WhatsApp (Cloud API da Meta)**, nunca por automação do WhatsApp Web.

**Painel comercial (mês e últimas 4 semanas):**

- novos contatos por semana, comparados com a meta;
- taxa de resposta;
- quantas demonstrações, propostas e fechamentos;
- conversão entre etapas;
- tempo médio de ciclo;
- pipeline em aberto (soma e soma ponderada pela etapa);
- MRR ganho no mês;
- motivos de perda;
- resultados por origem e por tipo de lead.

**Importação:** CSV de leads (empresa, contato, WhatsApp, cidade, tipo, origem), com detecção de duplicata por WhatsApp e nome da empresa.

**LGPD:** guardar só dados de contato profissional e a origem do dado; respeitar opt-out; permitir excluir um contato a pedido.

### 4.9 Assistente MCX — chat com IA para o perfil operacional (API, piloto de 1 mês)

**Objetivo:** o `operacional` (Tainara) usar um chat de IA dentro do MCX, em vez do ChatGPT pessoal. Os dados de clientes ficam no ambiente da empresa. O piloto dura 1 mês e serve para **medir o custo real** antes de decidir se fica.

**Regra de licença (não negociável):** o chat usa **somente a API da Anthropic, com chave própria da MCX** (`ANTHROPIC_API_KEY`, guardada só no servidor). **É proibido** usar, simular ou repassar o login, os cookies ou os tokens de uma assinatura do claude.ai (Pro/Max) dentro do MCX. Isso viola os termos da Anthropic e põe a conta da empresa em risco.

**Funcionalidades:**

- Tela "Assistente" com lista de conversas (criar, renomear, arquivar) e histórico por usuário. Cada pessoa vê só as próprias conversas.
- Envio de texto, imagens (foto de pedido, print) e PDF, com limite de tamanho. Resposta em streaming.
- Instruções de sistema fixas, editáveis só pelo `owner`: contexto da MCX, tom, regras como "nunca invente dado de cliente" e "não peça senhas", e quando sugerir criar uma demanda.
- Botão "Transformar em demanda" numa resposta: abre a captura rápida já preenchida. Esse é o único vínculo com o sistema na V1. **Sem ferramentas que leiam ou gravem dados do MCX na V1.**
- A biblioteca "Prompts MCX" (modelos de instrução por tarefa: extrair pedido de foto, mensagem para promotor, relatório para marca, fórmula de planilha) abre direto no Assistente.

**Controle de custo (obrigatório):**

- Modelo configurável pelo `owner`. Padrão: **Claude Haiku 5.5**; opção: Sonnet 5.5, para comparar no piloto. Use o nome de modelo atual da documentação oficial; o Campo já chama a API em `agencia/src/server/improvements.ts` — use como referência, sem alterar o arquivo.
- Tabela `ai_usage`: usuário, conversa, modelo, tokens de entrada e saída, custo calculado em US$ (preços por milhão de tokens configuráveis em settings), data.
- **Limite mensal por usuário e limite global em US$** (padrão: US$ 10 global por mês, ajustável). Ao atingir 80%, avisar o `owner`. Ao atingir 100%, o chat bloqueia novas mensagens até o mês virar ou o limite ser aumentado.
- Limitar o histórico enviado à API (ex.: últimas 20 mensagens ou um teto de tokens) e usar cache de prompt para as instruções de sistema, para reduzir custo.
- **Interruptor geral** (liga/desliga) e liberação por usuário, ambos feitos pelo `owner`.
- Painel de uso para o `owner`: custo do dia, do mês e projeção do mês, por usuário e por modelo; nº de conversas e mensagens; custo médio por mensagem.

**Segurança e LGPD:**

- A chave da API nunca vai para o navegador.
- Conversas ficam guardadas por 6 meses (configurável).
- Uma frase na tela orienta a não colar CPF ou dados pessoais de promotores sem necessidade.
- O acesso fica no `audit()`.

**Fora da V1 do Assistente:** ferramentas com acesso aos dados do MCX, ações automáticas, qualquer uso por agência cliente ou promotor.

### 4.10 Conector MCX para o Claude (perfis `owner` e `gestor`, sem custo de API)

**Objetivo:** Eduardo e Maria usarem a **própria assinatura do Claude** (claude.ai, app ou Claude in Chrome) para consultar e operar o MCX conversando, sem sair do Claude e sem custo de API. A direção é esta: **o MCX vira um conector do Claude**; o Claude não roda dentro do MCX.

**Implementação:**

- Um servidor MCP remoto exposto pelo próprio app (ex.: `/api/mcp`), adicionado como "conector personalizado" na conta do Claude.
- **Autenticação:** siga a que os conectores personalizados do Claude exigem hoje (OAuth, conforme a documentação atual da Anthropic — verifique antes de implementar). Ela é vinculada a um usuário do Operações com papel `owner` ou `gestor`. Nenhum outro perfil tem acesso.

**Ferramentas, todas passando pelas mesmas funções de servidor e permissões das telas:**

- **Leitura:**
  - listar e filtrar demandas (por responsável, contratante, status, atrasadas);
  - fila de uma pessoa;
  - horas por contratante e por tipo no período;
  - follow-ups de hoje;
  - pipeline do CRM;
  - contratos vencendo.
- **Escrita:**
  - criar demanda;
  - mudar status, responsável ou prazo;
  - comentar;
  - criar lead;
  - mover lead de etapa;
  - registrar interação.

**Fluxo principal a garantir:** Eduardo escreve no Claude algo como "coloca para a Tainara ajustar a rota de Sete Lagoas da Etros até sexta, prioridade alta". Para isso funcionar:

- Precisa haver ferramentas de apoio para listar pessoas, contratantes, marcas, categorias e tipos, para que o Claude resolva os nomes em IDs.
- A ferramenta de criar demanda devolve o link e um resumo do que foi gravado (responsável, contratante, prazo, categoria), para conferência na própria conversa.
- Pedidos com várias demandas de uma vez ("cria estas 4 tarefas…") são aceitos em lote.

**Regras:**

- Toda escrita grava `audit()` com origem "conector Claude".
- Sem ferramentas de exclusão.
- Sem acesso a documentos restritos, valores de contrato nem horas individuais pelo conector na primeira versão.
- Resultados de listas são paginados e enxutos.
- **No menu do MCX**, um atalho "Usar com o Claude" explica, para `owner` e `gestor`, como conectar e como abrir o Claude in Chrome no painel lateral com a aba do MCX.

### 4.11 Manual vivo — "O que posso pedir?"

**Objetivo:** ao abrir o chat (Assistente MCX ou conector no Claude), a pessoa vê o que dá para pedir — a quem atribuir, o que perguntar e o que o sistema ainda não faz. A lista **se atualiza sozinha** conforme novas funcionalidades são criadas e conforme a equipe usa o sistema.

**1. Fonte única: registro de capacidades no código**

Crie `operacoes/src/server/capabilities.ts`, um registro tipado. Cada capacidade tem:

- id;
- grupo (Atribuir demanda, Consultar, Comercial, Relatórios, Documentos, Configurar);
- título;
- descrição em uma linha;
- **3 exemplos de frase em português real** (ex.: "Coloca para a Tainara digitar o pedido da Fini do Sup. Castro até amanhã");
- perfis que podem usar;
- onde está disponível (tela, Assistente, conector);
- fase em que entrou;
- data de inclusão.

Toda tool do conector, toda ação do Assistente e toda tela nova **é gerada a partir desse registro ou registrada nele**. O manual, as descrições das tools MCP e as sugestões do chat são lidos dele; nada é escrito à mão em dois lugares.

**Teste obrigatório:** falha se existir tool, action exposta ao chat ou rota do menu de Operações sem entrada no registro, ou entrada sem exemplos. É isso que obriga o manual a crescer junto com o sistema, inclusive quando outra IA desenvolver as próximas fases.

**2. Sugestões alimentadas pelos dados**

- **"O que posso pedir para a {pessoa}":** sai das competências da pessoa (categorias e tipos que ela atende, configurados pelo `gestor`) e dos 10 tipos de demanda que ela mais executou nos últimos 60 dias, com os contratantes mais frequentes. Exemplo gerado: "Ajustar rota — Etros", "Digitar pedido — Lucas/Fini".
- **"Perguntas úteis agora":** montadas pelo estado atual, por exemplo "Você tem 4 demandas atrasadas — quer ver?", "3 follow-ups vencem hoje", "Contrato da AF vence em 25 dias".
- **"Novidades":** capacidades incluídas nos últimos 30 dias, a partir da data de inclusão no registro.

**3. Onde aparece**

- **Assistente MCX (tela):** painel lateral ou tela inicial vazia com os grupos: Pedir à Tainara · Pedir à Maria · Pedir ao Eduardo · Perguntar ao sistema · Prompts MCX · Novidades. Cada item é um botão que **preenche a caixa de mensagem** com o exemplo, para a pessoa só ajustar e enviar. Filtrado pelo perfil de quem está logado.
- **Conector no Claude:**
  - uma tool `mcx_o_que_posso_pedir` (opcionalmente filtrada por pessoa ou grupo) que devolve o manual em texto curto, com exemplos;
  - a descrição do servidor MCP orienta o Claude a chamá-la quando o usuário perguntar "o que dá para fazer?" ou estiver começando;
  - se o cliente do Claude suportar *prompts* MCP, exponha também os exemplos principais como prompts prontos.
- **Página "Manual"** no menu de Operações: a mesma lista navegável, com busca.

**4. Também mostrar os limites**

Cada grupo tem um "Ainda não dá para…" (ex.: "excluir demandas pelo chat", "ver valores de contrato pelo conector"), lido do registro, para ninguém perder tempo pedindo o que não existe.

### 4.12 Checklists — biblioteca de modelos

**Problema real (20/11/2026):** o Helvécio pediu que a Maria separasse o material de degustação para levar a outra cidade. Ela separou tudo, mas faltaram as colheres. Um checklist padrão teria evitado o erro. O objetivo é que tarefas que se repetem tenham uma lista pronta, editável e com histórico.

**Biblioteca de modelos** (menu "Checklists"):

- Cada modelo tem:
  - nome;
  - contratante (ou "Geral MCX");
  - categoria e tipo de demanda;
  - seções opcionais (ex.: Produtos, Descartáveis, Equipamentos, Documentos);
  - itens.
- Cada **item** tem:
  - descrição;
  - quantidade padrão e unidade;
  - **quantidade por ação** (opcional: ao aplicar o modelo, informa-se o nº de ações ou degustações e o sistema multiplica, ex.: 50 colheres/ação × 3 ações = 150);
  - obrigatório (sim/não);
  - observação;
  - vínculo opcional com um item do estoque do contratante (seção 4.13).
- `owner` e `gestor` criam, editam, duplicam e arquivam modelos. Cada edição gera uma nova versão; as demandas antigas mantêm a versão que usaram.
- **Modelos iniciais:** crie como **rascunho** "Kit de degustação — saída para outra cidade (Helvécio)", "Fechamento mensal", "Implantação de cliente novo" e "Cadastro de promotor novo", com itens sugeridos marcados "a validar". A Maria revisa e publica. **Não publique itens inventados como definitivos.**

**Uso na demanda:**

- **Aplicar modelo:** cria uma cópia dos itens dentro da demanda, com as quantidades já calculadas. Itens podem ser acrescentados ou removidos só naquela demanda, sem mexer no modelo.
- **Salvar como modelo:** transforma o checklist de uma demanda num modelo novo.
- **Marcar item:** registra quem marcou e quando. Também é possível marcar "Não se aplica", com motivo.
- **Item obrigatório sem marcar bloqueia a conclusão da demanda.** Assim a conferência acontece antes de a demanda ser fechada.
- **Conferência dupla (opcional por modelo):** colunas "Separado" e "Conferido", para kits que saem da MCX. Se possível, "Conferido" deve ser feito por outra pessoa, ou pela mesma pessoa num segundo momento.
- **Foto da conferência (opcional por modelo):** anexar a foto do kit pronto antes de concluir.
- **Rotinas** (seção 4.3) podem ter um modelo vinculado; a demanda gerada já nasce com o checklist.

**Aprendizado com erros (o que resolve o caso das colheres):**

- Na demanda concluída, o botão **"Faltou algo"** registra o item esquecido, a quantidade e o impacto.
- O sistema pergunta: **"Adicionar este item ao modelo?"** Com um clique, o item entra na próxima versão.
- O relatório "Itens que mais faltaram", por modelo e por contratante, mostra onde a lista precisa melhorar.

**Histórico:**

- Na tela do modelo: todas as vezes que foi usado (data, demanda, responsável, quantidades) e as ocorrências de "faltou".
- Na tela do contratante: os últimos kits enviados.

**Referência no Campo (só leitura):** o Campo já tem um checklist simples de materiais por degustação (`tasting_materials`: item, checked, checked_by, checked_at). Use como referência de modelo; não altere nem integre na V1.

### 4.13 Estoque de materiais por cliente

**Problema real:** a MCX guarda materiais dos clientes (ex.: o Helvécio tem um estoque grande de café e de vários itens de degustação). Hoje não se sabe com precisão quanto há, o que entrou, o que saiu, para onde foi e o que está vencendo.

**Cadastro de itens (por contratante e, opcionalmente, por marca):**

- nome;
- categoria: Produto (ex.: café), Descartável (copos, colheres, guardanapos), Material de PDV, Equipamento;
- unidade (un, pct, cx, kg, L);
- estoque mínimo;
- local de guarda (ex.: "Escritório — prateleira 2");
- controle de validade (sim/não);
- foto (opcional);
- observação.

**Movimentações — o saldo é sempre calculado a partir delas, nunca editado à mão:**

| Tipo | Campos |
|---|---|
| Entrada | Quantidade, origem (ex.: recebido do cliente), referência (NF/romaneio), lote e validade se houver, data, quem registrou |
| Saída | Quantidade, destino (ação/degustação, cidade, loja, promotor), vínculo com a demanda e o checklist, data, quem |
| Devolução | Retorno de sobra de uma saída anterior |
| Ajuste de inventário | Diferença encontrada na contagem, com motivo |
| Perda/Vencido | Quantidade e motivo |

**Lotes e validade:** para itens com validade (café, por exemplo), as entradas registram lote e data de validade. Saídas sugerem consumir primeiro o lote que vence antes (FEFO). Lotes que vencem em até 30 dias geram alerta.

**Equipamentos** (garrafa térmica, mesa, display, toalha): controle por unidade, com status Disponível / Em uso (com quem e até quando) / Manutenção. Equipamentos que passarem da data de devolução geram demanda de cobrança.

**Integração com checklists:**

- Item de checklist vinculado ao estoque mostra o saldo disponível na hora de separar.
- Avisa quando a quantidade pedida passa do saldo.
- Ao concluir a demanda, o sistema propõe registrar as saídas de uma vez (com confirmação, nunca automático).

**Alertas (viram demanda para o `gestor`):**

- abaixo do mínimo → "Pedir reposição ao cliente";
- validade próxima;
- equipamento não devolvido.

**Inventário periódico:** uma rotina mensal (configurável) gera uma demanda de contagem com checklist dos itens do contratante. A diferença entre o contado e o saldo vira um ajuste com motivo.

**Telas:**

- **Estoque do contratante:** saldo por item, alertas e últimas movimentações.
- **Extrato do item:** todas as movimentações, com saldo acumulado.
- **Relatório mensal por contratante:** saldo inicial, entradas, saídas por ação/cidade, perdas, saldo final. Exportável/imprimível, porque pode ser enviado ao cliente como prestação de contas — e isso é valor percebido para a MCX.

**Permissões:**

- `operacional` registra entradas e saídas e faz contagem.
- `gestor` e `owner` fazem ajustes e perdas, editam itens e mínimos.
- Tudo grava `audit()`.

**No manual e no conector:** exemplos como "Quanto café do Helvécio temos?", "Registra saída de 150 colheres e 4 pacotes de café para a degustação de Itaúna", "O que está abaixo do mínimo?".

**Fora da V1 do estoque:** custo e valoração do estoque, leitura por código de barras, integração com as degustações do Campo, visualização pelo cliente.

---

## 5. Fora da V1 (não construir agora — apenas não bloquear no modelo)

- Envio automático de mensagens (WhatsApp Cloud API) e réguas automáticas — só a estrutura da seção 4.8.
- Financeiro interno e DRE da MCX (hoje está em planilha; avaliar depois).
- Projetos.
- Subtarefas como demandas filhas.
- Calendário.
- Exportação PDF/Excel.
- Status e campos personalizáveis.
- Notificações por WhatsApp, push ou e-mail (na V1, apenas um contador in-app de "minha fila").
- Demandas geradas a partir de eventos do Campo (loja sem visita, ruptura, NF pendente).
- API para o MCX Tracker.
- Sugestões com IA.
- Compartilhamento de documentos com clientes.

---

## 6. Segurança e LGPD

- Toda leitura e escrita exige login do Operações e o papel adequado, verificados no servidor.
- **Testes automatizados obrigatórios** (em `tests/`, com PGlite):
  1. uma requisição sem sessão do Operações (ou com cookie de sessão do Campo) recebe erro em todas as rotas, actions e downloads;
  2. o `operacional` não lê contrato, documento restrito nem horas de outra pessoa;
  3. o download de documento sem permissão falha mesmo com o ID correto;
  4. a rotina não duplica ao rodar o cron duas vezes.
- Documento de promotor (CPF, endereço) é sempre restrito e tem acesso logado. Não exporte esses dados em listagens.
- Exclusão lógica para demandas, documentos e contratos. A auditoria não pode ser editada pela interface.
- Nenhum segredo no código. Liste as variáveis de ambiente novas.

---

## 7. Infraestrutura (pré-requisito antes de guardar contratos reais)

Na Fase 0, verifique e reporte:

1. **Plano atual do Render e do Supabase**, e os riscos: o Render gratuito "dorme" e tem cold start; confirmar se o plano gratuito do Supabase tem backup.
2. **Proposta de backup independente:** `pg_dump` diário via GitHub Actions para o R2, com retenção e procedimento de restauração testado em ambiente local.
3. **Plano de deploy separado, sem custo:** um serviço novo no Render (plano gratuito) apontando só para `operacoes/` (root directory e build filter), um projeto Supabase separado (plano gratuito), um bucket R2 separado e um usuário somente leitura no banco do Campo. Inclua o passo a passo do que **eu** faço no painel de cada serviço e confirme que nenhum desses passos reinicia ou altera o `mcx-campo`.
4. **Janela de risco:** se em algum momento algo precisar tocar o Campo, proponha fazer fora do horário de campo (depois das 21h ou no domingo), com plano de rollback (redeploy da versão anterior no Render).

Não altere a produção para resolver isso. Apenas documente e proponha.

---

## 8. Fases e critério de aceite

| Fase | Entrega | Aceite |
|---|---|---|
| **0 — Diagnóstico** | Confirmação dos fatos da seção 2; como o deploy do Campo é disparado; desenho das tabelas do Operações; rotas; permissões; riscos; plano de testes; plano de deploy separado (seção 7) | Eu aprovo o desenho; **zero arquivos alterados em `agencia/`** |
| **1 — Fundação + Demandas** | Papéis internos, contratantes (cadastro básico), demandas, minha fila, lista, kanban, captura rápida, histórico, testes de isolamento | A Maria consegue trabalhar um dia inteiro só pelo sistema; testes de isolamento passando; regressão verde |
| **2 — Tempo + Equipe + Rotinas + Checklists** | Tempo na conclusão, tipo de demanda, cronômetro, tempo no sistema, "Meu dia", painel da equipe, relatórios de horas/capacidade/Horas × Receita, recorrências idempotentes, painel inicial, biblioteca de modelos de checklist com "Faltou algo" (seção 4.12) | 100% das demandas concluídas com tempo; horas por contratante e por tipo visíveis; fechamentos do mês seguinte gerados sozinhos; kit de degustação do Helvécio em uso como modelo |
| **3 — Comercial (CRM)** | Leads, funil, follow-up obrigatório, "Comercial hoje", modelos com link do WhatsApp, painel comercial, importação CSV, conversão Ganho → contratante | Eduardo trabalha a prospecção do dia só pelo sistema; nenhum lead aberto sem próxima ação |
| **4 — Estoque de clientes** | Itens, movimentações, lotes/validade, equipamentos, alertas, inventário, relatório mensal, integração com checklist (seção 4.13) | Estoque do Helvécio cadastrado e saldo batendo com a contagem física |
| **5 — Contratos + Documentos** | Contratos, aditivos, alertas, repositório com versões, restrição e log | Contratos atuais anexados e alertas funcionando |
| **6 — Migração Notion** | Script com dry-run + importação | Demandas abertas no sistema; Notion congelado para novas tarefas |
| **7 — Assistente MCX (piloto)** | Chat via API, limites de custo, painel de uso, "Prompts MCX", interruptor | Tainara usa por 1 mês; custo real visível por dia e por mês; bloqueio no limite testado |
| **8 — Conector MCX para o Claude** | Servidor MCP com OAuth, ferramentas de leitura e escrita, auditoria | Eduardo cria e consulta demandas e leads pelo Claude; perfis não autorizados são recusados; "o que posso pedir?" responde com o manual atualizado |

**Registro de capacidades (seção 4.11):** começa na Fase 1 e é obrigatório em todas as fases seguintes. Cada fase entregue precisa aparecer no Manual com exemplos.

A Fase 7 pode ser antecipada (logo depois da Fase 1) se eu pedir: ela é independente das demais.

Ao fim de cada fase, entregue:

- o que mudou (arquivos principais);
- as migrations;
- as variáveis de ambiente;
- os comandos de teste executados e o resultado;
- as pendências de decisão.

Meta: Fases 1 e 2 utilizáveis em cerca de 2 semanas, e a Fase 3 em mais 1 semana. Se o diagnóstico mostrar que isso não cabe, diga o que cortar — não reduza qualidade nem segurança.

---

## 9. Lacunas — pergunte antes de assumir

1. "Adriana" no Notion = AF Merchandising?
2. "William Danper" é contratante ou contato do Helvécio?
3. Lista real das atividades diárias da Tainara (para o seed de rotinas).
4. Onde estão hoje os contratos e documentos (Drive? WhatsApp?) e se haverá importação em lote.
5. Custo/hora de cada pessoa para o relatório de margem (pode começar vazio e ser preenchido pelo `owner`).
6. Rota preferida e nome do menu ("Operações").
7. Lista inicial de tipos (subcategorias) por categoria — proponha uma a partir dos exemplos da seção 1 e eu valido.
8. Os modelos de mensagem iniciais por etapa do funil (eu envio os textos).
9. Lista real dos itens do kit de degustação do Helvécio e dos itens que a MCX guarda em estoque para ele (a Maria fornece; serve para validar os modelos e o cadastro inicial).
10. A chave da API para o piloto do Assistente (eu crio na Claude Console e coloco no ambiente; você só lê a variável).
