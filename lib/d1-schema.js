export const SCHEMA = {
  "MARKETPLACE": {
    "table": "marketplace",
    "headers": [
      "DATA",
      "MARKETPLACE",
      "PEDIDOS",
      "RECEITA"
    ],
    "fields": [
      "data",
      "marketplace",
      "pedidos",
      "receita"
    ],
    "keys": [
      "data",
      "marketplace"
    ],
    "text": [
      "marketplace"
    ],
    "percent": [],
    "generated": [],
    "gid": 420024911
  },
  "NUVEMSHOP": {
    "table": "nuvemshop",
    "headers": [
      "DATA",
      "PEDIDOS TOTAIS DA LOJA",
      "RECEITA TOTAL DA LOJA",
      "SESSÕES"
    ],
    "fields": [
      "data",
      "pedidos_totais_da_loja",
      "receita_total_da_loja",
      "sessoes"
    ],
    "keys": [
      "data"
    ],
    "text": [],
    "percent": [],
    "generated": [],
    "gid": 136218758
  },
  "META ADS - CAMPANHAS": {
    "table": "ads_meta_campanhas",
    "headers": [
      "ID",
      "DATA",
      "CAMPANHA",
      "NOME DE EXIBIÇÃO NO DASHBOARD",
      "OBJETIVO",
      "IMPRESSÕES",
      "CLIQUES",
      "PAGE VIEW",
      "ADD TO CART",
      "INITIATE CHECKOUT",
      "CTR (LINK)",
      "RECEITA",
      "ROAS",
      "CPC (LINK)",
      "CONNECT RATE",
      "TAXA DE CONVERSÃO",
      "CPC",
      "CPM",
      "CPA",
      "INVESTIMENTO",
      "COMPRAS"
    ],
    "fields": [
      "id",
      "data",
      "campanha",
      "nome_exibicao",
      "objetivo",
      "impressoes",
      "cliques",
      "page_view",
      "add_to_cart",
      "initiate_checkout",
      "ctr_pct",
      "receita",
      "roas",
      "cpc",
      "connect_rate_pct",
      "taxa_conversao_pct",
      "cpc_alternativo_16",
      "cpm",
      "cpa",
      "investimento",
      "compras"
    ],
    "keys": [
      "id",
      "data"
    ],
    "text": [
      "id",
      "campanha",
      "nome_exibicao",
      "objetivo"
    ],
    "percent": [
      "ctr_pct",
      "connect_rate_pct",
      "taxa_conversao_pct"
    ],
    "generated": [],
    "gid": 864690883
  },
  "META ADS - CONJUNTOS DE ANÚNCIO": {
    "table": "ads_meta_conjuntos",
    "headers": [
      "ID",
      "DATA",
      "CAMPANHA",
      "CONJUNTO DE ANÚNCIO",
      "NOME DE EXIBIÇÃO NO DASHBOARD",
      "NÍVEL DE PÚBLICO",
      "IMPRESSÕES",
      "ALCANCE",
      "CLIQUES NO LINK",
      "COMPRAS",
      "RECEITA",
      "ROAS",
      "CTR (LINK)",
      "FREQUÊNCIA",
      "TAXA DE CONVERSÃO",
      "CPC (LINK)",
      "CPM",
      "CPA",
      "INVESTIMENTO"
    ],
    "fields": [
      "id",
      "data",
      "campanha",
      "conjunto",
      "nome_exibicao",
      "nivel_publico",
      "impressoes",
      "alcance",
      "cliques",
      "compras",
      "receita",
      "roas",
      "ctr_pct",
      "frequencia",
      "taxa_conversao_pct",
      "cpc",
      "cpm",
      "cpa",
      "investimento"
    ],
    "keys": [
      "id",
      "data"
    ],
    "text": [
      "id",
      "campanha",
      "conjunto",
      "nome_exibicao",
      "nivel_publico"
    ],
    "percent": [
      "ctr_pct",
      "taxa_conversao_pct"
    ],
    "generated": [],
    "gid": 713243316
  },
  "META ADS - ANÚNCIOS": {
    "table": "ads_meta_anuncios",
    "headers": [
      "ID",
      "DATA",
      "CAMPANHA",
      "CONJUNTO DE ANÚNCIO",
      "ANÚNCIO",
      "NOME DE EXIBIÇÃO NO DASHBOARD",
      "IMPRESSÕES",
      "ALCANCE",
      "CLIQUES NO LINK",
      "REPRODUÇÕES DE 3 SEG",
      "COMPRAS",
      "CTR (LINK)",
      "ROAS",
      "CPC (LINK)",
      "HOOK RATE",
      "CPC",
      "CPM",
      "CPA",
      "INVESTIMENTO"
    ],
    "fields": [
      "id",
      "data",
      "campanha",
      "conjunto",
      "anuncio",
      "nome_exibicao",
      "impressoes",
      "alcance",
      "cliques",
      "reproducoes_3s",
      "compras",
      "ctr_pct",
      "roas",
      "cpc",
      "hook_rate_pct",
      "cpc_alternativo_15",
      "cpm",
      "cpa",
      "investimento"
    ],
    "keys": [
      "id",
      "data"
    ],
    "text": [
      "id",
      "campanha",
      "conjunto",
      "anuncio",
      "nome_exibicao"
    ],
    "percent": [
      "ctr_pct",
      "hook_rate_pct"
    ],
    "generated": [],
    "gid": 1150614650
  },
  "GOOGLE ADS - CAMPANHAS": {
    "table": "ads_google_campanhas",
    "headers": [
      "ID",
      "DATA",
      "CAMPANHA",
      "NOME DE EXIBIÇÃO NO DASHBOARD",
      "OBJETIVO",
      "IMPRESSÕES",
      "CLIQUES",
      "PAGE VIEW",
      "ADIÇÕES AO CARRINHO",
      "CHECKOUT INICIADO",
      "COMPRAS",
      "RECEITA",
      "ROAS",
      "CTR",
      "CONNECT RATE",
      "PARCELA DE IMPRESSÕES",
      "PARC IMP PERDIDA POR ORÇAMENTO",
      "PARC IMP PERDIDA POR CLASSIFICAÇÃO",
      "TAXA DE CONVERSÃO",
      "CPC",
      "CPM",
      "CPA",
      "INVESTIMENTO"
    ],
    "fields": [
      "id",
      "data",
      "campanha",
      "nome_exibicao",
      "objetivo",
      "impressoes",
      "cliques",
      "page_view",
      "adicoes_ao_carrinho",
      "checkout_iniciado",
      "compras",
      "receita",
      "roas",
      "ctr_pct",
      "connect_rate_pct",
      "parcela_impressoes_pct",
      "parc_perdida_orcamento_pct",
      "parc_perdida_classif_pct",
      "taxa_conversao_pct",
      "cpc",
      "cpm",
      "cpa",
      "investimento"
    ],
    "keys": [
      "id",
      "data"
    ],
    "text": [
      "id",
      "campanha",
      "nome_exibicao",
      "objetivo"
    ],
    "percent": [
      "ctr_pct",
      "connect_rate_pct",
      "parcela_impressoes_pct",
      "parc_perdida_orcamento_pct",
      "parc_perdida_classif_pct",
      "taxa_conversao_pct"
    ],
    "generated": [],
    "gid": 899444652
  },
  "GOOGLE ADS - GRUPOS DE ANÚNCIOS": {
    "table": "ads_google_grupos",
    "headers": [
      "ID",
      "DATA",
      "CAMPANHA",
      "GRUPOS DE ANÚNCIO",
      "NOME DE EXIBIÇÃO NO DASHBOARD",
      "IMPRESSÕES",
      "CLIQUES",
      "COMPRAS",
      "RECEITA",
      "CTR",
      "(nao utilizado)",
      "(nao utilizado)",
      "(nao utilizado)",
      "CPC",
      "CPM",
      "CPA",
      "INVESTIMENTO"
    ],
    "fields": [
      "id",
      "data",
      "campanha",
      "grupo",
      "nome_exibicao",
      "impressoes",
      "cliques",
      "compras",
      "receita",
      "ctr_pct",
      "nao_utilizado",
      "nao_utilizado_alternativo_11",
      "nao_utilizado_alternativo_12",
      "cpc",
      "cpm",
      "cpa",
      "investimento"
    ],
    "keys": [
      "id",
      "data"
    ],
    "text": [
      "id",
      "campanha",
      "grupo",
      "nome_exibicao"
    ],
    "percent": [
      "ctr_pct"
    ],
    "generated": [],
    "gid": 1653129930
  },
  "GOOGLE ADS - TERMOS DE BUSCA": {
    "table": "ads_google_termos",
    "headers": [
      "DATA",
      "TERMO",
      "CAMPANHA",
      "GRUPO DE ANÚNCIOS",
      "IMPRESSÕES",
      "CLIQUES",
      "CTR",
      "CPC",
      "INVESTIMENTO"
    ],
    "fields": [
      "data",
      "termo",
      "campanha",
      "grupo",
      "impressoes",
      "cliques",
      "ctr_pct",
      "cpc",
      "investimento"
    ],
    "keys": [
      "data",
      "termo",
      "campanha",
      "grupo"
    ],
    "text": [
      "termo",
      "campanha",
      "grupo"
    ],
    "percent": [
      "ctr_pct"
    ],
    "generated": [],
    "gid": 1345122365
  }
};
