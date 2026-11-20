# MCX Operações — Fase 1 (Fundação + Demandas) — 20/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado. Nada publicado.

## Respostas registradas

- "Adriana" do Notion = AF Merchandising (contato da AF).
- "William Danper" = contato do Helvécio (cadastrado como contato, função "Danper").
- Nome e endereço: MCX Operações, mcx-operacoes.onrender.com.
- Equipe inicial: eduardo (Dono), maria (Gestor), tainara (Operacional). Senha inicial combinada; a troca é obrigatória no primeiro acesso (mínimo 8 caracteres).

## O que foi entregue

- App separado em operacoes/ (Next.js 16, Drizzle, PGlite em dev), com login, cookie (ops_session) e segredo próprios.
- Papéis internos num mapa papel → ações (src/lib/permissions.ts).
- Contratantes com contatos e marcas (já vêm cadastrados: Etros, AF, Helvécio, Lucas, Regis e "Interno MCX").
- Demandas: captura rápida "+ Demanda" (título, contratante, responsável, prazo; categoria sugerida pelo histórico), Minha fila (atrasadas › hoje › cobrar hoje › próximas › aguardando), Lista da equipe com filtros, Kanban (arrastar no computador, seletor no celular), detalhe com edição, checklist, comentários, compartilhamento e histórico.
- Regras: "Sem prazo" só com prioridade Baixa; "Aguardando retorno" exige de quem e data de cobrança; histórico em toda mudança de status, responsável, prazo e prioridade; concluir grava data e autor; reabrir só gestor/dono; anti-duplicata avisa sem bloquear; exclusão lógica com motivo; auditoria.
- Manual "O que posso pedir?" lido do registro de capacidades (src/server/capabilities.ts).
- Interruptor OPS_ENABLED=false.

Fora desta fase (como combinado): anexos, tempo, rotinas, modelos de checklist, leitura do Campo.

## Migrations (só no banco do Operações)

- 0000_inicial.sql — 13 tabelas.
- 0001_rls.sql — RLS ligado sem políticas (mesma defesa do Campo contra a API pública do Supabase).

scripts/migrate.ts recusa rodar se o banco de destino tiver tabelas do Campo.

## Variáveis de ambiente

DATABASE_URL (banco próprio), SESSION_SECRET (novo), OPS_ENABLED, OPS_INITIAL_PASSWORD (opcional).

## Testes

Operações: typecheck, lint, 24 testes e build — tudo verde.
- guarda-campo: falha se a branch alterar agencia/ (commits ou alterações locais), se o Operações importar código do Campo, ou se a migration aceitar o banco do Campo. O mesmo check roda no GitHub (.github/workflows/operacoes.yml) a cada push da branch.
- isolamento: sem cookie, cookie inválido, cookie no formato do Campo ou sessão revogada não entram; toda server action confere a sessão; toda página exige usuário; operacional não lê nem altera demanda alheia mesmo com o ID; só gestor compartilha, reatribui, reabre e exclui; só o dono mexe em usuários.
- regras: datas em America/Sao_Paulo, fila, prazo × prioridade, aguardando, histórico, anti-duplicata, checklist, exclusão lógica.
- capacidades: toda rota do menu e toda action registradas, com 3 exemplos.

Campo (sem alterar nada): ver resultado no fim deste arquivo.

## Proposta de tipos por categoria (para validar — entra em uso na Fase 2)

| Categoria | Tipos |
|---|---|
| Pedidos | Digitar pedido · Cadastrar cliente na indústria · Problema de NF/boleto |
| Roteiro e programação | Traçar ou ajustar rota · Programar visitas · Remanejar loja · Alterar dias de atendimento · Enviar lojas ao promotor · Lojas sem visita |
| Fechamento e financeiro | Fechamento mensal · Conferir planilha de fechamento · Cobrar NF de promotora · Dados de pagamento (PIX/CNPJ) |
| Relatórios para marcas | Relatório periódico da marca · Acompanhamento (MDias/Book) · Vídeo de ação · Preencher planilha do cliente |
| Degustação | Planejar/validar degustações do mês · Projeção · Cotação de insumos · Separar kit |
| Promotores e RH | Abrir vaga · Dados para cadastro · Enviar logins do app · Treinamento · Aviso à equipe |
| Implantação do app | Configurar sistemática · Cadastrar lojas de marca nova · Apresentação |
| Comercial MCX | Prospecção · Proposta · Contato com marca |
| Interno MCX | Conteúdo · Administração |

## Decisões pendentes

1. Validar a proposta de tipos acima.
2. Autorizar o envio da branch ao GitHub e criar o projeto Supabase e o serviço Render (passo a passo na seção 4 do diagnóstico da Fase 0).
3. Senha inicial em produção: o endereço é público; sugiro definir OPS_INITIAL_PASSWORD no Render com uma senha forte temporária, em vez da senha combinada.
4. Para a Fase 2: lista das atividades diárias da Tainara (rotinas), itens do kit de degustação do Helvécio e custo/hora (pode ficar vazio).

## Regressão do Campo (20/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: typecheck ok, 167 de 167 testes, build ok. git status de agencia/: nenhum arquivo alterado.
