# MCX Tracker

Automação do preenchimento da planilha de acompanhamento de promotores.
Fase inicial: projeto **Café** (grupo "Grupo HL Café bravo" no WhatsApp).

## Setup (Fase 0)

### 1. Ambiente Python

```bash
cd mcx_tracker
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
playwright install chromium
```

### 2. Criar a Service Account do Google (para o robô acessar a planilha)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e crie (ou reuse) um projeto.
2. Ative a **Google Sheets API** e a **Google Drive API** para esse projeto.
3. Vá em "APIs e Serviços" > "Credenciais" > "Criar Credenciais" > "Conta de serviço".
4. Após criar, abra a conta de serviço, aba "Chaves" > "Adicionar Chave" > "Criar nova chave" > JSON.
5. Salve o arquivo baixado como `data/credentials/service_account.json`.
6. Copie o e-mail da service account (algo como `mcx-tracker@seu-projeto.iam.gserviceaccount.com`).
7. Abra a planilha do Google Sheets e **compartilhe com esse e-mail** dando acesso de **Editor**.

### 3. Configurar variáveis de ambiente

```bash
copy .env.example .env
```

Edite o `.env` e preencha `OPENAI_API_KEY` (ou `GEMINI_API_KEY`, dependendo do `VISION_PROVIDER` escolhido).

### 4. Criar o banco local (SQLite)

```bash
python scripts/init_db.py
```

### 5. Validar a conexão com a planilha

```bash
python scripts/check_sheets_connection.py cafe
```

Isso confirma que a Service Account tem acesso à aba "HL Cafe" e que os nomes de
coluna em `core/config/projects/cafe.yaml` batem com o cabeçalho real da planilha.

**Atenção**: a planilha tem várias abas parecidas ("Café", "Barão", "HL Cafe",
"Adriana Café", "Patricia Café", "Joao P Cafe", etc.) — uma para cada
responsável/projeto. A do grupo "Grupo HL Café bravo" no WhatsApp é
especificamente a aba **"HL Cafe"**, não a aba genérica "Café".

### 6. Login no WhatsApp Web (só na primeira vez)

```bash
python scripts/run_whatsapp_login.py
```

Abre uma janela do Chrome de verdade — escaneie o QR code com o celular. A
sessão fica salva em `data/sessions`, então não precisa repetir isso depois.

## Uso do dia a dia

Rodar o ciclo completo (coleta + extração + gravação na planilha) pela linha de comando:

```bash
python scripts/run_pipeline.py cafe
```

Ou abrir o painel (faz a mesma coisa pelo botão "Sincronizar Agora", além de
mostrar a fila de Pendências e o histórico):

```bash
streamlit run app/main.py
```

## Adicionando um novo projeto (grupo/responsável)

Se o novo projeto usa a mesma planilha e estrutura de colunas (só muda a aba
e o grupo do WhatsApp):

```bash
python scripts/new_project.py <chave> "<Nome de Exibição>" "<Nome do Grupo no WhatsApp>" "<Nome da Aba>"
```

Exemplo:

```bash
python scripts/new_project.py barao "Barão" "Grupo Barão Promotores" "Barão"
```

Isso cria `core/config/projects/barao.yaml` a partir do modelo do Café.
Depois rode `python scripts/check_sheets_connection.py barao` pra validar
que os nomes de coluna batem (confira também `header_row`/`data_start_row`
se o título da aba nova não estiver na mesma linha). O projeto aparece
automaticamente no seletor da barra lateral do painel.

Se a planilha ou a estrutura de colunas for diferente, copie
`core/config/projects/cafe.yaml` manualmente e ajuste.

## Estrutura do projeto

```
mcx_tracker/
├── app/            # Painel Streamlit (Fase 6)
├── core/
│   ├── whatsapp/   # Sessão + coletor de mensagens/fotos (Fase 1)
│   ├── vision/      # Parser Sistema GIV + OCR + Vision AI (Fase 2)
│   ├── sheets/      # Auth, matcher de loja, cálculo de semana, escrita (Fases 0, 3, 4)
│   ├── db/          # Modelos SQLite e sessão (Fase 0)
│   ├── pipeline/    # Orquestração do ciclo completo (extraction/sync/runner)
│   └── config/      # Configuração por projeto (cafe.yaml e demais)
├── data/            # Credenciais, sessão do WhatsApp, mídia, banco (git-ignorado)
├── scripts/         # Scripts de linha de comando
└── tests/
```

## Regras de negócio já fixadas no config (`core/config/projects/cafe.yaml`)

- A linha da planilha é localizada por **REDE + MÊS/ANO** (desempate por CIDADE/MARCA).
- As colunas `TOTAL`, `% CUMPR` e `A PAGAR` são calculadas e **nunca são escritas pelo robô**.
- Se não existir linha para REDE+MÊS/ANO, o robô **não cria a linha** — vira pendência no painel.
- Nada é gravado automaticamente com confiança abaixo de `CONFIDENCE_THRESHOLD` (padrão 0.95).
- **Semanas seguem o calendário real** (segunda a domingo), não blocos fixos de 7 dias — a 1ª
  semana do mês termina no primeiro domingo, que varia mês a mês (ver `core/sheets/calendar_utils.py`).
- Mensagens do "Sistema GIV" (legenda estruturada com "Usuario:"/"Ponto de atendimento:") são
  o caminho principal de extração — não usam Vision AI, só parsing de texto.
- **Fotos de "antes" são ignoradas.** Se a legenda disser explicitamente "antes" (ou
  "pré-execução"), a foto é marcada como `ignored` e não conta como visita — só a de
  "depois" (ou uma legenda sem marcação nenhuma, pra não quebrar o que já existia antes
  dessa regra) é lançada na planilha. Ver `core/vision/photo_stage.py`.

## Múltiplos projetos

Cada projeto é um YAML em `core/config/projects/`. O painel Streamlit tem um seletor de
projeto na barra lateral, e todos os scripts de linha de comando aceitam a chave do
projeto como argumento (`python scripts/run_pipeline.py <chave>`). Veja a seção acima
sobre como criar um projeto novo.

## Avarias e alertas de vencimento (projeto Suinco) — três apps separados

Este recurso vive em **três deploys independentes no Streamlit Community Cloud**, todos a
partir deste mesmo repositório, cada um com sua própria URL e seu próprio nível de acesso.
Rodar tudo junto num só app vazaria informação (outras marcas, ou a opção de "Resolvido")
pra quem não deveria ver.

| App | Arquivo principal | Quem acessa | O que vê |
|---|---|---|---|
| Painel principal | `app/main.py` | Eduardo (uso interno) | Todas as marcas de café, sincronização com WhatsApp |
| Avarias (promotores) | `suinco_app/Avarias.py` | Os 10 promotores da Suinco | Só o formulário de cadastro — nada de vencimentos, nada de outras marcas |
| Vencimentos (gestão) | `suinco_admin_app/Vencimentos.py` | Eduardo + gerente da marca | Ver abaixo — dois níveis na mesma URL |

### 📦 Avarias — `suinco_app/Avarias.py`
Tela única: o promotor se identifica (PIN, ver abaixo) e registra um produto avariado ou
perto do vencimento (loja, produto, motivo, validade, quantidade, fotos). Sem lista de
itens, sem opção de "Resolvido" — isso é gestão, fica só no app de Vencimentos.

**Login por PIN**: se `st.secrets["promoter_pins"]` estiver configurado (uma tabela TOML
`"Nome do promotor" = "PIN"`), o app pede identificação antes do formulário e usa o nome
autenticado — o promotor não digita mais o próprio nome. Sem esse secret configurado, cai
de volta no campo de nome livre (não quebra em ambiente local sem secrets).

### ⏰ Vencimentos — `suinco_admin_app/Vencimentos.py`
Mesma URL, dois níveis de acesso via query string:
- **Sem `?chave=...`** (ou com a chave errada): visão do **gerente** — só leitura, lista o
  que está vencendo em até 10 dias (`DEFAULT_WARNING_DAYS` em `core/pipeline/expiry.py`) e
  uma **mensagem curta pronta pra copiar e colar no WhatsApp** — de propósito mais resumida
  que a lista inteira, pra não confundir quem só quer saber "o que vence". É esse link (sem
  chave) que se manda pro gerente.
- **Com `?chave=<valor de st.secrets["ADMIN_KEY"]>`**: soma a seção "Gestão (uso interno)" —
  todos os itens ativos com botão "Marcar como resolvido", e uma aba de **Histórico** com
  tudo que já foi resolvido (data/hora, quem resolveu). É esse link (com a chave) que só
  Eduardo usa.

Não tem robô nem agendador: as duas visões são consultas refeitas a cada carregamento da
página.

### Segredos necessários (Streamlit Cloud → app → Settings → Secrets)
- **Todos os três apps**: `DATABASE_URL` (mesmo banco Postgres/Supabase para os três).
- **`suinco_app`**: opcionalmente `[promoter_pins]` (login dos promotores).
- **`suinco_admin_app`**: `ADMIN_KEY` (string qualquer, é o valor usado em `?chave=...`).

Localmente, cada app lê `.streamlit/secrets.toml` de dentro da própria pasta
(`suinco_app/.streamlit/secrets.toml`, `suinco_admin_app/.streamlit/secrets.toml`) — esses
arquivos são git-ignorados (`**/secrets.toml`), nunca vão pro repositório.

Chave do projeto fixa em `AVARIA_PROJECT_KEY`/`AVARIA_PROJECT_LABEL`
(`core/pipeline/expiry.py`) — não é um YAML como os projetos de visita.

### Toolbar do Streamlit escondida
`.streamlit/config.toml` tem `client.toolbarMode = "minimal"` — sem isso, qualquer visitante
de qualquer um dos três apps consegue abrir o ícone do GitHub na barra superior e ver o
código-fonte completo do repositório (inclusive as outras marcas). Com "minimal", esses
ícones somem.

Rodar localmente: `streamlit run suinco_app/Avarias.py` ou
`streamlit run suinco_admin_app/Vencimentos.py`.

## Status

Fases 0 a 4, 6 e 9 concluídas e validadas com dados reais (WhatsApp real, planilha real).
Pendente: robustez adicional (Fase 7) e configurar de fato outros projetos além do Café.
