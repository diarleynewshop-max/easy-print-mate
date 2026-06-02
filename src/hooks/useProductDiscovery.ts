import { useEffect, useRef } from "react";
import { storage } from "@/services/storage";
import { dbService } from "@/services/dbService";
import { toast } from "sonner";

/**
 * Hook para descoberta automática de novos produtos.
 * Tenta buscar sequencialmente os IDs que ainda não existem no banco local.
 */
export function useProductDiscovery() {
  const isRunningRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const discover = async () => {
      if (isRunningRef.current) return;
      
      const config = storage.getConfig();
      if (!config.baseUrl || (!config.token && (!config.username || !config.password))) {
        return;
      }

      isRunningRef.current = true;
      console.log("[Discovery] Iniciando verificação de novos produtos...");

      try {
        // Pega o maior ID numérico do banco local
        const maxId = await dbService.getMaxId();
        const nextId = maxId + 1;

        // Tenta buscar o próximo produto
        const result = await window.easyPrint.fetchProductByEan(config, String(nextId));
        
        if (result && result.product && result.product.descricao) {
          // Produto encontrado! Salva no banco local
          await dbService.syncProducts([result.product]);
          console.log(`[Discovery] Novo produto descoberto e salvo: ID ${nextId} - ${result.product.descricao}`);
          
          // Se encontrou, tenta o próximo imediatamente na próxima iteração (recursivo via timeout curto)
          timerRef.current = setTimeout(discover, 2000);
        } else {
          console.log(`[Discovery] ID ${nextId} ainda não existe no ERP.`);
        }
      } catch (error) {
        // Erro esperado se o produto não existir (404 ou erro na API)
        console.log(`[Discovery] Fim da sequência ou erro na busca (ID seguinte provavelmente não existe ainda).`);
      } finally {
        isRunningRef.current = false;
      }
    };

    // Executa a cada 30 minutos (1800000 ms)
    const INTERVAL = 30 * 60 * 1000;
    
    // Primeira execução após 1 minuto de app aberto
    const initialTimer = setTimeout(discover, 60 * 1000);
    
    const intervalTimer = setInterval(discover, INTERVAL);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
