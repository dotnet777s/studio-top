# Banco do estoque na nuvem

O app do Setor de Conteúdo (rodando na máquina da empresa) é a **fonte da verdade** do estoque: cadastro, status, unidade, portais e
fotos são editados nele e espelhados neste banco **a cada minuto** (só o que mudou). Os outros apps (consulta de estoque, formulário,
integrador de portais) **só leem** daqui.

> Não grave direto nestas tabelas: a próxima sincronização sobrescreve. Alterações entram pelo app.

## Conexão

Postgres (Neon ou Supabase). A mesma URL que está em `ESTOQUE_DATABASE_URL` no `.env` da máquina da empresa. Para o app de consulta,
o ideal é criar um usuário só de leitura:

```sql
CREATE ROLE consulta_estoque LOGIN PASSWORD '***';
GRANT SELECT ON veiculo, veiculo_foto, veiculo_foto_arquivo, vw_estoque, estoque_meta TO consulta_estoque;
```

## Tabelas

**veiculo**: um carro por linha (inclui os vendidos, como histórico).

| coluna | tipo | |
|---|---|---|
| id | text | id do carro no app (ex.: `p0d2c6136`) |
| placa | text | sem traço, maiúscula (`SNR9E67`) |
| marca, modelo, versao | text | `CHEVROLET`, `TRACKER`, `TURBO LT AUT` |
| ano | int | ano modelo |
| km | int | pode ser nulo (cadastro incompleto) |
| preco, fipe | numeric | em reais; nulo = sem preço |
| cor, cambio, combustivel, motor | text | |
| opcionais | jsonb | lista de textos |
| itens_serie | jsonb | itens de série da versão (pesquisados) |
| procedencia, observacoes | text | |
| status | text | `disponivel`, `preparacao`, `reservado`, `vendido` |
| unidade | text | `Recife`, `Olinda` ou vazio |
| data_entrada, data_venda | date | |
| portais | jsonb | `{"olx": {"postado": true, "link": "…"}, …}` |
| topcrm_id | int | id antigo no TopCRM |
| total_fotos | int | |
| capa_url | text | link da capa (só com fotos em S3) |
| atualizado_em | timestamptz | |

**veiculo_foto**: `id, veiculo_id, ordem (1 = capa), capa, largura, altura, bytes, sha256, url, url_miniatura`.
Fotos na versão de portal: até 1920 px, JPEG, orientação corrigida, sem GPS. Miniatura de 480 px.

**veiculo_foto_arquivo**: `foto_id, jpeg (bytea), miniatura (bytea)`. É usada quando as fotos ficam dentro do banco (o padrão).
Se o `.env` tiver `FOTOS_S3_*`, as fotos vão para o storage e o link público fica em `veiculo_foto.url`.

Fotos de carros vendidos há mais de 30 dias saem da nuvem (`ESTOQUE_FOTOS_VENDIDOS_DIAS`) para economizar espaço.

**vw_estoque**: o carro com as fotos já agrupadas em JSON (`fotos: [{id, ordem, capa, url, miniatura, largura, altura}]`).

**estoque_meta**: `ultima_sincronizacao` (quando, quantos carros, onde estão as fotos).

## Consultas prontas

```sql
-- estoque à venda, mais novos primeiro
SELECT id, placa, marca, modelo, versao, ano, km, preco, cor, unidade, status, total_fotos, fotos
FROM vw_estoque WHERE status IN ('disponivel', 'reservado') ORDER BY data_entrada DESC;

-- por placa
SELECT * FROM vw_estoque WHERE placa = upper(replace('SNR-9E67', '-', ''));

-- capa de cada carro em loja (fotos dentro do banco)
SELECT v.id, a.miniatura FROM veiculo v
JOIN veiculo_foto f ON f.veiculo_id = v.id AND f.capa
JOIN veiculo_foto_arquivo a ON a.foto_id = f.id
WHERE v.status = 'disponivel';
```

Servindo a foto num app web (exemplo em Python/Flask):

```python
@app.get("/foto/<fid>")
def foto(fid):
    row = con.execute("SELECT jpeg FROM veiculo_foto_arquivo WHERE foto_id = %s", (fid,)).fetchone()
    return (bytes(row[0]), 200, {"Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000"}) if row else ("", 404)
```

As fotos não mudam depois de enviadas. Uma foto nova ganha um `id` novo, então dá para guardar em cache para sempre.
