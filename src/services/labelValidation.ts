import { LabelTemplate } from "@/types/label";

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

export function computeHorizontalSpacing(t: LabelTemplate): number {
  const cols = Math.max(1, t.columns || 1);
  if (cols <= 1) return 0;
  const margins = (t.marginLeftMm ?? 0) + (t.marginRightMm ?? 0);
  const paper = t.paperWidthMm ?? cols * t.widthMm + margins;
  return (paper - margins - cols * t.widthMm) / (cols - 1);
}

export function validateTemplate(t: LabelTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cols = Math.max(1, t.columns || 1);
  const paper = t.paperWidthMm ?? 0;

  if (paper <= 0) issues.push({ level: "error", message: "Largura total do papel deve ser maior que zero." });
  if (t.heightMm <= 0) issues.push({ level: "error", message: "Altura da etiqueta deve ser maior que zero." });
  if (cols < 1) issues.push({ level: "error", message: "É preciso ter ao menos 1 coluna." });

  const totalLabelWidth = cols * t.widthMm + (t.marginLeftMm ?? 0) + (t.marginRightMm ?? 0);
  if (paper > 0 && totalLabelWidth > paper + 0.01) {
    issues.push({ level: "error", message: "A etiqueta está maior que o papel." });
  }

  if (cols > 1 && computeHorizontalSpacing(t) < -0.01) {
    issues.push({ level: "error", message: "O espaço entre colunas ficou negativo." });
  }

  const safeL = t.safePaddingLeftMm ?? 0;
  const safeR = t.safePaddingRightMm ?? 0;
  const safeT = t.safePaddingTopMm ?? 0;
  const safeB = t.safePaddingBottomMm ?? 0;

  for (const f of t.fields) {
    if (!f.visible) continue;
    const w = f.widthMm ?? 0;
    const h = f.heightMm ?? 0;
    if (f.x < 0 || f.y < 0 || f.x + w > t.widthMm + 0.01 || f.y + h > t.heightMm + 0.01) {
      issues.push({ level: "error", message: `Campo "${f.key}" sai da etiqueta.` });
      continue;
    }
    const outOfSafe =
      f.x < safeL - 0.01 ||
      f.y < safeT - 0.01 ||
      f.x + w > t.widthMm - safeR + 0.01 ||
      f.y + h > t.heightMm - safeB + 0.01;
    if (outOfSafe) {
      issues.push({
        level: "warning",
        message:
          f.key === "barcode"
            ? "Código de barras pode sair cortado."
            : `Campo "${f.key}" pode sair cortado na impressão.`,
      });
    }
  }

  return issues;
}
