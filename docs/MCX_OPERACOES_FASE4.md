# MCX Operações — Fase 4 (Estoque de materiais dos clientes) — 20/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

Menu novo **Estoque** (todos os perfis veem; ver "Permissões").

**Itens (por contratante e, opcionalmente, por marca)**
- Nome, categoria (Produto, Descartável, Material de PDV, Equipamento), unidade, estoque mínimo, local de guarda, controle de validade e observação.
- Nome repetido no mesmo contratante é recusado.

**Movimentações — o saldo é sempre a soma delas**
- Entrada (origem, NF/romaneio, lote e validade), Saída (destino, cidade, loja, promotor), Devolução, Perda/Vencido (com motivo) e Ajuste de inventário.
- Nenhuma movimentação é alterada ou apagada; erro se corrige com outra. Há teste que falha se o código passar a editar ou excluir movimentação.
- Saída e perda nunca passam do saldo (a tela avisa antes e o servidor recusa).
- Itens com validade: a entrada exige a data; a saída consome primeiro o lote que vence antes (FEFO) e se divide entre lotes sozinha; também dá para escolher o lote.

**Contagem**
- Informa-se o que foi contado, nunca o saldo. A diferença vira ajuste de inventário com motivo.
- A contagem do operacional fica pendente até o gestor aprovar; a aprovação leva o saldo ao número contado, mesmo que tenha havido movimentação no meio.

**Equipamentos**
- Controle por unidade (ex.: Garrafa térmica 1): Disponível, Em uso (com quem e até quando) e Manutenção.

**Integração com checklists**
- Cada item do checklist da demanda pode ser ligado a um item do estoque do contratante; o vínculo também pode vir do modelo de checklist.
- A demanda mostra o saldo na hora de separar e avisa quando o pedido passa do saldo.
- "Registrar as saídas do estoque": baixa tudo de uma vez, só com confirmação, com as quantidades que realmente saíram. Ou saem todas as linhas, ou nenhuma; cada item só gera saída uma vez por demanda.

**Alertas que viram demanda para o gestor (uma vez por dia, sem duplicar)**
- Abaixo do mínimo → "Pedir reposição ao cliente".
- Lote que vence em até 30 dias.
- Equipamento que passou da data de devolução → "Cobrar devolução".
- Enquanto a demanda do alerta estiver aberta, não abre outra.

**Inventário mensal**
- No dia configurado (padrão: dia 1; 0 desliga), abre uma demanda de contagem por contratante, com um item obrigatório de checklist para cada material.

**Telas**
- Estoque (visão por contratante, com alertas), estoque do contratante (saldo por item, alertas, movimentação, equipamentos, últimas movimentações), extrato do item com saldo acumulado e lotes.
- **Relatório mensal por contratante** — saldo inicial, entradas, saídas por ação e cidade, devoluções, perdas, ajustes e saldo final, pronto para imprimir ou salvar em PDF e enviar ao cliente.

**Permissões**
- Operacional: vê, registra entrada, saída, devolução, contagem e saída/devolução de equipamento.
- Gestor e dono: cadastro de itens e mínimos, perda/vencido, aprovação de ajuste, manutenção, dia do inventário e relatório mensal.
- Tudo grava auditoria.

## Cortes e pendências desta fase

- **Estoque real do Helvécio não foi cadastrado** (lacuna 9: a Maria fornece a lista e a contagem física). O critério de aceite da fase — "saldo batendo com a contagem física" — só fecha depois disso. Nada foi inventado: os 4 itens de exemplo existem só no banco de demonstração local.
- **Foto do item:** fica para a Fase 5 (módulo de arquivos).
- **Quantidades são números inteiros.** Para café, use pacote (pct) em vez de frações de kg.
- **Exportar o relatório em Excel:** hoje é impressão/PDF pelo navegador.
- Fora da V1, conforme a especificação: custo do estoque, código de barras, integração com as degustações do Campo e tela para o cliente.

## Migrations (só no banco do Operações, aditivas)

- 0006_fase4.sql — 5 tabelas novas (stock_items, stock_movements, stock_units, stock_counts, stock_alerts) e 2 colunas novas opcionais (stock_item_id em demand_checklist_items e checklist_template_items).
- 0007_fase4_rls.sql — RLS nas tabelas novas.

Sem variáveis de ambiente novas. O cron diário e a primeira abertura do dia passaram a gerar também os alertas do estoque.

## Testes

Operações: typecheck, lint, 83 testes (16 novos) e build — tudo verde. Novos: saldo, lotes, FEFO e fechamento do mês; permissões por perfil; validações de cada tipo de movimentação; saldo insuficiente; validade obrigatória; contagem do gestor e do operacional; equipamentos; vínculo com checklist, aviso de falta e saídas "tudo ou nada" sem repetir; vínculo vindo do modelo; operacional sem acesso ao estoque de demanda alheia; alertas idempotentes (inclusive em paralelo) e inventário mensal único.

Conferido no navegador local: visão geral com alertas, bloqueio de saída acima do saldo, saída registrada e refletida no saldo e nas últimas movimentações, relatório mensal fechando, alertas e inventário virando demandas, e o painel do estoque dentro da demanda (vincular, ver saldo, confirmar saída).

## Regressão do Campo (20/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: build ok, typecheck ok, 167 de 167 testes. git status de agencia/: nenhum arquivo alterado.

## Decisões pendentes

1. Maria: lista real dos itens que a MCX guarda para o Helvécio, com mínimos e a contagem física inicial.
2. Confirmar o dia do inventário mensal (padrão: dia 1) e o prazo do alerta de validade (30 dias).
3. Ligar os itens do modelo "Kit de degustação (Helvécio)" ao estoque, depois que os itens existirem.
