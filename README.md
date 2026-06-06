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

## Gerar instalador para outro PC

O instalador ja leva o app e as dependencias empacotadas. No PC do cliente nao precisa rodar `npm install`.

**Windows:**
```bash
npm install
npm run dist:win
```

**Linux:**
```bash
npm install
npm run dist:linux
```

Arquivos gerados:
- Windows: `release\Easy Print Mate Setup.exe` e `release\Easy Print Mate Portable.exe`
- Linux: `release\Easy-Print-Mate-1.7.11.AppImage` e `release\easy-print-mate_1.7.11_amd64.deb`

Use `Easy Print Mate Setup.exe` para instalar no Windows. No Linux, o AppImage pode ser executado diretamente ou instalado via .deb. O app cria automaticamente esta pasta no primeiro uso:

```txt
...\Documentos\Easy Print Mate
```

Dentro dela ficam `.env`, `.env.example`, `dados.json`, `prn` e `historico`. O `.env` fica fora do instalador e deve ser preenchido em cada cliente, porque URL, usuario, senha, token e loja podem mudar.

Exemplo do `.env` local:

```txt
ERP_API_URL_NEWSHOP=
ERP_API_USERNAME_NEWSHOP=
ERP_API_PASSWORD_NEWSHOP=
ERP_API_TOKEN_NEWSHOP=
ERP_API_LOJA_ID_NEWSHOP=
```

O historico de impressoes fica separado por data:

```txt
...\Documentos\Easy Print Mate\historico\2026\01\31\impressoes.csv
```

Formato do arquivo:

```txt
Codigo;descrição;preço;quantidade;Nome_usuario
```

O usuario fica como `padao`.
