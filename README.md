# Easy Print Mate

App desktop web para bipar codigo de barras, consultar produto no ERP Varejo Facil e imprimir etiqueta termica.

## API Varejo Facil

O frontend chama o proxy interno:

```txt
/api/varejo-facil?codigo=789...&empresa=NEWSHOP&loja=2
```

O proxy consulta apenas leitura:

- codigo auxiliar EAN
- produto
- precos
- estoque

## Variaveis na Vercel

Configure pelo painel da Vercel:

```txt
ERP_API_URL_NEWSHOP=https://newshop.varejofacil.com
ERP_API_USERNAME_NEWSHOP=
ERP_API_PASSWORD_NEWSHOP=
ERP_API_TOKEN_NEWSHOP=
ERP_API_LOJA_ID_NEWSHOP=2
```

Se usar `ERP_API_TOKEN_*`, usuario/senha nao sao obrigatorios. Para SOYE/FACIL, use os sufixos `_SOYE` e `_FACIL`.

## Rodar local

```bash
npm install
npm run dev
```

Para testar as functions da Vercel localmente, use `vercel dev`.
