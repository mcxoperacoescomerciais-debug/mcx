# SUINCO | Gestão de Loja

Plataforma MCX para a operação AF Merchandising → SUINCO: registro de validades,
rupturas e avarias pelos promotores (celular, funciona sem sinal) e painel de
gestão com alertas, indicadores, insights e relatório semanal automático.

Análise completa, decisões e roadmap: [`../docs/ARQUITETURA.md`](../docs/ARQUITETURA.md).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem `DATABASE_URL`, o app usa um Postgres embutido
(PGlite, em `.data/pglite`) e cria dados de demonstração com o catálogo e o mix
reais da SUINCO (planilhas de MIX ABC e BH).

Usuários de demonstração (senha em `DEMO_PASSWORD`, padrão definido em
`src/server/db/seed.ts`):

| Usuário | Perfil | Abre em |
|---|---|---|
| `admin` | Administrador | /painel |
| `gestor.af` | Gestor AF Merchandising | /painel |
| `gestor.suinco` | Gestor SUINCO (somente leitura) | /painel |
| `joao`, `patricia`, `lucas` | Promotor | /app (use o modo celular do navegador) |

Para recomeçar do zero: pare o servidor e apague `.data/pglite`.

### Testar como no celular (PWA + sem internet)

O Service Worker só roda no build de produção:

```bash
npm run build
npm run start:demo
```

Abre em http://localhost:3100 com um banco de demonstração separado.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes das regras de negócio (validade, classificação, busca, períodos, planilha de mix) |
| `npm run typecheck` / `npm run lint` | Verificações estáticas |
| `npm run db:generate` | Gera migração SQL após mudar `src/server/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrações no banco de `DATABASE_URL` |
| `npm run db:bootstrap` | Implantação inicial: agência, cliente SUINCO, redes, catálogo/mix e o primeiro admin |
| `npx tsx --tsconfig tsconfig.scripts.json scripts/build-catalog.ts <MIX BH.xlsx> <MIX ABC.xlsx>` | Regera o catálogo de demonstração a partir das planilhas |
| `npx tsx --tsconfig tsconfig.scripts.json scripts/render-sample-pdf.ts` | Gera PDFs de amostra (visita e semanal) em `.data/samples` |

## Produção (Supabase + Vercel)

1. **Supabase**: crie um bucket **privado** `occurrence-photos` em Storage.
2. Rode as migrações com a URL **direta** (porta 5432):
   `DATABASE_URL=postgres://... npm run db:migrate`
3. Implantação inicial (uma vez):
   `DATABASE_URL=... ADMIN_USERNAME=... ADMIN_NAME="..." ADMIN_PASSWORD='...' npm run db:bootstrap`
4. Na Vercel, configure as variáveis de `.env.example` (`DATABASE_URL` com a URL do
   **pooler**, porta 6543; `SESSION_SECRET`; `SUPABASE_*`) e aponte o
   diretório raiz do projeto para `web/`.
5. No painel: **Importar planilha** → lojas (com o promotor de cada uma) e
   promotores; o mix é atualizado sempre que a SUINCO mandar planilha nova.

O plano gratuito da Vercel não permite uso comercial — use o Pro, ou Render/Railway
(o app é um Next.js padrão). O relatório para a SUINCO é gerado manualmente em
Relatórios, escolhendo o período (padrão: semana anterior).

## Estrutura

```
src/
├── app/
│   ├── login/            Login
│   ├── app/              App do promotor (SPA offline-first, navegação por #hash)
│   │   ├── _lib/         IndexedDB + fila de sincronização + compressão de foto
│   │   └── _components/  Telas (início, lojas, visita, seções, conferência, histórico)
│   ├── painel/           Painel do gestor (dashboard, alertas, lojas, produtos,
│   │                     visitas, promotores, relatórios, configurações, admin)
│   └── api/              Sync do promotor, fotos, PDFs, exportação, modelos
├── server/               Regras de servidor: auth, escopo, analytics, insights,
│   │                     relatório semanal, auditoria, storage, importação
│   ├── db/               Schema Drizzle, conexão, seed de demonstração
│   └── pdf/              PDF da visita e PDF executivo semanal
├── lib/                  Regras puras compartilhadas (validade, filtros, busca, domínio)
└── proxy.ts              Redirecionamento por perfil
drizzle/                  Migrações SQL (inclui RLS)
public/sw.js              Service Worker (app abre sem internet)
```
