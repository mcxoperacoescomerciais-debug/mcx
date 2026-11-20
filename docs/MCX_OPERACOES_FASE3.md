# MCX Operações — Fase 3 (Comercial / CRM) — 20/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

Menu novo **Comercial** (dono e gestor; o operacional não vê nem acessa), com seis abas.

**Hoje**
- Quatro grupos: follow-ups vencidos, follow-ups de hoje, propostas que vencem em até 3 dias e a meta de novos contatos do dia (ex.: 1 de 5).
- Enquanto a meta não é batida, mostra os próximos leads de "A prospectar".
- Filtro por responsável (abre no próprio usuário).

**Lead**
- Empresa, tipo, cidade/região, origem (Indicação exige "indicado por"), de onde veio o dado (LGPD), produtos de interesse, porte, responsável, tags e vínculo opcional com contratante atual (expansão).
- Valor mensal potencial calculado pela tabela da especificação e editável: App por faixa de promotores (R$ 60 / 55 / 50), Degustação por faixa de ações (R$ 590 / 900 / 1.200) e Backoffice pelo piso de R$ 1.250. O que é "sob proposta" (Administrativo, Degustação acima de 80 ações) fica fora da soma e a tela avisa, em vez de inventar número.
- **Lead aberto não salva sem próxima ação e data** — na criação, na edição, ao mover de etapa e ao registrar interação.
- Aviso de duplicata por WhatsApp ou nome da empresa (avisa, não bloqueia).

**Funil**
- Kanban com as 9 etapas iniciais; arrastar no computador, seletor no cartão no celular. Cada mudança grava histórico com data e autor.
- Proposta enviada: pede valor e validade (padrão de 10 dias).
- Perdido: motivo obrigatório (Preço, Sem resposta, Já tem sistema, Sem dor agora, Escolheu concorrente, Outro — "Outro" pede descrição).
- Nutrição: data de retomada obrigatória (padrão de 30 dias); o lead volta para "Hoje" nessa data.
- Ganho: cria o contratante (ou usa o existente, na expansão), copia os contatos, grava o valor mensal e abre a demanda "Implantação — empresa". Lead ganho não volta no funil.

**Follow-up**
- Registro de interação (WhatsApp, ligação, e-mail, reunião, demonstração) com resumo e resultado; sempre pede a próxima ação.
- Cadência sugerida: D+3, depois D+7; depois disso a tela sugere Nutrição ou Perdido.
- O primeiro contato tira o lead de "A prospectar"; "Respondeu" leva para "Em conversa".
- **Mensagem pronta no WhatsApp:** modelo por etapa com {nome}, {empresa}, {cidade} e {produto}; o texto pode ser ajustado; o botão abre o WhatsApp de quem clicou (link wa.me) e registra a interação. O sistema não envia nada. Mensagem com variável sem preencher não abre.

**Painel comercial (mês e últimas 4 semanas)**
- Novos contatos por semana × meta, taxa de resposta, demonstrações, propostas, fechamentos, conversão entre etapas, ciclo médio, pipeline (total e ponderado pela chance da etapa), MRR ganho, motivos de perda e resultado por origem e por tipo.

**Importar**
- CSV (; ou ,) com empresa, contato, whatsapp, cidade, tipo e origem. Mostra a prévia, pula duplicatas (no banco e dentro do arquivo) e não duplica se o mesmo arquivo for importado de novo.

**Modelos e funil**
- 9 modelos de mensagem iniciais em **rascunho "a validar"**. Só o dono aprova; rascunho pode ser usado, com aviso.
- O dono renomeia etapas, ajusta a chance de fechar, cria etapa nova e define a meta diária.

**LGPD e automação futura**
- Opt-out por contato (bloqueia a mensagem pronta); excluir contato apaga o dado de verdade (a auditoria guarda só o fato); excluir lead exige motivo e apaga os contatos.
- Tabelas prontas para a API oficial do WhatsApp (modelos com status de aprovação e fila outbound_messages). Nada é enfileirado nem enviado nesta fase — há teste que garante.

## Cortes e pendências desta fase

- **Textos das mensagens:** os 9 modelos são sugestões minhas a partir do processo descrito na especificação. Eduardo troca pelos textos dele em Comercial › Modelos e funil e aprova.
- **Contrato em rascunho ao ganhar:** fica para a Fase 5 (módulo de contratos). Hoje o ganho cria contratante + demanda de implantação.
- **Checklist na demanda de implantação:** entra sozinho assim que a Maria publicar o modelo "Implantação de cliente novo" (hoje em rascunho).
- **Ordem das etapas:** renomear e criar funcionam; reordenar por arraste não foi feito.
- **Backoffice para agências** é sob proposta; o cálculo usa o piso de R$ 1.250 como referência, editável no lead.
- Nenhum lead real foi cadastrado. Os 4 leads de exemplo só existem no banco de demonstração local.

## Correção feita de passagem

- No celular, o kanban de demandas alargava a página (rótulo invisível de leitor de tela escapava da área de rolagem). Corrigido, junto com o funil.

## Migrations (só no banco do Operações, aditivas)

- 0004_fase3.sql — 7 tabelas novas: crm_stages, leads, lead_contacts, lead_stage_history, lead_interactions, message_templates, outbound_messages. Nenhuma tabela existente alterada.
- 0005_fase3_rls.sql — RLS nas tabelas novas.

Sem variáveis de ambiente novas.

## Testes

Operações: typecheck, lint, 67 testes (25 novos) e build — tudo verde. Novos: tabela de preços; cadência; operacional barrado em toda função e página do Comercial; follow-up obrigatório; duplicata; regras de cada etapa; ganho cria contratante e demanda uma única vez; expansão não duplica contratante; link do WhatsApp, opt-out e variável sem preencher; modelos em rascunho e aprovação só pelo dono; nada é enviado sozinho; exclusão de contato sem deixar dado pessoal na auditoria; importação com prévia e sem duplicar; cálculos do painel.

Conferido no navegador local (computador e largura de celular): Hoje, Funil, ficha do lead, Painel, Importar e Modelos abrem sem erro de console; registrar interação "Respondeu" moveu o lead para "Em conversa"; mover para Perdido pediu o motivo; mover para Ganho criou contratante e demanda; a prévia da importação apontou a duplicata.

## Regressão do Campo (20/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: build ok, typecheck ok, 167 de 167 testes. git status de agencia/: nenhum arquivo alterado.

## Decisões pendentes

1. Eduardo: revisar e aprovar (ou trocar) os 9 modelos de mensagem.
2. Confirmar a meta diária (está em 5) e as chances de fechar por etapa (5, 10, 25, 45, 60, 80%).
3. Primeira lista de agências para importar.
4. Aprovar a Fase 4 (Estoque de materiais dos clientes).
