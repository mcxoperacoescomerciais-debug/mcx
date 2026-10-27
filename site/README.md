# Site institucional — MCX Operações Comerciais

Site de uma página que apresenta as duas frentes da MCX: **operações comerciais e promotoria** e **serviços administrativos e financeiros**. O contato principal é o WhatsApp oficial.

- **Stack:** Next.js 16 (exportação estática) + React 19 + Tailwind CSS 4 + ícones lucide-react.
- **Sem backend e sem banco de dados.** `npm run build` gera a pasta `out/` com HTML, CSS e imagens, que pode ser publicada em qualquer hospedagem de site estático.
- Mesma stack dos outros sistemas deste repositório (`web/`, `agencia/`), para facilitar a manutenção.

## Rodar no computador

Requer Node.js 20.9 ou superior.

```bash
cd site
npm install
npm run dev          # http://localhost:3400
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Gera a versão de produção em `out/` |
| `npm start` | Serve a pasta `out/` em http://localhost:3500 (testar o build) |
| `npm test` | Testa a geração dos links do WhatsApp e a validação do formulário |
| `npm run lint` / `npm run typecheck` | Verificações de código |
| `npm run icons` | Recria logos, ícones e imagem de compartilhamento a partir de `public/mcx-logo.png` |

## Onde fica cada coisa

| Arquivo | Conteúdo |
| --- | --- |
| `src/config/site.ts` | **Configuração central:** nome, logo, WhatsApp, e-mail, redes sociais, domínio, dados do rodapé, SEO, fotos |
| `src/content/conteudo.ts` | Todos os textos das seções (menu, hero, soluções, perfis, diferenciais, etapas, contato) |
| `src/lib/whatsapp.ts` | Função única que gera os links do WhatsApp e as mensagens pré-preenchidas |
| `src/app/globals.css` | Tokens de design (cores, fontes, animação) |
| `src/components/` | Componentes reutilizáveis e seções da página |
| `src/app/politica-de-privacidade/` | Política de Privacidade (texto-base) |
| `public/mcx-logo.png` | Logo oficial. `public/brand/` tem as variações geradas por `npm run icons` |

## Configurar o WhatsApp oficial

O número fica em **um único lugar**. Escolha uma das formas:

1. **Variável de ambiente (recomendado):** crie `site/.env.local` a partir de `.env.example` (no computador) ou cadastre na hospedagem:
   ```
   NEXT_PUBLIC_WHATSAPP=55DDDNUMERO
   ```
2. **Direto na configuração:** em `src/config/site.ts`, troque `process.env.NEXT_PUBLIC_WHATSAPP ?? ""` pelo número entre aspas.

Formato: DDI 55 + DDD + número, só dígitos (pontos, traços e parênteses também são aceitos e removidos). Se o número estiver vazio ou incompleto:

- **em desenvolvimento**, os botões aparecem com o aviso tracejado "WhatsApp a configurar";
- **no site publicado**, nenhum botão de WhatsApp aparece (nunca leva a uma conversa inválida), o formulário fica oculto e a seção de contato mostra "Nossos canais de atendimento estarão disponíveis aqui em breve".

Depois de alterar, rode `npm run build` de novo (ou faça um novo deploy).

As mensagens são montadas em `src/lib/whatsapp.ts`: mensagem padrão (em `site.ts`), uma por solução ("Consultar esta solução") e a do formulário. O site **não envia nada**: o link abre o WhatsApp com o texto pronto e o visitante revisa e envia.

## Dados da MCX que ainda faltam

Nada disso foi inventado; cada item só aparece no site depois de preenchido em `src/config/site.ts`:

- [ ] Número do WhatsApp oficial
- [ ] Domínio definitivo (`NEXT_PUBLIC_SITE_URL`) — usado em SEO, sitemap e compartilhamento
- [ ] E-mail institucional (opcional)
- [ ] Links das redes sociais oficiais (opcional)
- [ ] Razão social, CNPJ e endereço para o rodapé (opcionais)
- [ ] Fotos próprias da equipe/operação (opcional — enquanto não houver, o topo usa uma composição ilustrativa sem dados reais)
- [ ] Revisão da Política de Privacidade pela assessoria jurídica
- [ ] Texto institucional oficial, se houver (seção "Sobre" em `src/content/conteudo.ts`)

## Publicar o site

### Hospedagem recomendada: Cloudflare Pages

Para um site estático como este, o Cloudflare Pages atende bem: plano gratuito sem limite de tráfego para sites estáticos, HTTPS automático, domínio próprio e leitura do arquivo `public/_headers` (cabeçalhos de segurança). Netlify e Vercel também funcionam com a mesma pasta `out/`. Confira os planos e limites atuais no site de cada serviço antes de contratar.

Passo a passo (Cloudflare Pages, com o código no GitHub):

1. Crie a conta da MCX no Cloudflare (com o e-mail da empresa).
2. Em **Workers & Pages → Create → Pages → Connect to Git**, escolha este repositório.
3. Configure o build:
   - **Root directory:** `site`
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Variáveis de ambiente:** `NEXT_PUBLIC_WHATSAPP`, `NEXT_PUBLIC_SITE_URL` e `NODE_VERSION=22`
4. Salve. Cada novo commit na branch principal publica uma nova versão.

Sem GitHub: rode `npm run build` e faça o upload da pasta `out/` em **Create → Pages → Upload assets**.

### Registrar e apontar o domínio

1. Escolha o nome e registre o `.com.br` no **Registro.br** (exige o CNPJ da MCX; o registro é anual). Para `.com`, use um registrador internacional ou o próprio Cloudflare Registrar.
2. No projeto do Cloudflare Pages, abra **Custom domains → Set up a domain** e informe o domínio (ex.: `www.seudominio.com.br`).
3. Siga as instruções exibidas: o mais simples é trocar os servidores DNS no Registro.br pelos do Cloudflare; a alternativa é criar um registro `CNAME` apontando `www` para o endereço `*.pages.dev` do projeto.
4. Atualize `NEXT_PUBLIC_SITE_URL` com o endereço final (com `https://`) e publique de novo.
5. Opcional: cadastre o site no Google Search Console e envie `https://seudominio/sitemap.xml`.

> Nenhum domínio, plano ou serviço foi contratado. Essas etapas dependem da aprovação da MCX.

## Checklist antes de colocar no ar

- [ ] `NEXT_PUBLIC_WHATSAPP` configurado e testado: o botão abre a conversa com o número certo em celular e computador
- [ ] `NEXT_PUBLIC_SITE_URL` com o domínio final; `/sitemap.xml` e `/robots.txt` mostram esse domínio
- [ ] Nenhum aviso "WhatsApp a configurar" ou "Modo de desenvolvimento" no site publicado
- [ ] Textos revisados pela MCX (sem promessas de resultado, sem clientes ou números não confirmados)
- [ ] Política de Privacidade revisada
- [ ] Rodapé só com dados confirmados (CNPJ, endereço, e-mail)
- [ ] `npm test`, `npm run lint` e `npm run build` sem erros
- [ ] Visual conferido em celular (375 px e 430 px), tablet (768 px) e computador (1366 px e 1920 px)
- [ ] Prévia de compartilhamento conferida (cole o link no WhatsApp e veja título, descrição e imagem)
- [ ] HTTPS ativo no domínio

## Limitações atuais

- O formulário não envia dados para a MCX: ele monta a mensagem e abre o WhatsApp. Para receber formulários por e-mail ou em uma planilha, será preciso integrar um serviço (ex.: Formspree, Cloudflare Workers) — não implementado.
- Sem ferramenta de análise de visitas (Google Analytics etc.). Se for adicionada, atualize a Política de Privacidade e inclua aviso de cookies.
- Sem fotos próprias: o topo usa uma composição ilustrativa. Para trocar, veja `imagens.hero` em `src/config/site.ts`.
- Site em uma página. Para criar páginas individuais de serviços, crie pastas em `src/app/solucoes/<nome>/page.tsx` reaproveitando os componentes e os textos de `conteudo.ts`.
