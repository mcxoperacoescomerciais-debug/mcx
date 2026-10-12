# MCX Campo — Gestão de promotores e execução em loja

App do promotor (celular, funciona sem sinal) + painel do gestor + administração.
Arquitetura, modelo de dados, regras de contagem e decisões:
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Rodar localmente

```bash
npm install
npm run dev
```

Sem `DATABASE_URL`, usa Postgres embutido (PGlite em `.data/pglite`) com dados de
**demonstração**: lojas e produtos SUINCO reais; catálogos de Bravo Café, Fofinho
e Dona Clara são ilustrativos. Senha de todos: `DEMO_PASSWORD` (padrão em
`src/server/db/seed.ts`).

| Usuário | Perfil |
|---|---|
| `admin` | Administrador (cadastros, importação, configurações, auditoria) |
| `gestor` | Gestor da operação (todas as marcas) |
| `bravo` | Gestor restrito à marca Bravo Café (visão de cliente) |
| `joao`, `patricia`, `lucas` | Promotores fixos — abrem em `/app` |
| `ana` | Promotora freelancer |

Para recomeçar: pare o servidor e apague `.data/pglite`.

### Testar como no celular (PWA + sem internet)

```bash
npm run build
npm run start:demo
```

Abre em http://localhost:3300 com banco de demonstração próprio.

## Comandos

| Comando | O que faz |
|---|---|
| `npm test` | Regras de negócio + testes de integração dos 8 cenários de aceitação |
| `npm run typecheck` / `npm run lint` | Verificações estáticas |
| `npm run db:generate` | Gera migração após mudar `src/server/db/schema.ts` |
| `npm run db:migrate` | Aplica migrações no banco de `DATABASE_URL` |
| `npm run db:bootstrap` | Cria a agência e o primeiro administrador (idempotente) |
| `npx tsx --tsconfig tsconfig.scripts.json scripts/render-samples.ts` | PDFs de amostra em `.data/samples` |

## Produção (Supabase + Render/Vercel)

1. **Supabase**: crie um projeto (ou use um schema/projeto separado do SUINCO) e um
   bucket **privado** `campo-evidencias`.
2. Migrações (URL **direta**, porta 5432): `DATABASE_URL=postgres://... npm run db:migrate`
3. Primeiro acesso:
   `DATABASE_URL=... AGENCY_NAME="AF Merchandising" ADMIN_USERNAME=... ADMIN_NAME="..." ADMIN_PASSWORD='mín. 10 caracteres' npm run db:bootstrap`
4. Hospedagem: diretório raiz `agencia/`, variáveis de `.env.example`
   (`DATABASE_URL` do **pooler**, `SESSION_SECRET` forte, `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`). Comando de início: `npm run start:render`.
5. No painel (admin): Marcas → Importar planilha (lojas, produtos, promotores) →
   Roteiros → Programação.

## Estrutura

```
src/
├── app/
│   ├── app/          App do promotor (SPA offline, navegação por #hash)
│   ├── painel/       Painel do gestor e administração
│   ├── api/          Sync, fotos, relatórios PDF, exportações, modelos
│   └── login, sair
├── server/           Regras de servidor (escopo, sync, painel, pendências, PDFs…)
│   └── db/           Schema, conexão, seed de demonstração
├── lib/              Regras puras compartilhadas celular/servidor
└── components/       Design system
drizzle/              Migrações SQL (inclui RLS)
tests/                Testes automatizados
```
