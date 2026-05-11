export function requestPrintUserName(): string {
  try {
    if (typeof window.prompt !== "function") return "padrao";
    const value = window.prompt("Nome do usuario para registrar a impressao:", "padrao");
    if (value === null) return "padrao";
    return value.trim() || "padrao";
  } catch {
    return "padrao";
  }
}
