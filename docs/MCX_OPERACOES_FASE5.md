# MCX Operações — Fase 5 (Contratos + Documentos) — 20/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

**Contratos** (menu "Contratos", só gestor e dono)
- Contratante, serviços, valor mensal, dia de vencimento, início, vigência (padrão de 6 meses, fim calculado), renovação automática, status (Rascunho, Vigente, Encerrado, Cancelado) e observações.
- **Aditivos:** em contrato vigente, valor e prazo só mudam por aditivo — data, descrição, valor anterior → novo e fim anterior → novo ficam no histórico.
- O valor mensal do contratante (usado em Horas × Receita) passa a ser a soma dos contratos vigentes.
- **Avisos 30 e 7 dias antes do fim da vigência**, como demanda para o gestor, uma vez cada.
- Ganhar um lead no Comercial agora cria também o **contrato em rascunho** (o corte da Fase 3).
- Exclusão lógica, com motivo.

**Documentos** (menu "Documentos")
- Envio de PDF, imagem (png, jpg, webp), xlsx, docx e csv, até 8 MB. O arquivo é validado pelo nome **e pelo conteúdo** (um .exe renomeado ou um HTML com extensão .pdf é recusado).
- Vínculo opcional com contratante, contrato, marca e promotor; categoria; validade.
- **Versões:** novo envio do mesmo documento cria a versão seguinte; as anteriores continuam guardadas e baixáveis.
- **Restrição:** Contrato e Documento de promotor são sempre restritos (só gestor e dono), mesmo que ninguém marque. O operacional não lista, não abre e não baixa documento restrito — a resposta é "não encontrado", igual a um ID inexistente.
- **Log de acesso:** cada download de documento restrito grava auditoria (quem, quando, qual versão).
- Sem URL pública: o arquivo só sai por rota autenticada, que confere a permissão a cada acesso, sem cache, e não deixa PDF/imagem executar script.
- Documento com validade em até 30 dias vira demanda para o gestor (o título não revela documento restrito).
- Exclusão lógica, com motivo; o arquivo nunca é apagado.

**Ficha operacional do contratante**
- Seções fixas: como faz pedido, sistemas usados, regras de visita, fechamento, relatórios, particularidades e "onde está a credencial".
- **Nunca guarda senha:** texto que parece senha escrita ("senha: …") é recusado com explicação.

**Painel**
- "Contratos terminando em até 30 dias" e "Documentos com validade em até 30 dias" (respeitando a restrição de quem vê).

**Armazenamento**
- Driver próprio do Operações (adaptado do Campo, sem importar nada dele), com variáveis próprias `OPS_R2_*` e bucket separado.
- Em produção, **sem o bucket configurado o envio fica desligado** e a tela avisa — nada é gravado no disco do Render (que é apagado a cada reinício). Contratos, aditivos e ficha funcionam mesmo sem bucket.

## Cortes e pendências desta fase

- **Bucket R2 do Operações ainda não existe** (depende de você, ver lista abaixo). Até lá não dá para anexar os contratos reais — o critério de aceite "contratos atuais anexados" fica aberto.
- **Contratos atuais não foram cadastrados:** não tenho valores nem datas reais, e não invento. A Maria cadastra em "Contratos" (1 minuto cada).
- **Limite de 8 MB** por arquivo (a especificação sugeria 15 MB; fiquei abaixo do limite de corpo do servidor para o envio não falhar em silêncio). Dá para subir depois.
- **Foto do item do estoque e foto da conferência do kit:** o módulo de arquivos existe; ligar essas duas telas a ele fica para um ajuste seguinte.
- **Backup independente** (pg_dump diário para o R2, seção 7): continua proposto, não implementado — precisa do bucket e de um segredo no GitHub.
- Fora da V1: compartilhar documento com cliente e assinatura dentro do sistema.

## Migrations (só no banco do Operações, aditivas)

- 0008_fase5.sql — 5 tabelas novas (contracts, contract_amendments, documents, document_versions, alert_runs) e 1 coluna nova opcional (clients.operational_profile).
- 0009_fase5_rls.sql — RLS nas tabelas novas.

## Variáveis de ambiente novas

- OPS_R2_ACCOUNT_ID, OPS_R2_ACCESS_KEY_ID, OPS_R2_SECRET_ACCESS_KEY, OPS_R2_BUCKET — bucket privado e próprio do Operações. Não reutilizar as do Campo.

## Testes

Operações: typecheck, lint, 99 testes (16 novos) e build — tudo verde. Novos: validação de arquivo por nome e conteúdo; chave do bucket; vigência e janelas de aviso; detector de senha; operacional sem acesso a contrato; contrato vigente só muda por aditivo; avisos de contrato sem duplicar (inclusive em paralelo); contrato em rascunho ao ganhar lead; restrição de documentos (lista, leitura, download com ID certo, nova versão, edição, exclusão); auditoria de download restrito; arquivo inválido ou bucket fora do ar não deixa documento órfão; versões; exclusão lógica sem apagar o arquivo; aviso de validade sem revelar documento restrito; ficha operacional; rotas de download sem cache, com 404 e sem ler variáveis do Campo.

Conferido no navegador local: envio de documento comum e de contrato (marcado como restrito sozinho), recusa de .exe e de PDF falso, download com os cabeçalhos certos; como operacional: o documento restrito responde 404 pela API e pela página, "Contratos" some do menu e redireciona, e as categorias restritas não aparecem no formulário de envio.

## Regressão do Campo (20/11/2026, sem alterar nada)

Rodado em agencia/ nesta branch: build ok, typecheck ok, 167 de 167 testes. git status de agencia/: nenhum arquivo alterado.

## O que depende de você (quando puder)

1. Criar no Cloudflare um bucket R2 **novo e privado** (sugestão: `mcx-operacoes-documentos`) e um token de acesso só para ele; colar as 4 variáveis `OPS_R2_*` no serviço `mcx-operacoes` do Render. Não usar o bucket nem as chaves do Campo.
2. Maria: cadastrar os contratos atuais (serviços, valor, início, vigência) e anexar os arquivos.
3. Preencher a ficha operacional de cada contratante.
