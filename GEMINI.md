# Easy Print Mate - Memória Técnica e Progresso

Este arquivo registra as decisões arquiteturais e o progresso das correções feitas na impressora Elgin L42 Pro Full.

## Estado Atual: Versão 1.4.0

### 1. Correções de Impressão (EPL2)
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

## Comandos Úteis
- **Desenvolvimento:** `npm run dev`
- **Build Setup:** `npm run dist:setup` (Gera v1.4.x em `release/`)

## Diretrizes para Futuros Agentes
- Sempre passar o objeto `template` para as funções `mmToDots` e `getDotsPerMm` para respeitar a configuração de DPI do usuário.
- Ao modificar o layout do preset Elgin, clicar em "Restaurar Elgin" (🔄) no App para validar as novas coordenadas hardcoded em `presets.ts`.
