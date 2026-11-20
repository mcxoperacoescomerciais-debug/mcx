# MCX Operações

Sistema interno da MCX (demandas, contratantes, equipe). **Separado do MCX Campo**: pasta, banco, login e deploy próprios. Especificação em `../docs/MCX_OPERACOES.md`; diagnóstico em `../docs/MCX_OPERACOES_FASE0.md`.

## Regra nº 1

Nada aqui altera `agencia/`. `tests/guarda-campo.test.ts` (e o workflow `.github/workflows/operacoes.yml`) falham se a branch tocar em qualquer arquivo do Campo, e `scripts/migrate.ts` recusa rodar se o banco de destino for o do Campo.

## Rodar no computador

```bash
npm install
npm run dev          # http://localhost:3700, banco embutido (PGlite) com dados de demonstração
```

Sem `DATABASE_URL`, o sistema usa um banco embutido em `.data/` com a equipe inicial (eduardo, maria, tainara) e algumas demandas de exemplo.

## Conferir antes de entregar

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Produção (serviço próprio no Render)

- Root Directory: `operacoes` · Build: `npm install && npm run build` · Start: `npm run start:render`
- `start:render` aplica as migrações (só no banco do Operações), confere os dados de base e sobe o app.
- Variáveis: ver `.env.example`. Nunca reutilizar `DATABASE_URL` ou `SESSION_SECRET` do Campo.
- `OPS_ENABLED=false` desliga o sistema inteiro.

No primeiro início em produção são criados: as 9 categorias, "Interno MCX", os contratantes atuais e a equipe inicial (troca de senha obrigatória no primeiro acesso). Demandas de exemplo **não** são criadas em produção.

## Estrutura

- `src/lib` — regras puras (datas em America/Sao_Paulo, fila, permissões por papel, anti-duplicata).
- `src/server` — banco (Drizzle), login, demandas, cadastros, auditoria e o registro de capacidades (`capabilities.ts`, fonte do Manual).
- `src/app` — telas. `actions.ts` concentra as server actions; toda action confere a sessão.
- `tests` — guarda do Campo, isolamento/permissões, regras e registro de capacidades.
