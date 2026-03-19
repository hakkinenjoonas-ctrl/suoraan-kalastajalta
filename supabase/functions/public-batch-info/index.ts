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
    quantity: entry.kilos ?? "",
    unit: "kg",
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
      const kilos = row.kilos == null || row.kilos === "" ? "" : `${row.kilos} kg`;
      return [species, kilos].filter(Boolean).join(": ");
    })
    .filter(Boolean);
  const totalKilos = rows.reduce((sum, row) => sum + Number(row.kilos || 0), 0);

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
    quantity: totalKilos,
    unit: "kg",
    seller_name: safeString(first.owner_name),
    notes: rows.map((row) => safeString(row.notes)).filter(Boolean).join("\n\n"),
    created_at: safeString(first.created_at),
    related_processing: null,
    sale_info: saleInfo,
  };
}

function buildProcessedPayload(entry: Record<string, unknown>, offers: Array<Record<string, unknown>>) {
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
    sale_info: saleInfo,
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
      return jsonResponse(200, buildProcessedPayload(processedEntries[0], offers || []));
    }

    return jsonResponse(404, { error: "Batch not found" });
  } catch (error) {
    return jsonResponse(500, { error: String(error instanceof Error ? error.message : error) });
  }
});
