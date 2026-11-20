# MCX Operações — Fase 2 (Tempo + Equipe + Rotinas + Checklists) — 20/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

**Tempo (sem bater ponto)**
- Concluir uma demanda exige "Quanto tempo levou?" (5, 15, 30, 45 min, 1h, 2h, Outro), no detalhe e no kanban. O valor é o tempo total de quem conclui; o que já foi apontado é descontado, para não contar duas vezes.
- Cronômetro opcional (um por pessoa; iniciar outro para o anterior e avisa; teto de 8 h se ficar esquecido).
- Lançamento manual (data, minutos, observação). Correções ficam na auditoria com o valor anterior.
- Tipo (subcategoria) por categoria, editável em "Categorias e tipos". A lista proposta já vem cadastrada.
- "Tempo no sistema": sinal a cada 60 s só com a aba visível e interação nos últimos 5 min. Guarda apenas minutos e horário do primeiro e do último sinal. Retenção de 12 meses.

**Telas**
- Meu dia: tempo apontado, tempo no sistema, concluídas, criadas e movidas, com a frase do que é medido. O gestor vê exatamente a mesma tela da pessoa.
- Equipe (dono e gestor): por pessoa, tempo apontado, tempo no sistema, concluídas, carga aberta e horas estimadas; redistribuir a demanda ali mesmo.
- Relatórios do mês: ranking de horas por contratante; horas, quantidade, média e mediana por categoria e tipo; capacidade por semana com aviso de contratação (acima de 80% por 4 semanas seguidas); Horas × Receita (custo/hora por pessoa e valor mensal por contratante, visíveis só para dono e gestor); itens que mais faltaram.
- Painel: abertas por responsável, atrasadas, cobranças vencidas, sem responsável, concluídas no mês, rotinas geradas hoje e horas × contrato.

**Rotinas**
- Cadastro: nome, contratante, categoria, tipo, responsável, prioridade, frequência (semanal em dias escolhidos, mensal em dia X, a cada N dias), antecedência, prazo relativo, modelo de checklist, ativa/pausada.
- Geração idempotente: chave única (rotina, data da ocorrência). Roda pelo cron (/api/cron/rotinas, com segredo) e, por garantia, na primeira abertura do dia. Recupera até 7 dias se o cron falhar.

**Checklists**
- Biblioteca de modelos com seções, quantidade, unidade, quantidade por ação, obrigatório, observação e versões (editar cria versão nova; a demanda antiga guarda a dela).
- Na demanda: aplicar modelo com nº de ações (50 colheres × 3 ações = 150), "Não se aplica" com motivo, conferência dupla (Separado / Conferido), salvar o checklist como modelo.
- Item obrigatório sem marcar bloqueia a conclusão.
- "Faltou algo" na demanda concluída → o gestor coloca o item na próxima versão do modelo com um clique. Histórico de uso e de faltas na tela do modelo.
- 4 modelos iniciais em RASCUNHO, com todos os itens "a validar" (não publicam enquanto houver item a validar): Kit de degustação — saída para outra cidade (Helvécio), Fechamento mensal, Implantação de cliente novo, Cadastro de promotor novo.

## Cortes e pendências desta fase

- Foto da conferência do kit: fica para a Fase 5 (depende do módulo de arquivos).
- Rotinas reais: nenhuma foi cadastrada — faltam as atividades diárias da Tainara e as datas dos fechamentos. A Maria cria em "Rotinas" em 1 minuto cada.
- Kit do Helvécio: os itens são sugestões "a validar"; a Maria confirma, ajusta quantidades e publica.
- Custo/hora e valor mensal dos contratos: começam vazios (o relatório avisa).
- Agendamento do GitHub: só dispara com o arquivo na branch main. Enquanto isso a geração acontece na primeira abertura do dia.
- Contratos e documentos vencendo no painel: Fase 5.

## Migrations (só no banco do Operações, aditivas)

- 0002_fase2.sql — 8 tabelas novas e colunas novas em users, clients, demands e demand_checklist_items.
- 0003_fase2_rls.sql — RLS nas tabelas novas.

## Variáveis de ambiente novas

- CRON_SECRET (opcional; sem ele a rota do cron fica fechada).

## Testes

Operações: typecheck, lint, 42 testes e build — tudo verde. Novos: tempo obrigatório na conclusão e sem dupla contagem; cronômetro único; operacional não vê horas de outra pessoa; sinal de atividade e retenção; recorrência (mês curto); cron sem duplicar (inclusive em paralelo); modelos em rascunho não publicam com item a validar; multiplicação por ação; versões; obrigatório bloqueia; "Faltou algo" → modelo; cálculos dos relatórios; rotas de API protegidas.

Campo (sem alterar nada): resultado no fim deste arquivo.

## Decisões pendentes

1. Validar os tipos por categoria (já cadastrados; editáveis).
2. A Maria revisar e publicar os 4 modelos de checklist.
3. Informar custo/hora e valor mensal dos contratos, se quiser o relatório de margem.
4. Aprovar a Fase 3 (Comercial/CRM) — vou precisar dos modelos de mensagem por etapa (lacuna 8); posso começar com textos em rascunho "a validar".

## Regressão do Campo (20/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: build ok, typecheck ok, 167 de 167 testes. git status de agencia/: nenhum arquivo alterado.
