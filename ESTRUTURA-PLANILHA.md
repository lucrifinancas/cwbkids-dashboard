# Planilha "CWB Kids - Métricas" — estrutura das abas

Crie uma planilha Google Sheets chamada **CWB Kids - Métricas**, compartilhe com o e-mail que está em `SHEETS_SERVICE_ACCOUNT_EMAIL` (papel: Editor) e cole o ID dela (a parte da URL entre `/d/` e `/edit`) em `SHEETS_ID_CWBKIDS_METRICAS` no `.env`.

Crie 8 abas com exatamente estes nomes e cabeçalhos na linha 1 (os scripts de sync e a API da dashboard dependem desses nomes).

> Assumi que as campanhas otimizam para **compras/vendas** (loja Nuvemshop), não para leads — diferente do modelo da Lucri. Se alguma campanha for de geração de lead, me avise para eu ajustar as colunas.

## META ADS - CAMPANHAS
`ID | Data | Campanha | Objetivo | Impressões | Cliques | Page Views | Compras | Receita | CTR | Tx. Compra/Clique | CPC | CPM | CPA | ROAS | Investimento`

## META ADS - CONJUNTOS DE ANÚNCIO
`ID | Data | Campanha | Conjunto | Público | Impressões | Alcance | Cliques | Page Views | Compras | Receita | CTR | Frequência | Tx. Compra/Clique | CPC | CPM | CPA | ROAS | Investimento`

## META ADS - ANÚNCIOS
`ID | Data | Campanha | Conjunto | Anúncio | Impressões | Alcance | Cliques | Plays de Vídeo | Compras | Receita | CTR | Hook Rate | CPC | CPM | CPA | ROAS | Investimento`

## GOOGLE ADS - CAMPANHAS
`ID | Data | Campanha | Tipo de Campanha | Impressões | Cliques | Compras | Receita | CTR | CPC | CPA | ROAS | Investimento`

## GOOGLE ADS - GRUPOS DE ANÚNCIOS
`ID | Data | Campanha | Grupo de Anúncios | Impressões | Cliques | Compras | Receita | CTR | CPC | CPA | ROAS | Investimento`

## GOOGLE ADS - ANÚNCIOS
`ID | Data | Campanha | Grupo de Anúncios | Anúncio | Impressões | Cliques | Compras | Receita | CTR | CPC | CPA | ROAS | Investimento`

## NUVEMSHOP
`Data | Pedidos Totais Loja | Receita Total Loja | Sessões`

- `Pedidos Totais Loja` e `Receita Total Loja`: preenchidos automaticamente pelo script `cwbkids_nuvemshop_sheet_sync.py` (todos os pedidos pagos da loja Nuvemshop naquele dia, vindos de qualquer canal).
- `Sessões`: **preenchimento manual seu** (a API da Nuvemshop não expõe sessões/visitas — só dá para ver no painel administrativo). Preencha quando quiser ver a Taxa de Conversão do orgânico na dashboard.
- A dashboard calcula "Orgânico" = Total da Loja menos o que já está somado em META ADS - CAMPANHAS e GOOGLE ADS - CAMPANHAS naquele mesmo dia. Não é uma atribuição por UTM, é resíduo (loja total − pago rastreado).

## MARKETPLACE (preenchimento manual seu)
`Data | Marketplace | Pedidos | Receita | Ticket Médio | Observações`

Exemplo de linha: `15/06/2026 | Mercado Livre | 12 | 1850,00 | 154,17 | `

## INSIGHTS (preenchimento manual seu)
`Período | Tipo | Categoria | Título | Texto`

- `Período`: para semanal use `AAAA-MM-DD a AAAA-MM-DD` (ex: `2026-06-16 a 2026-06-22`); para mensal use `AAAA-MM` (ex: `2026-06`).
- `Tipo`: `semanal` ou `mensal`.
- `Categoria`: `success`, `warning` ou `danger` (define a cor do card na dashboard).

Exemplo de linha: `2026-06-16 a 2026-06-22 | semanal | success | CPA em queda | O CPA médio caiu 18% essa semana puxado pela campanha X.`

## Formatação de células
- Coluna `Data`: formato de data.
- Colunas `CTR`, `Tx. Compra/Clique`, `Hook Rate`: formato de porcentagem.
- Colunas `CPC`, `CPM`, `CPA`, `Receita`, `Investimento`, `Ticket Médio`: formato de moeda (R$).
- `ROAS`: número simples (ex: `4.20`), sem formatação especial.

Os scripts de sync (`scripts/cwbkids_meta_sheet_sync.py` e `scripts/cwbkids_google_ads_sheet_sync.py`) aplicam essa formatação automaticamente nas linhas que eles inserem — você só precisa formatar manualmente as linhas que digitar à mão em MARKETPLACE/INSIGHTS, se quiser.
