import { Product } from "@/types/label";

export const dbService = {
  async searchProducts(query: string): Promise<Product[]> {
    if (!window.easyPrint?.isDesktop) return [];
    try {
      return await window.easyPrint.dbSearchProducts(query);
    } catch (error) {
      console.error("Erro ao buscar no banco local:", error);
      return [];
    }
  },

  async syncProducts(products: Product[]): Promise<{ success: boolean; count: number }> {
    if (!window.easyPrint?.isDesktop) return { success: false, count: 0 };
    try {
      return await window.easyPrint.dbSyncProducts(products);
    } catch (error) {
      console.error("Erro ao sincronizar produtos:", error);
      return { success: false, count: 0 };
    }
  },

  async getLastSync(chave: string): Promise<string | null> {
    if (!window.easyPrint?.isDesktop) return null;
    return await window.easyPrint.dbGetLastSync(chave);
  },

  async setLastSync(chave: string, valor: string): Promise<boolean> {
    if (!window.easyPrint?.isDesktop) return false;
    return await window.easyPrint.dbSetLastSync(chave, valor);
  }
};
