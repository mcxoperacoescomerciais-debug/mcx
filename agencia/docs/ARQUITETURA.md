# MCX Campo — Arquitetura, modelo de dados e regras

Sistema de gestão de promotores e execução em loja para agência de promotoria
(Belo Horizonte/MG): roteiro do promotor, visita ao supermercado, **atendimento
separado por marca**, fotos do antes e depois, estoque, ruptura, ocorrências e
painel gerencial diário.

> Promotor registra no celular (funciona sem sinal) → servidor valida e guarda →
> gestor acompanha, trata pendências e gera relatórios.

---

## 1. Arquitetura

```
Celular do promotor (PWA)                  Navegador do gestor
 ├─ Service Worker: app abre sem internet   └─ Painel (Server Components)
 ├─ IndexedDB: visitas, fila, fotos (Blob)
 └─ Compressão no aparelho (1600px + miniatura 360px)
            │  HTTPS · cookie de sessão httpOnly (JWT HS256, 30 dias)
┌───────────▼──────────────── Next.js 16 (App Router, TypeScript) ──────────────────┐
│ proxy.ts — redireciona por perfil (checagem otimista)                             │
│ /api/promoter/{bootstrap,sync,history} · /api/photos · /api/reports · /api/export │
│ src/server: auth+escopo · promoter (sync) · operations (dia) · issues (pendências)│
│             analytics · details · manager (ações) · schedules · admin · import    │
│             reports · pdf · xlsx · storage · audit                                │
└──────────┬──────────────────────────────┬─────────────────────────────────────────┘
     Drizzle ORM                     Storage
  PostgreSQL (Supabase)          Bucket PRIVADO (Supabase) · dev: disco local
  dev/teste: PGlite
```

Decisões:

- **Sistema independente** em `agencia/`, reaproveitando a stack já validada em
  produção no projeto SUINCO (`web/`): Next.js + Postgres/Supabase + PWA offline.
  O sistema SUINCO não foi alterado.
- **Autenticação própria** (usuário + senha, bcrypt custo 12, bloqueio após 5
  erros, `session_version` derruba sessões ao trocar senha/desativar). Promotor
  freelancer muitas vezes não tem e-mail corporativo.
- **Autorização em 3 camadas**: `proxy.ts` → `requireRole`/`getApiScope` em cada
  página/rota → **escopo em toda consulta** (`src/server/scope.ts`): agência +
  promotores visíveis + marcas visíveis. Lista vazia = nada (nunca "tudo").
- **Multiagência**: toda tabela operacional tem `agency_id`; o escopo sai da agência
  do usuário. A equipe MCX escolhe a agência ativa (cookie `campo_agencia`, validado no
  servidor a cada requisição) e recebe um escopo de administrador **daquela** agência —
  nunca um escopo que cruze agências. A visão macro calcula cada agência separadamente
  (mesmo `getDayBoard`) e só soma os números. Agência suspensa derruba as sessões dela.
- **RLS** habilitado em todas as tabelas sem políticas para `anon`/`authenticated`:
  a API REST do Supabase não devolve linhas nem se a chave pública vazar. A chave
  de serviço só existe no servidor.
- **Fotos** nunca têm URL pública: `/api/photos/:id` confere escopo a cada acesso.
  Download de foto e toda exportação ficam na auditoria.

## 2. Hierarquia e modelo de dados

```
MCX (plataforma, users.platform) ─┬─ AF Merchandising ─ admin · gestores · promotores
                                  └─ ETROS            ─ admin · gestores · promotores
agência → promotor → programação (roteiro do dia)
  → VISITA (uma loja, um promotor, um dia)
    → ATENDIMENTO por marca (um por marca na visita)
      → fotos (antes/depois/ruptura/ocorrência) · estoque · ruptura · ocorrências
```

| Tabela | Papel |
|---|---|
| `agencies` | Agência cliente ou plataforma (`kind`), status (ativa/suspensa), logo e parâmetros (`settings`) |
| `users` | Admin, gestor (escopo de marcas/equipe) e promotor; `platform` = equipe MCX (mora na agência da plataforma) |
| `brands` | Marca + regras: fotos mínimas antes/depois, estoque obrigatório, foto na ruptura, galeria, atividades |
| `chains`, `stores` | Redes e lojas (código, CNPJ, endereço, regras) |
| `store_brands` | Marcas autorizadas em cada loja |
| `products` | Produto por marca (SKU, EAN, categoria, variante, embalagem, unidade). `name_key` impede duplicatas por grafia |
| `store_products` | Produtos acompanhados na loja (sem linhas = todos os ativos da marca) |
| `user_stores`, `user_brands` | Lojas e marcas autorizadas ao promotor (marcas = escopo do gestor restrito) |
| `routes`, `route_stops` | Roteiros (modelo semanal) que geram programações |
| `schedules`, `schedule_brands` | Programação: promotor + loja + dia + marcas previstas |
| `visits` | Visita (UUID do aparelho), início/fim, origem (programada/extra), justificativas, localização |
| `attendances` | Atendimento por marca: status, horários, atividades, exceção justificada, avaliação |
| `photos` | Foto declarada pelo aparelho; `uploaded_at` só preenche quando o arquivo chega |
| `stock_entries` | Estoque por produto: quantidade · zero · não encontrado · não se aplica |
| `unregistered_products` | Produto fora do cadastro encontrado em campo (fila do gestor) |
| `ruptures`, `rupture_events` | Ruptura (situação + status de tratamento) e histórico de status |
| `occurrences` | Observações/ocorrências por categoria, com tratamento |
| `correction_requests` | Pedido de correção com **retrato completo** do atendimento original |
| `issue_reviews` | Análise de pendência pelo gestor (analisada ≠ resolvida) |
| `audit_logs` | Quem, quando, o quê, antes→depois e motivo |

Integridade garantida **no banco**: chaves estrangeiras; `unique` por
(visita, marca), (atendimento, produto) no estoque, ruptura ativa por
(atendimento, produto), programação ativa por (promotor, dia, loja), uma visita
válida por programação e **uma visita aberta por promotor**; `check` de coerência
(estoque zero = 0, "não encontrado" sem número; justificativa obrigatória em
visita incompleta, visita extra, exceção e cancelamento; fim ≥ início).
Nada operacional é apagado: inativação e exclusão lógica (`deleted_at`).

## 3. Telas

**Promotor (celular, `/app`)**: Hoje (saudação, contadores, botão principal,
correções, roteiro com progresso por marca, amanhã) · Lojas (só autorizadas,
busca, visita extraordinária com justificativa) · Visita (marcas, outra marca
autorizada, observações, resumo e encerramento) · Atendimento em 7 etapas
(Antes → Execução → Depois → Estoque → Ruptura → Ocorrências → Revisão) ·
Histórico · Perfil (sincronização, trocar senha).

**Gestor (`/painel`)**: Painel do dia · Central de pendências · Promotores (+
detalhe) · Lojas (+ histórico) · Visita · Atendimento (antes × depois, estoque
com registro anterior, rupturas, ocorrências, ações, histórico) · Programação ·
Roteiros · Estoque · Rupturas (+ tratamento) · Relatório fotográfico ·
Relatórios e exportação.

**Administrador**: Marcas · Redes e lojas (+ produtos acompanhados por loja) ·
Produtos · Usuários (marcas e lojas autorizadas) · Importar planilha ·
Configurações · Auditoria.

## 4. Regras de contagem do painel (metodologia)

Cada **loja programada** do dia cai em **exatamente um** grupo (a soma é sempre o
total programado):

| Grupo | Regra |
|---|---|
| Concluída | Visita encerrada, todas as marcas previstas concluídas, sem exceção |
| Concluída com exceção | Encerrada com marca pendente justificada, exceção de foto/estoque, marca cancelada, correção pedida ou reprovação |
| Em andamento | Visita iniciada e não encerrada |
| Atrasada | Não iniciada e horário previsto + tolerância (padrão 60 min) já passou |
| Pendente | Não iniciada, dentro do prazo ou sem horário previsto |
| Não realizada | Dia anterior, ou após o fim do dia operacional (padrão 20:00), sem visita |

- **Lojas concluídas** = Concluída + Concluída com exceção (exceções mostradas à parte).
- **Atraso** depende de horário previsto; ausência de registro recente sozinha
  não indica atraso nem "promotor parado".
- Percentuais só com denominador > 0 (senão "—"). Tempo médio de resolução de
  ruptura só com ≥ 3 resoluções datadas.
- Todos os cartões do dia saem do mesmo conjunto de consultas
  (`src/server/operations.ts`); clicar no cartão abre a lista que o originou.

## 5. Regras de negócio implementadas

1. Visita contém vários atendimentos de marcas diferentes; cada atendimento tem
   seus próprios registros (nenhuma tabela mistura marcas).
2. Promotor só vê/registra lojas e marcas autorizadas (servidor revalida em todo envio).
3. Foto vinculada ao atendimento e ao tipo; foto só conta como enviada quando o
   arquivo chegou ao servidor.
4. Finalização normal bloqueada sem fotos mínimas e com produtos acompanhados sem
   informação de estoque (configurável por marca). A mensagem diz exatamente o que falta.
5. Exceção exige itens + motivo + justificativa e fica visível ao gestor.
6. Estoque vazio = pendente, nunca zero.
7. Ruptura (modo SUINCO): o promotor toca no produto e marca "Ruptura total"; sem tratamento no painel.
8. Estoque zero/não encontrado **sugere** ruptura (destaque na lista); só vira registro com o toque do promotor.
9. Encerrar a visita não altera horários dos atendimentos; horário de início é imutável.
10. Correção preserva o original (snapshot) e registra quem pediu e quem corrigiu.
11. Desativar usuário mantém o histórico e derruba sessões.
12. Status relevantes, exportações e alterações de cadastro vão para a auditoria.
13. Visualizar não resolve: pendência
    "analisada" continua aberta até a causa sumir ou o gestor concluir.

## 6. Campo e conectividade (offline)

- Ao abrir com sinal, o app baixa o "bootstrap": lojas e marcas autorizadas,
  produtos, programação de hoje e amanhã, visitas do dia e correções pedidas.
- Toda ação grava primeiro no IndexedDB; `rev`/`syncedRev` por visita **e por
  atendimento** controlam o que falta enviar. Envio idempotente pelo UUID do aparelho.
- Fotos ficam como Blob até o servidor confirmar. Indicador sempre visível
  ("Salvo", "N a enviar", "Sem sinal · N"). Sair com pendências é bloqueado.
- Conflitos: o servidor é a autoridade. Atendimento concluído no servidor fica
  bloqueado (o aparelho adota a versão do servidor); visita recusada
  (ex.: loja desautorizada) fica sinalizada, não some e não prende o promotor.
- **Testado**: app aberto sem servidor (Service Worker), visita e foto registradas
  sem rede, sincronização ao voltar a conexão.

## 7. Relatórios e exportação

PDF (servidor, `@react-pdf/renderer`, cabeçalho, rodapé, paginação): atendimento,
visita (uma seção por marca), loja (todas as marcas do período), diário da
operação (paisagem) e por marca (por loja e por produto). Excel/CSV: atendimentos,
estoque (com registro anterior e divergência), rupturas, lojas do dia, diário
(multi-abas) e por marca. Tudo respeita o escopo do usuário.

## 8. Segurança e LGPD

Segredos só em variáveis de ambiente; cookie `httpOnly`/`Secure`/`SameSite=Lax`;
cabeçalhos `nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` (câmera e
localização só do próprio site); validação Zod em todo payload do aparelho; UUID
validado nas rotas; dados pessoais limitados ao necessário (sem CPF; e-mail e
telefone opcionais); localização só com permissão do promotor e só no início da
visita. Backups: usar o backup diário do Supabase (PITR no plano pago) e exportar
o bucket periodicamente.

## 9. Validade, avaria e alerta (modo SUINCO)

Trazidos do sistema SUINCO (`web/`) para cada atendimento de marca:

- **Validade** (`validities`): produto, área de vendas/estoque, validade digitada
  (0510 → 05/10), quantidade, preço, lote, foto opcional. Dias para vencer e
  severidade (Vencido, Crítico, Alto, Atenção, Monitoramento, Normal) são
  calculados no servidor sobre a data da visita e as faixas da agência
  (Configurações) — src/lib/validity.ts.
- **Avaria** (`damages`): tipo, quantidade, validade e lote opcionais, **foto obrigatória**
  (regra de finalização `damage_photo`).
- **Alerta no WhatsApp** (src/server/whatsapp-alert.ts, CallMeBot): ao finalizar o
  atendimento com validade crítica — vencido/até "Crítico até" dias, ou grande
  quantidade (até N dias e acima de Q unidades) — a agência recebe nome da
  agência, marca, promotor, loja, cidade, itens e o link curto do PDF
  (`/r/<id>`, sem login, 30 dias). Um alerta por atendimento (`whatsapp_alerts`).
  Número e chave por agência em Configurações; a chave nunca volta para a tela
  nem vai para a auditoria.
- **PDF para o promotor**: "Enviar PDF no WhatsApp" na Revisão do atendimento
  concluído; o PDF é baixado antes do toque (o compartilhar do celular exige o
  gesto recente).
- Painel: Validades, Avarias e Rupturas (lista + Excel), seções no atendimento e no PDF.

## 10. Fases seguintes (não implementadas de propósito)

Leitura de código de barras · reconhecimento de produto/IA assistida para fotos
(sempre como apoio, nunca como veredito) · alertas automáticos por e-mail/push
· relatórios agendados · integrações com clientes · ordem de etapas configurável por
marca · app nativo, se o PWA não bastar.
