## Plano de melhoria — Easy Print Mate (Elgin L42PRO FULL)

Refatoração geral focada em impressão térmica RAW EPL com 3 colunas, sem `window.print` e sem PDF. Mantém Lovable Cloud fora — toda comunicação de impressão segue via servidor local `http://127.0.0.1:8787/print-raw`.

### 1. Tipos e Preset (`src/types/label.ts`)

Acrescentar campos no `LabelTemplate`:
- `paperWidthMm`, `safePaddingLeft/Right/Top/Bottom`, `descriptionMode` (`first-word` | `first-two-words` | `internal-code` | `full` | `custom`), `customText`, `barcodeNarrow`, `barcodeWideRatio`.

Criar preset padrão **"Elgin L42PRO 3 colunas 28x14"** em `src/services/presets.ts`:
- papel 100mm, etiqueta 28×14mm, 3 colunas, margens 0, área segura 2/2/1/1, texto = primeira palavra, barcode abaixo.

### 2. Gerador EPL (`src/services/eplService.ts`)

Reescrever para refletir as regras pedidas:
- `q = paperWidthDots`, `Q = heightDots,gap`.
- Desenhar `min(quantidade, colunas)` etiquetas na mesma linha calculando offset por `larguraEtiqueta + espacoHorizontal`.
- `P = ceil(quantidade / colunas)` (carreiras, não colunas).
- Aplicar `descriptionMode` no valor de `descricao`.
- Validar barcode: se largura calculada (`narrow * (11*len + 35)`) ultrapassar área segura, reduzir `narrow` automaticamente.
- Função `buildCalibrationPrn(template)` com linhas nas bordas + marca no início de cada coluna.
- Função `buildTestPrn(template)` com produto fictício.

### 3. Validação (`src/services/labelValidation.ts` novo)

`validateTemplate(template)` retorna lista de erros/avisos:
- papel/altura/colunas inválidos, etiqueta×colunas > papel, espaço horizontal negativo, campo fora da etiqueta, barcode fora da área segura.
- Helper `computeHorizontalSpacing(template)`.

### 4. Status do servidor (`src/services/printService.ts`)

- Adicionar `pingServer()` que faz `GET /health` (com fallback `OPTIONS /print-raw`) com timeout 1500ms.
- Hook `usePrintServerStatus()` em `src/hooks/usePrintServerStatus.ts`: estado `online | offline | checking`, ping a cada 10s.
- `printRawPrn` continua, mas mensagens de erro mais claras.

### 5. Tela principal (`src/pages/Index.tsx` + novo `src/components/PrintConsole.tsx`)

Layout em grid:
- Topo: barra com status API ERP, status servidor impressão, modelo ativo, impressora ativa, última impressão.
- Esquerda: campo grande de bipagem (autofocus + bipagem rápida), card do produto, histórico.
- Direita: seletor de modelo, quantidade com botões `-1 / +1 / 3 / 6 / 9`, preview com abas "Etiqueta" / "Folha", botão grande **Imprimir etiquetas**, secundários **Baixar PRN**, **Testar impressão**, **Reimprimir último**, **Modo calibração**.
- Estados visuais via badge: aguardando / buscando / encontrado / erro / offline / enviado / falha.
- Botão imprimir desabilitado conforme regras (sem produto, servidor offline, alerta de corte, qtd inválida).

### 6. Editor (`src/components/LabelEditor.tsx`)

Reorganizar em blocos:
1. **Papel / Rolo** — largura papel, altura etiqueta, colunas, largura etiqueta, margens; mostra cálculo `espacoHorizontal` em destaque.
2. **Área Segura** — 4 paddings; alerta visual se algum campo ultrapassar.
3. **Campos** — lista compacta com toggles + propriedades; combobox `descriptionMode` para descrição.
4. **Código de barras** — tipo, narrow, wide ratio, altura, mostrar números, validação de cabimento; sugere narrow menor para etiqueta pequena.

Ações de modelo: **Salvar como novo**, **Duplicar**, **Restaurar preset Elgin padrão**.

### 7. Preview (`src/components/LabelPreview.tsx` + novo `src/components/SheetPreview.tsx`)

- Aba "Etiqueta": etiqueta única com borda, retângulo da área segura tracejado, alerta vermelho em campo fora.
- Aba "Folha": papel inteiro com 3 colunas, margens, espaços, várias carreiras conforme quantidade, linha de corte/avanço, réguas horizontal/vertical em mm, controles de zoom (50–300%) + reset/centralizar.

### 8. Histórico (`src/services/storage.ts` + tela existente)

Estender `PrintEvent` com `status: "success" | "error"` e `modelo`. Continuar mostrando em `Metrics` + bloco compacto na tela principal (últimas 5).

### 9. Design

- Manter tokens HSL atuais; ajustar `index.css` se faltar token de status (success/warning/danger).
- Sem hero/marketing; cards compactos, ícones `lucide-react`, badges de status, foco operacional.

### Arquivos novos
- `src/services/presets.ts`
- `src/services/labelValidation.ts`
- `src/hooks/usePrintServerStatus.ts`
- `src/components/PrintConsole.tsx`
- `src/components/SheetPreview.tsx`

### Arquivos editados
- `src/types/label.ts`
- `src/services/eplService.ts`
- `src/services/printService.ts`
- `src/services/storage.ts`
- `src/components/LabelEditor.tsx`
- `src/components/LabelPreview.tsx`
- `src/pages/Index.tsx`
- `src/index.css` (tokens de status se faltarem)
- `scripts/print-server.cjs` (adicionar `GET /health` se não existir)

### Fora de escopo
- PDF, `window.print`, diálogo de impressão do navegador.
- Mudanças no backend ERP além do que já existe em `src/api/varejoFacil.ts`.
