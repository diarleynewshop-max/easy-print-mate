# Easy Print Mate

App local para bipar codigo de barras, consultar produto no ERP Varejo Facil e imprimir etiqueta termica na Elgin L42PRO.

Os dados locais ficam na pasta Documentos do Windows:

```txt
...\Documentos\Easy Print Mate\dados.json
```

Os PRNs enviados ficam em:

```txt
...\Documentos\Easy Print Mate\prn
```

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

## Rodar app local

```bash
npm install
npm run dev
```

Para abrir usando o build:

```bash
npm run build
npm run app
```
