import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

function isCrayfishSpecies(value: unknown) {
  const text = safeString(value).toLocaleLowerCase("fi-FI");
  return text.includes("täplärapu") ||
    text.includes("jokirapu") ||
    text.includes("pacifastacus leniusculus") ||
    text.includes("astacus astacus");
}

function parseCrayfishCount(value: unknown) {
  const match = safeString(value).match(/([0-9]+(?:[.,][0-9]+)?)\s*kpl/i);
  return match ? Number(String(match[1]).replace(",", ".")) : 0;
}

function getCatchQuantity(entry: Record<string, unknown>) {
  if (isCrayfishSpecies(entry.species)) {
    return { quantity: Number(entry.count || 0), unit: "kpl" };
  }
  return { quantity: Number(entry.kilos || 0), unit: "kg" };
}

function getBatchPublicUrl(batchId: string) {
  if (!batchId) return "";
  return `https://suoraan-kalastajalta.vercel.app/?batch=${encodeURIComponent(batchId)}`;
}

function getBatchQrImageUrl(batchId: string) {
  const publicUrl = getBatchPublicUrl(batchId);
  return publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&format=png&qzone=1&data=${encodeURIComponent(publicUrl)}&cache=${encodeURIComponent(batchId)}`
    : "";
}

function deriveSaleInfo(offers: Array<Record<string, unknown>>) {
  const statuses = offers.map((offer) => safeString(offer.status).toLowerCase()).filter(Boolean);
  const updatedAt = offers
    .map((offer) => safeString(offer.updated_at || offer.created_at))
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  let status = "Tallennettu";
  if (statuses.some((item) => item === "accepted" || item === "sold")) {
    status = "Myyty";
  } else if (statuses.some((item) => item === "reserved")) {
    status = "Varattu";
  } else if (statuses.some((item) => ["sent", "viewed", "countered"].includes(item))) {
    status = "Tarjottu";
  }

  return {
    status,
    offer_count: offers.length,
    updated_at: updatedAt || null,
  };
}

function buildCatchPayload(entry: Record<string, unknown>, offers: Array<Record<string, unknown>>) {
  const saleInfo = deriveSaleInfo(offers);
  const quantity = getCatchQuantity(entry);
  return {
    batch_id: safeString(entry.batch_id),
    status: saleInfo.status,
    species: safeString(entry.species),
    species_summary: safeString(entry.species),
    product_name: "",
    processing_method: "",
    catch_date: safeString(entry.date),
    production_date: "",
    best_before_date: "",
    area: safeString(entry.area),
    municipality: safeString(entry.municipality),
    spot: safeString(entry.spot),
    gear: safeString(entry.gear),
    quantity: quantity.quantity,
    unit: quantity.unit,
    seller_name: safeString(entry.owner_name),
    notes: safeString(entry.notes),
    created_at: safeString(entry.created_at),
    related_processing: null,
    sale_info: saleInfo,
  };
}

function buildCatchPayloadFromRows(rows: Array<Record<string, unknown>>, offers: Array<Record<string, unknown>>) {
  const saleInfo = deriveSaleInfo(offers);
  const first = rows[0] || {};
  const speciesRows = rows
    .map((row) => {
      const species = safeString(row.species);
      const rowQuantity = getCatchQuantity(row);
      const quantityText = `${rowQuantity.quantity} ${rowQuantity.unit}`;
      return [species, quantityText].filter(Boolean).join(": ");
    })
    .filter(Boolean);
  const allCrayfish = rows.every((row) => isCrayfishSpecies(row.species));
  const noCrayfish = rows.every((row) => !isCrayfishSpecies(row.species));
  const totalQuantity = allCrayfish
    ? rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
    : noCrayfish
      ? rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0)
      : "";
  const quantityUnit = allCrayfish ? "kpl" : noCrayfish ? "kg" : "";

  return {
    batch_id: safeString(first.batch_id),
    status: saleInfo.status,
    species: speciesRows.length === 1 ? safeString(first.species) : `${speciesRows.length} lajia`,
    species_summary: speciesRows.join("\n"),
    product_name: "",
    processing_method: "",
    catch_date: safeString(first.date),
    production_date: "",
    best_before_date: "",
    area: safeString(first.area),
    municipality: safeString(first.municipality),
    spot: safeString(first.spot),
    gear: safeString(first.gear),
    quantity: totalQuantity,
    unit: quantityUnit,
    seller_name: safeString(first.owner_name),
    notes: rows.map((row) => safeString(row.notes)).filter(Boolean).join("\n\n"),
    created_at: safeString(first.created_at),
    related_processing: null,
    sale_info: saleInfo,
  };
}

function buildProcessedPayload(
  entry: Record<string, unknown>,
  offers: Array<Record<string, unknown>>,
  sourceBatches: Array<Record<string, unknown>>,
) {
  const saleInfo = deriveSaleInfo(offers);
  return {
    batch_id: safeString(entry.batch_id),
    status: saleInfo.status,
    species: safeString(entry.species_summary).split("\n").filter(Boolean)[0] || safeString(entry.product_name),
    species_summary: safeString(entry.species_summary),
    product_name: safeString(entry.product_name),
    processing_method: safeString(entry.processing_method),
    catch_date: "",
    production_date: safeString(entry.production_date),
    best_before_date: safeString(entry.best_before_date),
    area: safeString(entry.area),
    municipality: safeString(entry.municipality),
    spot: safeString(entry.spot),
    gear: "",
    quantity: entry.kilos ?? "",
    unit: "kg",
    seller_name: safeString(entry.owner_name),
    notes: safeString(entry.notes),
    created_at: safeString(entry.created_at),
    related_processing: {
      product_type: safeString(entry.product_type),
      package_size_g: entry.package_size_g ?? "",
      package_count: entry.package_count ?? "",
    },
    source_batches: sourceBatches.map((source) => ({
      source_entry_id: safeString(source.source_entry_id),
      batch_id: safeString(source.source_batch_id),
      species: safeString(source.source_species),
      kilos: source.source_kilos ?? "",
      count: source.source_count ?? "",
      quantity: source.source_quantity ?? source.source_kilos ?? "",
      unit: safeString(source.source_unit) || "kg",
      catch_date: safeString(source.catch_date),
      public_url: getBatchPublicUrl(safeString(source.source_batch_id)),
      qr_image_url: getBatchQrImageUrl(safeString(source.source_batch_id)),
    })),
    sale_info: saleInfo,
  };
}

function buildOfferFallbackPayload(offer: Record<string, unknown>, offers: Array<Record<string, unknown>>) {
  const saleInfo = deriveSaleInfo(offers);
  const speciesSummary = safeString(offer.species_summary);
  const isCrayfish = isCrayfishSpecies(speciesSummary);
  return {
    batch_id: safeString(offer.batch_id),
    status: saleInfo.status,
    species: speciesSummary.split("\n").filter(Boolean)[0] || "Kalaerä",
    species_summary: speciesSummary,
    product_name: "",
    processing_method: "",
    catch_date: "",
    production_date: "",
    best_before_date: "",
    area: safeString(offer.area),
    municipality: "",
    spot: safeString(offer.spot),
    gear: safeString(offer.gear),
    quantity: isCrayfish ? parseCrayfishCount(speciesSummary) : (offer.total_kilos ?? ""),
    unit: isCrayfish ? "kpl" : "kg",
    seller_name: safeString(offer.seller_name),
    notes: safeString(offer.notes),
    created_at: safeString(offer.created_at),
    related_processing: null,
    sale_info: saleInfo,
    traceability_notice: "Erän tiedot näytetään tarjoukselta, koska alkuperäistä eräriviä ei löytynyt suoraan tietokannasta.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const batchId = safeString(new URL(req.url).searchParams.get("batchId"));
    if (!batchId) {
      return jsonResponse(400, { error: "Missing batchId" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: "Missing Supabase service credentials" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: catchEntries, error: catchError }, { data: processedEntries, error: processedError }, { data: offers, error: offerError }] = await Promise.all([
      supabase
        .from("catch_entries")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("processed_batches")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("buyer_offers")
        .select("*")
        .eq("batch_id", batchId),
    ]);

    if (catchError) throw catchError;
    if (processedError) throw processedError;
    if (offerError) throw offerError;

    if (catchEntries && catchEntries.length > 0) {
      return jsonResponse(200, buildCatchPayloadFromRows(catchEntries, offers || []));
    }

    if (processedEntries && processedEntries.length > 0) {
      let sourceBatches: Array<Record<string, unknown>> = [];
      const { data: sourceData } = await supabase
        .from("processed_batch_sources")
        .select("*")
        .eq("processed_batch_id", processedEntries[0].id)
        .order("created_at", { ascending: true });
      sourceBatches = sourceData || [];

      if (sourceBatches.length > 0) {
        const sourceEntryIds = sourceBatches.map((source) => safeString(source.source_entry_id)).filter(Boolean);
        if (sourceEntryIds.length > 0) {
          const { data: sourceEntries } = await supabase
            .from("catch_entries")
            .select("id, date, species, kilos, count")
            .in("id", sourceEntryIds);
          const sourceEntryMap = Object.fromEntries((sourceEntries || []).map((row) => [safeString(row.id), row]));
          sourceBatches = sourceBatches.map((source) => ({
            ...source,
            ...(() => {
              const sourceEntry = sourceEntryMap[safeString(source.source_entry_id)] || {};
              const sourceQuantity = getCatchQuantity(sourceEntry);
              return {
                catch_date: safeString(sourceEntry.date),
                source_species: safeString(sourceEntry.species) || safeString(source.source_species),
                source_kilos: sourceEntry.kilos ?? source.source_kilos ?? "",
                source_count: sourceEntry.count ?? "",
                source_quantity: sourceQuantity.quantity,
                source_unit: sourceQuantity.unit,
              };
            })(),
          }));
        }
      }

      return jsonResponse(200, buildProcessedPayload(processedEntries[0], offers || [], sourceBatches));
    }

    if (offers && offers.length > 0) {
      return jsonResponse(200, buildOfferFallbackPayload(offers[0], offers));
    }

    return jsonResponse(404, { error: "Batch not found" });
  } catch (error) {
    return jsonResponse(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
