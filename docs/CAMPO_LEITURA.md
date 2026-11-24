# Ligar a leitura do MCX Campo no Assistente

O Assistente do MCX Operações já consulta demandas, comercial e contratos. Para
ele ver também o campo (visitas, lojas sem visita, rupturas, avarias,
validades, ocorrências e promotores sem sinal), o Operações precisa ler o banco
do Campo com um usuário **somente leitura**. São 3 passos, todos seus.

## 1. Criar o usuário no banco do Campo (depois das 21h)

1. Abra o Supabase do **MCX Campo** (não o do Operações) › **SQL Editor** › New query.
2. Cole o conteúdo de `CAMPO_LEITURA.sql`.
3. Troque `TROQUE_ESTA_SENHA` por uma senha forte (só letras e números, 24+ caracteres). Guarde-a só para o passo 2.
4. Clique em **Run**. Deve aparecer "Success. No rows returned".

Isso não altera tabela nem dado, não reinicia o Campo e não muda o app dos promotores.
Para desfazer, há um bloco "DESFAZER" no fim do arquivo.

## 2. Montar o endereço de conexão

No Supabase do Campo › **Connect** › copie a "Session pooler" (porta 5432). Ela tem este formato:

```
postgresql://postgres.REF:[YOUR-PASSWORD]@aws-X-sa-east-1.pooler.supabase.com:5432/postgres
```

Troque:
- `postgres.REF` por `mcx_leitura.REF` (mantenha o REF do projeto);
- `[YOUR-PASSWORD]` pela senha do passo 1.

## 3. Colocar no Render do Operações

Render › serviço **mcx-operacoes** (não o mcx-campo) › Environment › Add:

- Nome: `CAMPO_READONLY_DATABASE_URL`
- Valor: o endereço do passo 2

Salve. O Operações reinicia sozinho em 2–3 minutos. O mcx-campo não é tocado.

## Como conferir

No Assistente, pergunte: "Quantas lojas ficaram sem visita hoje por agência?".
Se responder com números por agência, está ligado. Se disser que a leitura do
Campo não está ligada, a variável não foi salva ou o endereço está errado.

## Segurança

- O usuário `mcx_leitura` só tem SELECT nas colunas listadas no SQL (nada de
  senha, telefone, e-mail, custos, fotos ou coordenadas).
- Além disso, o Operações abre toda consulta em transação READ ONLY com limite
  de 8 segundos e só usa consultas fixas (o modelo escolhe filtros, não SQL).
- Os dados consultados vão para a API da Anthropic só como resposta da pergunta
  feita; não ficam gravados no banco do Operações.
