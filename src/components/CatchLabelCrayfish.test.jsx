import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ThermalLabel4x3 from "./ThermalLabel4x3.jsx";
import ThermalLabel4x6Portrait from "./ThermalLabel4x6Portrait.jsx";

const crayfishLabel = {
  species: "Täplärapu",
  scientificName: "Pacifastacus leniusculus",
  batchId: "RAPU-001",
  catchArea: "Suur-Saimaa",
  crayfishSize: "10+ cm",
  isCrayfish: true,
  pieceCount: "25",
  storageText: "8 °C tai viileämpi",
  supplier: "Testikalastaja",
};

describe("crayfish catch labels", () => {
  it.each([
    ["MUNBYN 4x3", ThermalLabel4x3],
    ["MUNBYN 4x6", ThermalLabel4x6Portrait],
  ])("prints crayfish size and crayfish-specific details on %s", (_name, Component) => {
    const html = renderToStaticMarkup(<Component label={crayfishLabel} />);

    expect(html).toContain("Täplärapu");
    expect(html).toContain("Pacifastacus leniusculus");
    expect(html).toContain("Ravun koko");
    expect(html).toContain("10+ cm");
    expect(html).toContain("8 °C tai viileämpi");
    expect(html).toContain("25");
    expect(html).toContain("kpl");
    expect(html).toContain("-webkit-text-size-adjust:none");
    expect(html).toContain("text-size-adjust:none");
  });
});
