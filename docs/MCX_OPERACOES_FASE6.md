# MCX Operações — Fase 6 (Migração do Notion) — 21/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

Tela **Importar do Notion** (menu, só gestor e dono), no lugar de um script de terminal — assim a importação roda em produção sem precisar de acesso ao servidor.

- **Entrada:** o CSV exportado à mão do banco "Projetos e Tarefas". Lê vírgula ou ponto e vírgula, aspas e quebra de linha dentro do campo, e tira o link que o Notion coloca nas relações ("Nome (https://notion.so/…)").
- **Colunas reconhecidas pelo nome:** Nome, Status, Responsável, Data de Término, Clientes, Prioridade e Descrição. As demais aparecem como "colunas ignoradas".
- **Pré-visualização (não grava nada):** linha por linha, o que entra, o que não entra e por quê, com os avisos.
- **O que entra:** só tarefas não concluídas, com status 1:1 (Não iniciado → A fazer; Em andamento; Aguardando → Aguardando retorno; Em revisão/aprovação → Em aprovação). Concluídas, canceladas e arquivadas ficam só no Notion.
- **Prazo:** "Data de Término" nos formatos do Notion (20 de novembro de 2026, November 20, 2026, 20/11/2026, 2026-11-20; intervalo usa o fim). Data que não dá para ler entra **sem prazo**, com aviso.
- **Contratante — de-para fixo aprovado:** Helvecio-Café e Helvecio-Barão → Helvécio (marcas Café Bravo e Barão); William Danper → Helvécio (marca Danper); Adriana → AF Merchandising; MCX, Maria e Tainara → Interno MCX. Nomes iguais aos contratantes (ou a uma marca deles) são reconhecidos sozinhos.
- **Cliente não reconhecido não entra:** a tela lista os nomes e você escolhe o contratante de cada um; confere de novo e importa.
- **Responsável:** casa pelo nome com os usuários. Sem responsável, ou com alguém que não é usuário, entra como **"A distribuir"** e aparece para o gestor. Nada é inventado.
- **Duplicatas:** mesma tarefa já existente no mesmo contratante não entra; linha repetida no arquivo não entra; tarefa parecida com uma aberta entra com aviso. **Importar o mesmo arquivo de novo não duplica.**
- **Categoria:** o Notion não tem; você escolhe uma para o lote e recategoriza depois o que precisar.
- Cada demanda importada fica marcada no histórico como "Importada do Notion", e a importação grava auditoria.

## Cortes e pendências desta fase

- **Não rodei com o CSV real:** não tenho acesso ao Notion nem ao arquivo. Os nomes das colunas e dos status foram previstos pelos mais comuns; se o seu arquivo usar outro nome, a pré-visualização mostra (coluna ignorada ou status não reconhecido) e eu ajusto em minutos.
- **Banco "Clientes" do Notion:** não é importado. Os contratantes atuais já estão cadastrados desde a Fase 1; a importação só usa o nome do cliente de cada tarefa.
- "Aguardando" no Notion não diz de quem nem quando cobrar: entra como "a confirmar", com a cobrança marcada para o dia da importação, para aparecer na fila.
- Tarefa sem prazo entra com prioridade Média mesmo sem prazo (a regra "sem prazo só com Baixa" vale para o cadastro manual; na importação não invento prazo nem rebaixo prioridade).
- O critério de aceite ("demandas abertas no sistema; Notion congelado") depende de produção no ar e do seu arquivo.

## Migrations

Nenhuma. Sem variáveis de ambiente novas.

## Testes

Operações: typecheck, lint, 106 testes (7 novos) e build — tudo verde. Novos: leitura de CSV com aspas e quebras de linha; reconhecimento de colunas; status, prioridade, relações e datas; só gestor e dono importam; a prévia não grava e explica cada linha; importação exige categoria e grava status, prazo, marca e "A distribuir"; repetir não duplica; de-para informado na tela libera as linhas que tinham ficado de fora.

Conferido no navegador local com um CSV de exemplo: 4 linhas lidas, 2 para importar (1 sem responsável), a concluída ficou de fora, o cliente desconhecido pediu o de-para e o botão de importar só libera depois de escolher a categoria.

## Regressão do Campo (21/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: build ok, typecheck ok, **166 de 167 testes**.

O teste que falhou é do próprio Campo e não tem relação com o Operações:
- `tests/flows.test.ts` › "uma visita aberta por vez e programação sem duplicidade" — responde "Já existe outra visita aberta ou registrada para esta programação".
- `agencia/` está **idêntica** à `origin/main` (0 arquivos de diferença) e à base desta branch; `git status` de agencia/: nenhum arquivo alterado.
- O mesmo teste passou nas 5 rodadas de 20/11 (sexta) e falha de forma repetida em 21/11 (sábado). Hipótese: o teste usa a programação "de hoje" dos dados de demonstração, que mudam conforme o dia da semana. É um problema de massa de teste, não da regra em produção (a regra "uma visita por programação" é a esperada).
- Na primeira rodada do dia outro teste (`portfolio.test.ts`) falhou uma vez: o computador ficou suspenso durante a execução e a data virou no meio. Rodando de novo, passou.

Não corrigi nada, porque a regra é não tocar em agencia/. Fica como pendência para tratar no Campo, com a sua autorização.
