# Easy Print Mate - Memória Técnica e Progresso

Este arquivo registra as decisões arquiteturais e o progresso das correções feitas na impressora Elgin L42 Pro Full.

## Estado Atual: Versão 1.7.8

### 1. Zoom Dinâmico (v1.7.8)
- **A4 Preview & Editor Zoom:** Implementado sistema de zoom (40% a 300%) para o módulo A4. Agora é possível ampliar a visualização da folha e o editor para ajustes milimétricos em etiquetas densas (ex: Pimaco 60).

### 2. Flexibilidade de Validação (v1.7.7)
- **Relaxed Validation:** Downgrade de erros de "campo fora da área" para avisos. Agora o botão de imprimir permanece habilitado mesmo se o software detectar campos fora dos limites nominais, permitindo que o usuário decida se deseja prosseguir com a impressão.

### 2. Novo Módulo A4 / Cartazes (v1.7.0 - v1.7.5)
- **Grades Flexíveis:** Suporte total a etiquetas em folha (Pimaco) com configuração de linhas, colunas, gaps e margens.
- **Impressão em Lote:** Fila de impressão para bipar vários produtos e gerar PDFs multi-páginas automaticamente.
- **Fotos do ERP:** Possibilidade de incluir a foto cadastrada no Varejo Fácil diretamente nos cartazes A4.
- **Fontes Premium:** Adicionadas fontes Anton (Poster), Roboto, Open Sans e Bebas Neue para layouts de oferta profissionais.

### 2. Estabilidade e Usabilidade (v1.7.6)
- **Fix Direct Print:** Refatorada a impressão direta para usar processamento linha a linha (mais estável em Elgin antigas).
- **Régua de Precisão:** Adicionada régua em MM no Editor de Etiquetas para alinhamento técnico perfeito.

### 3. Correções de Estabilidade e Alinhamento (v1.6.1)
- **Fix Label Drift:** Corrigido erro de cálculo no comando `Q` (EPL2) que somava margens à altura física da etiqueta, causando deslocamento progressivo.
- **Printing Stability:** Removidos comandos `JF` (Top of Form Backup) e `WN` que causavam comportamento errático (movimento de vai-e-vem) em impressoras Elgin.
- **Preset Update:** Atualizado preset Elgin L42PRO para usar pitch de 15mm (13.5mm etiqueta + 1.5mm gap) como padrão estável.

### 2. Correções de Impressão (EPL2) - v1.4.0
- **Suporte DPI:** O app agora suporta 203 DPI (8 dots/mm) e 300 DPI (11.81 dots/mm), configuráveis no Editor.
- **Centralização:** Implementada lógica manual de centralização (`getAdjustedX`). O comando `A` do EPL2 é ajustado com base na largura estimada das fontes internas (Fontes 1-5).
- **Rotação 180°:** Migrado de rotação manual por elemento para o comando nativo `ZB` (Print from Bottom), garantindo alinhamento perfeito sem espelhamento.
- **Barcode Sizing:** O comando `B` agora usa 'N' (sem texto interno) para evitar fontes gigantes da Elgin. O texto legível (EAN) é impresso manualmente via comando `A` logo abaixo das barras.
- **Altura de Barcode:** Ajustada para o "budget" de 15mm, subtraindo o espaço do texto manual para evitar que a impressora empurre o conteúdo para fora da etiqueta.

### 2. Sincronização e UI
- **Auto-Refresh:** A página `Index.tsx` agora recarrega os templates do storage sempre que o usuário volta do Editor, garantindo que o preview de "Bipar" esteja sempre atualizado.
- **Painel de Ajustes:** Adicionado seção "Ajustes de Impressão" no editor com controles de DPI, Rotação e Ordem de Colunas (RTL).

### 3. Novas Funcionalidades
- **Importação CSV/TXT:** Adicionado botão de importação no formato `codigo;quantidade`. Os itens são buscados na API e adicionados automaticamente à fila de impressão para economia de papel.

### 4. Presets Homologados
- **Elgin Branca (28x13.5mm/15mm):** Configurada com recuo de 3mm, margens RTL e rotação 180° conforme homologação do usuário (arquivo `etiqueta boa.json`).
- **Anel e Amarela:** Atualizadas para seguir o novo padrão de centralização e escala.

### 5. Correções de UI e Sincronização (v1.5.5)
- **Fix Tela Branca:** Corrigido erro de `ReferenceError: useRef is not defined` na tela de Configuração API.
- **Sincronização Paginada:** Corrigido o bridge do Electron (`preload.cjs`) para suportar o parâmetro `dataAlteracao` (lastSync), permitindo sincronizações incrementais reais.
- **Tipagem:** Atualizado `window.d.ts` e `Product` para refletir as novas capacidades de sincronização e limpar erros de build.
- **Limpeza:** Removido arquivo de tipagem duplicado e desatualizado `desktop.d.ts`.

### 6. Descoberta Automática de Produtos (v1.6.0)
- **Sequential Probing:** Implementado hook `useProductDiscovery` que monitora o maior ID numérico no banco local e tenta buscar o próximo ID (`maxId + 1`) no ERP a cada 30 minutos.
- **Background Sync:** Novos produtos encontrados via sequência são salvos automaticamente no banco local, permitindo que fiquem disponíveis para busca instantânea por descrição ou código.

## Comandos Úteis
- **Desenvolvimento:** `npm run dev`
- **Build Setup:** `npm run dist:setup` (Gera v1.4.x em `release/`)

## Diretrizes para Futuros Agentes
- Sempre passar o objeto `template` para as funções `mmToDots` e `getDotsPerMm` para respeitar a configuração de DPI do usuário.
- Ao modificar o layout do preset Elgin, clicar em "Restaurar Elgin" (🔄) no App para validar as novas coordenadas hardcoded em `presets.ts`.
