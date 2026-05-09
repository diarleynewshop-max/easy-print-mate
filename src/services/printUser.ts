export function requestPrintUserName(): string | null {
  const value = window.prompt("Nome do usuario para registrar a impressao:", "padrao");
  if (value === null) return null;
  return value.trim() || "padrao";
}
