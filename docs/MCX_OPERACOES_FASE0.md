# MCX Operações — Fase 0 (diagnóstico) — 20/11/2026

Nenhum arquivo de agencia/ foi alterado. Nada foi publicado. Branch: feat/mcx-operacoes (só local).

## 1. Fatos da seção 2

Confirmados no código (main em 2879fb2): Next.js 16.3.8 + TypeScript, Drizzle + Postgres (Supabase), PGlite em dev, PWA do promotor, testes com tsx --test (34 arquivos, 167 testes), @anthropic-ai/sdk nas dependências; agencies.kind client/platform; users.platform e platformRole owner/master; platform-team.ts (só o owner cadastra); /painel/mcx com agências, armazenamento, equipe, escopos e melhorias; Scope em auth.ts e scope.ts; storage.ts com R2 privado, fallback Supabase e disco local; /api/photos/:id autenticada; cron por GitHub Actions em /api/cron/schedules e /api/cron/storage; audit_logs e audit(); whatsapp-alert.ts; fixed_expenses, work-time.ts, pendencias e tasting_materials existem e são do Campo.

Correções:

1. "Não há RLS" está incompleto. O RLS está LIGADO em todas as tabelas do Campo, sem nenhuma política (defesa contra a API pública do Supabase). Consequência: um usuário somente leitura comum enxerga zero linhas. Ele precisa de política de SELECT própria nas tabelas liberadas (ver seção 4).
2. As rotas /api/cron do Campo não exigem segredo. No Operações o cron terá CRON_SECRET.
3. O workflow manter-ativo.yml ainda chama o suinco-gestao (suspenso) a cada 10 min. Não afeta o Campo; fica como está.
4. improvements.ts usa o modelo claude-opus-5-5. O Assistente usará Haiku 5.5 por configuração própria.
5. O cookie de sessão do Campo é campo_session. O do Operações será ops_session, em outro domínio.

## 2. O que publica o Campo no Render (lido hoje no painel)

- Repositório mcxoperacoescomerciais-debug/mcx, branch main, Auto-Deploy "On Commit".
- Root Directory: agencia. Pela regra do Render, commit que só mexe fora de agencia/ NÃO dispara publicação. Build Filters vazios. PR Previews desligado.
- Build: npm install && npm run build. Pre-Deploy: vazio.
- Start: npm run start:render = db:migrate + db:bootstrap + db:setup-data + next start. Roda a cada início (publicação, reinício manual, troca de variável de ambiente).
- Também publicam ou reiniciam: Manual Deploy, Deploy Hook, salvar variável de ambiente, Restart.

Conclusão: push em feat/mcx-operacoes não publica nada. Mesmo um merge futuro em main só com operacoes/ e docs/ não dispararia o Campo — mas sigo sem tocar em main.

## 3. Fase 1 — tabelas, rotas e permissões

Banco próprio, separado do Campo:

| Tabela | Conteúdo |
|---|---|
| users | nome, usuário, senha (hash), papel owner/gestor/operacional, ativo |
| clients | contratante: nome, tipo, documento, status, observações, campo_agency_id + nome copiado; registro fixo "Interno MCX" |
| client_contacts | nome, função, WhatsApp, e-mail |
| client_brands | marca do contratante: nome livre, campo_brand_id opcional |
| categories | as 9 categorias, editáveis, ordem, ativa |
| demand_types | tipo por categoria (usado de verdade na Fase 2; a coluna já nasce) |
| demands | título, contratante, categoria, tipo, responsável (vazio = "A distribuir"), status, prioridade, prazo, descrição, marca, loja/promotor (texto + ids do Campo), origem, aguardando de quem, data de cobrança, tempo estimado, concluída em/por, deleted_at |
| demand_shares | demanda × usuário (o que o operacional enxerga além das próprias) |
| demand_checklist_items | item, marcado, por quem, quando |
| demand_comments | autor, texto, data |
| demand_history | campo, de, para, quem, quando |
| audit_logs | mesma forma do Campo; sem edição pela interface |
| settings | fuso, parâmetros |

Rotas: /entrar · / (Minha fila) · /demandas (lista da equipe) · /demandas/[id] · /kanban · /contratantes e /contratantes/[id] · /config/usuarios (owner) · /config/categorias (gestor, owner) · /manual · /api/health. Botão fixo "+ Demanda" em todas as telas. Tudo por server actions; a permissão é conferida em cada função de servidor.

Permissões: owner — tudo. gestor — todas as demandas, distribuir, reabrir, categorias, contratantes. operacional — só demandas próprias ou compartilhadas, cria demanda, comenta, marca checklist; não reabre, não vê configurações. Os papéis ficam num mapa papel → ações em código, para entrar papel novo sem refatorar. capabilities.ts começa aqui, com o teste que falha se faltar registro.

Fora da Fase 1: anexos, tempo, rotinas, modelos de checklist, leitura do Campo. A Fase 1 não precisa do usuário somente leitura: marca, loja e promotor entram como texto. Proponho criar esse usuário só quando uma fase pedir.

## 4. Publicação separada — o que você faz

Nenhum passo abaixo abre o serviço mcx-campo nem o projeto Supabase do Campo, exceto o passo D, que é adiado.

A. Supabase: New project "mcx-operacoes", região East US (Ohio), plano Free. Guardar a senha no gerenciador. Copiar a URL "Session pooler" (porta 5432). O plano Free permite 2 projetos ativos por organização — se já houver 2, me avise antes.
B. Cloudflare R2 (só na Fase 5): bucket "mcx-operacoes-docs", privado; token novo restrito a esse bucket. Não reutilizar o token do Campo.
C. Render: New › Web Service › mesmo repositório › Branch feat/mcx-operacoes › Root Directory operacoes › Build "npm install && npm run build" › Start "npm run start:render" › plano Free › variáveis: DATABASE_URL (do passo A), SESSION_SECRET (novo), OPS_ENABLED=true, CRON_SECRET, APP_URL. Criar um serviço novo não reinicia os outros. Não usar Environment Group compartilhado com o Campo.
D. Usuário somente leitura no Campo (adiado): eu escrevo o SQL (papel com LOGIN, default_transaction_read_only, statement_timeout de 3 s, SELECT só nas colunas necessárias de agencies, brands, stores e users — sem password_hash — e uma política de SELECT para esse papel). É DDL aditivo, não reinicia o Campo; rodar depois das 21h. Rollback: DROP POLICY e DROP ROLE.

## 5. Riscos

| Risco | Tratamento |
|---|---|
| Commit tocar agencia/ | Guarda automática (seção 6) + pasta de trabalho separada (Desktop/mcx-operacoes) |
| DATABASE_URL do Campo colada no serviço novo (migration na produção do Campo) | O migrate do Operações recusa rodar se encontrar a tabela "visits" no banco de destino |
| Render Free dorme (15 min; volta em ~1 min) | Aceitável para 3 usuários; Starter US$ 7/mês se incomodar |
| Supabase Free: sem backup automático; pausa após 7 dias sem uso | Backup diário pg_dump via GitHub Actions para o R2 (30 dias), restauração testada em local, antes da Fase 5 |
| Plano do Campo | Starter desde 14/10 pelas minhas anotações; não consegui reler o plano hoje no painel |
| Prazo | Fases 1 e 2 em ~2 semanas cabem. Se apertar, corto primeiro: arrastar no kanban (fica troca por toque) e conferência dupla do checklist |

## 6. Plano de testes

- Guarda do Campo: operacoes/tests/guarda-campo.test.ts roda "git diff --name-only origin/main...HEAD -- agencia/" e falha se vier qualquer arquivo. O mesmo comando roda num workflow do GitHub em todo push da branch.
- Isolamento (PGlite): sem sessão, ou com cookie campo_session, toda rota e action recusa; operacional não lê demanda alheia mesmo com o ID; só gestor/owner reabre.
- Regras: "Sem prazo" só com prioridade Baixa; "Aguardando retorno" exige de quem e data; histórico em toda mudança; anti-duplicata avisa sem bloquear; fila na ordem atrasadas › hoje › cobrar hoje › próximas; datas em America/Sao_Paulo.
- Capacidades: falha se houver rota de menu ou action sem registro ou sem 3 exemplos.
- A cada entrega: typecheck, lint, test e build em operacoes/, e typecheck, test e build em agencia/ sem alterar nada.

## 7. O que preciso de você

Para começar a Fase 1:
- (1) "Adriana" do Notion é a AF Merchandising?
- (2) "William Danper" é contratante próprio ou contato do Helvécio?
- (6) Nome e endereço: "MCX Operações" em mcx-operacoes.onrender.com serve?
- (7) Tipos por categoria: mando a proposta junto com a Fase 1 para você validar?
- Usuários de acesso de Eduardo, Maria e Tainara (as senhas vocês definem no primeiro acesso).
- Posso enviar a branch feat/mcx-operacoes ao GitHub? Não publica nada; o serviço novo do Render vai precisar dela.

Podem esperar: 3 e 9 (Fase 2), 5 (Fase 2, pode ficar vazio), 8 (Fase 3), 4 (Fase 5), 10 (Fase 7).
