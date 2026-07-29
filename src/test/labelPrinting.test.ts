import { describe, expect, it } from "vitest";
import { buildEplPrn } from "@/services/eplService";
import { ensureDefaultTemplates } from "@/services/storage";
import { anelPreset, ANEL_PRESET_ID, elginPreset } from "@/services/presets";

describe("label printing", () => {
  it("falls back to Code128 when literal code is printed with an EAN preset", () => {
    const template = {
      ...elginPreset(),
      fields: elginPreset().fields.map((field) =>
        field.key === "barcode" ? { ...field, barcodeFormat: "EAN13" as const } : field,
      ),
    };

    const prn = buildEplPrn(template, {
      ean: "COD-LIT-01",
      codigo_barras: "COD-LIT-01",
      descricao: "Produto literal",
      precoVarejo: 9.9,
    }, 1);

    expect(prn).toMatch(/B\d+,\d+,0,1,/);
    expect(prn).not.toContain(",E30,");
  });

  it("prints short numeric internal codes as Code128", () => {
    const prn = buildEplPrn(elginPreset(), {
      id: "17838",
      ean: "17838",
      codigo_barras: "17838",
      codigoInterno: "17838",
      descricao: "C895 - G BOLSA DE POLIURETANO",
      precoVarejo: 34,
    }, 1);

    expect(prn).toContain('"17838"');
    expect(prn).toMatch(/B\d+,\d+,0,1,/);
    expect(prn).not.toContain(",E30,");
  });

  it("repairs old ring label preset calibration", () => {
    const oldRingPreset = {
      ...anelPreset(),
      id: ANEL_PRESET_ID,
      widthMm: 55,
      marginLeftMm: 0,
      marginTopMm: 0,
      marginBottomMm: 0,
    };

    const fixed = ensureDefaultTemplates([elginPreset(), oldRingPreset]).find((template) => template.id === ANEL_PRESET_ID);

    expect(fixed?.widthMm).toBe(50);
    expect(fixed?.marginLeftMm).toBe(24);
    expect(fixed?.marginTopMm).toBe(4);
    expect(fixed?.printRotation).toBe(180);
  });

  it("keeps manual ring label calibration after returning to print", () => {
    const manualRingPreset = {
      ...anelPreset(),
      marginLeftMm: 0,
      fields: anelPreset().fields.map((field) =>
        field.key === "descricao" ? { ...field, x: 8 } : field,
      ),
    };

    const saved = ensureDefaultTemplates([elginPreset(), manualRingPreset]).find((template) => template.id === ANEL_PRESET_ID);

    expect(saved?.marginLeftMm).toBe(0);
    expect(saved?.fields.find((field) => field.key === "descricao")?.x).toBe(8);
  });
});
