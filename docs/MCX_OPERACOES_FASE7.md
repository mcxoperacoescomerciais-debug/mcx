# MCX Operações — Fase 7 (Assistente MCX, piloto) — 23/11/2026

Branch feat/mcx-operacoes. Nenhum arquivo de agencia/ alterado.

## O que foi entregue

**Tela Assistente** (menu "Assistente"):
- Conversas à esquerda (nova, renomear, arquivar, ver arquivadas). Cada pessoa vê só as próprias conversas.
- Resposta em streaming. Aceita texto, até 3 fotos (JPG, PNG, WEBP) ou PDF de até 8 MB cada. O arquivo vai para a API só naquela mensagem; o banco guarda só nome, tipo e tamanho.
- **Prompts MCX**: extrair pedido de foto, mensagem para promotor, relatório para a marca, fórmula de planilha, cobrança educada e resumir conversa. Um toque preenche a caixa.
- Sugestões do "O que posso pedir?" vêm do registro de capacidades, filtradas pelo perfil.
- **Transformar em demanda** em cada resposta: abre o "+ Demanda" já preenchido (título e descrição). Também há "Copiar".
- Aviso fixo para não colar CPF ou dados pessoais de promotores sem necessidade.
- O Assistente não lê nem grava dados do MCX (fora da V1, como na especificação).

**Tela Assistente: uso e ajustes** (só o dono):
- Interruptor geral (começa **desligado**) e liberação pessoa por pessoa.
- Modelo: **Claude Haiku 5.5** (padrão) ou **Claude Sonnet 5.5**, e o esforço da resposta (padrão: rápido e econômico).
- Limite mensal da empresa e por pessoa, em US$ (padrão US$ 10). **Aos 80%** do limite da empresa, o Eduardo recebe uma demanda de aviso (uma por mês). **Aos 100%**, o chat bloqueia novas mensagens até o mês virar ou o limite subir.
- Preços por milhão de tokens editáveis (tabela oficial de 11/2026: Haiku 5.5 US$ 0,10 entrada / 0,50 saída; Sonnet 5.5 US$ 2 / 10).
- Instruções do sistema editáveis (texto padrão com o contexto da MCX e as regras "não invente dado", "não peça senha" e "sugira demanda").
- Guarda das conversas: 6 meses (ajustável); as mais antigas são apagadas sozinhas.
- **Painel de uso:** custo de hoje, do mês, projeção do mês, média por mensagem, nº de mensagens e conversas, tokens do cache, por pessoa e por modelo.

## Custo e segurança

- Só a API da Anthropic, com a chave da MCX (`ANTHROPIC_API_KEY` no servidor). A chave nunca vai para o navegador. Nada de login, cookie ou token do claude.ai.
- Histórico enviado à API limitado às últimas 20 mensagens (e a ~60 mil caracteres); anexos antigos não são reenviados. As instruções do sistema vão com cache de prompt.
- Cada mensagem grava tokens e custo em `ai_usage` e fica na auditoria (sem o conteúdo).
- No Sonnet 5.5, se o filtro de segurança da API recusar, a própria API tenta de novo no modelo reserva.

## O que falta para usar

1. Criar a chave em platform.claude.com › API Keys e colocar no Render (mcx-operacoes › Environment) como `ANTHROPIC_API_KEY`. **Não testei com a API real** (sem chave); os testes usam uma API simulada.
2. Em "Assistente: uso e ajustes": ligar e liberar a Tainara.

## Migrations

`0010_fase7.sql` (tabelas `ai_conversations`, `ai_messages`, `ai_usage`) e `0011_fase7_rls.sql` (RLS ligado nas três). Aditivas.

## Testes

Operações: typecheck, lint, **120 testes** (14 novos) e build — tudo verde. Novos: custo por token, aviso aos 80% e bloqueio aos 100% (sem chamar a API), projeção do mês, histórico limitado e sem reenviar anexo, anexos aceitos e recusados, configuração com defeito volta ao padrão, só o dono configura, começa desligado, conversa privada, erro da API não cobra, aviso único ao dono, painel só do dono, retenção apaga conversas antigas.

Conferido no navegador local: tela vazia com Prompts MCX e sugestões, mensagens de "desligado" e "sem chave", ajustes salvos, "Transformar em demanda" abrindo o formulário preenchido, e sem rolagem lateral no celular.
