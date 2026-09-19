function numberValue(value) {
  if (value == null || String(value).trim() === "") return 0;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateSavedCatchConsumerAllocation(unitType, variants = []) {
  return variants.reduce((sum, variant) => {
    const units = Math.max(0, Math.floor(numberValue(variant?.availableUnits)));
    if (unitType === "piece") {
      return { ...sum, pieces: sum.pieces + units };
    }
    if (unitType === "whole_fish") {
      return {
        minimum: sum.minimum + numberValue(variant?.minWeightKg) * units,
        maximum: sum.maximum + numberValue(variant?.maxWeightKg) * units,
        pieces: sum.pieces,
      };
    }
    const kilos = numberValue(variant?.packageSizeKg) * units;
    return { minimum: sum.minimum + kilos, maximum: sum.maximum + kilos, pieces: sum.pieces };
  }, { minimum: 0, maximum: 0, pieces: 0 });
}

export function getSavedCatchUnallocatedKilos(catchKilos, allocation) {
  return Math.max(0, numberValue(catchKilos) - Number(allocation?.maximum ?? allocation?.minimum ?? 0));
}
