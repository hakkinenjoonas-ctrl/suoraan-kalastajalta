import React, { useEffect, useMemo, useState } from "react";
import { ALLOWED_AUCTION_IMAGE_TYPES, prepareAuctionImage } from "../lib/auctionImage.js";
import { CONSUMER_PAYMENT_METHOD_OPTIONS, getConsumerListingUrl } from "../lib/consumerMarketplace.js";
import { calculateGrossPrice } from "../lib/pricing.js";
import { calculateSavedCatchConsumerAllocation, getSavedCatchUnallocatedKilos } from "../lib/savedCatchConsumerSale.js";
import { formatSpeciesForSale } from "../lib/species.js";
import { supabase } from "../lib/supabase.js";
import { styles } from "../lib/ui.js";
import { invokeEdgeFunctionAuthenticated } from "../services/edgeFunctions.js";

const CONSUMER_LISTING_IMAGE_BUCKET = "consumer-listing-images";

function localDateAfter(days) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function decimal(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function priceInput(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

function newVariant(unitType, suggestedGrossPrice = null) {
  const suggestedPrice = priceInput(suggestedGrossPrice);
  return {
    id: crypto.randomUUID(),
    unitType,
    label: unitType === "package" ? "1 kg pakkaus" : "",
    packageSizeKg: unitType === "package" ? "1" : "",
    unitPrice: unitType === "package" ? suggestedPrice : "",
    minWeightKg: unitType === "whole_fish" ? "0,8" : "",
    maxWeightKg: unitType === "whole_fish" ? "1,2" : "",
    pricePerKg: unitType === "whole_fish" ? suggestedPrice : "",
    availableUnits: "1",
  };
}

function initialDraft(entry, defaultPickupLocation) {
  const netPrice = decimal(entry?.pricePerKg);
  const suggestedGrossPrice = netPrice && netPrice > 0 ? calculateGrossPrice(netPrice) : null;
  return {
    productName: formatSpeciesForSale(entry?.species) || "Kalaerä",
    description: "",
    pickupLocation: defaultPickupLocation || "",
    pickupDate: localDateAfter(1),
    pickupStartTime: "12:00",
    pickupEndTime: "13:00",
    orderDeadlineHours: "2",
    paymentMethods: [],
    unitType: "package",
    variants: [newVariant("package", suggestedGrossPrice)],
    suggestedGrossPrice,
  };
}

export default function SavedCatchConsumerSaleDialog({ entry, profile, accessToken, defaultPickupLocation, publicAppBaseUrl, onClose, onPublished }) {
  const [draft, setDraft] = useState(() => initialDraft(entry, defaultPickupLocation));
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  const allocation = useMemo(() => calculateSavedCatchConsumerAllocation(draft.unitType, draft.variants), [draft.unitType, draft.variants]);

  const catchKilos = Number(entry?.kilos || 0);
  const remainingKilos = getSavedCatchUnallocatedKilos(catchKilos, allocation);

  const updateVariant = (id, field, value) => {
    setDraft((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, [field]: value } : variant) }));
  };

  const selectUnitType = (unitType) => {
    setDraft((current) => ({ ...current, unitType, variants: [newVariant(unitType, current.suggestedGrossPrice)] }));
  };

  const selectImage = async (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selectedFile) return;
    if (!ALLOWED_AUCTION_IMAGE_TYPES.includes(selectedFile.type)) {
      setError("Valitse JPG-, PNG- tai WebP-kuva.");
      return;
    }
    try {
      const preparedFile = await prepareAuctionImage(selectedFile);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(preparedFile);
      setImagePreviewUrl(URL.createObjectURL(preparedFile));
      setError("");
    } catch (imageError) {
      setError(String(imageError?.message || imageError || "Kuvan käsittely epäonnistui."));
    }
  };

  const publish = async () => {
    if (saving) return;
    setError("");
    const productName = String(draft.productName || "").trim();
    const pickupLocation = String(draft.pickupLocation || "").trim();
    const paymentMethods = draft.paymentMethods.map((method) => String(method || "").trim()).filter(Boolean);
    const variants = draft.variants.map((variant) => ({
      sale_unit_type: draft.unitType,
      label: String(variant.label || "").trim(),
      package_size_kg: draft.unitType === "package" ? decimal(variant.packageSizeKg) : null,
      unit_price_including_vat: draft.unitType === "package" ? decimal(variant.unitPrice) : null,
      min_weight_kg: draft.unitType === "whole_fish" ? decimal(variant.minWeightKg) : null,
      max_weight_kg: draft.unitType === "whole_fish" ? decimal(variant.maxWeightKg) : null,
      price_per_kg_including_vat: draft.unitType === "whole_fish" ? decimal(variant.pricePerKg) : null,
      available_units: Math.floor(Number(variant.availableUnits || 0)),
    }));
    const pickupStart = new Date(`${draft.pickupDate || ""}T${draft.pickupStartTime || ""}:00`);
    const pickupEnd = new Date(`${draft.pickupDate || ""}T${draft.pickupEndTime || ""}:00`);
    const deadlineHours = Number(draft.orderDeadlineHours);
    const orderDeadline = new Date(pickupStart.getTime() - deadlineHours * 60 * 60 * 1000);

    if (!productName) return setError("Täytä tuotteen nimi.");
    if (!pickupLocation) return setError("Täytä noutopaikka.");
    if (paymentMethods.length < 1) return setError("Valitse vähintään yksi maksutapa.");
    if (!draft.pickupDate || !draft.pickupStartTime || !draft.pickupEndTime || Number.isNaN(pickupStart.getTime()) || Number.isNaN(pickupEnd.getTime())) return setError("Täytä noutopäivä ja noutoaika.");
    if (pickupEnd <= pickupStart) return setError("Noudon päättymisajan pitää olla alkamisajan jälkeen.");
    if (!Number.isFinite(deadlineHours) || deadlineHours < 0 || orderDeadline <= new Date()) return setError("Tilausten määräajan pitää olla tulevaisuudessa.");
    if (variants.length < 1 || variants.some((variant) => !variant.label || variant.available_units < 1)) return setError("Täytä jokaiselle myyntiyksikölle nimi ja myyntimäärä.");
    if (draft.unitType === "package" && variants.some((variant) => !(variant.package_size_kg > 0) || !(variant.unit_price_including_vat > 0))) return setError("Täytä jokaiselle pakkaukselle koko ja hinta.");
    if (draft.unitType === "whole_fish" && variants.some((variant) => !(variant.min_weight_kg > 0) || !(variant.max_weight_kg >= variant.min_weight_kg) || !(variant.price_per_kg_including_vat > 0))) return setError("Täytä jokaiselle kokoluokalle painoväli ja kilohinta.");
    if (allocation.minimum > catchKilos + 0.001) return setError("Kuluttajamyyntiin kohdistettu vähimmäispaino ylittää saaliin kokonaispainon.");

    setSaving(true);
    let uploadedImagePath = "";
    let imageAttached = false;
    let imageWarning = "";
    try {
      if (imageFile) {
        const extension = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
        uploadedImagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(CONSUMER_LISTING_IMAGE_BUCKET).upload(uploadedImagePath, imageFile, {
          cacheControl: "3600",
          contentType: imageFile.type,
          upsert: false,
        });
        if (uploadError) throw new Error(`Kuvan tallennus epäonnistui: ${uploadError.message}`);
      }

      const { data: listingId, error: listingError } = await supabase.rpc("publish_consumer_listing", {
        p_catch_entry_id: entry.id,
        p_batch_id: entry.batchId || "",
        p_species: formatSpeciesForSale(entry.species),
        p_product_name: productName,
        p_description: String(draft.description || "").trim(),
        p_seller_name: profile.company_name || profile.display_name || "Paikallinen kalastaja",
        p_municipality: entry.municipality || profile.city || "",
        p_pickup_location: pickupLocation,
        p_catch_date: entry.date || null,
        p_cold_storage: false,
        p_pickup_start: pickupStart.toISOString(),
        p_pickup_end: pickupEnd.toISOString(),
        p_order_deadline: orderDeadline.toISOString(),
        p_variants: variants,
        p_payment_methods: paymentMethods,
      });
      if (listingError) throw listingError;

      if (uploadedImagePath) {
        const imageUrl = supabase.storage.from(CONSUMER_LISTING_IMAGE_BUCKET).getPublicUrl(uploadedImagePath).data.publicUrl;
        const { data: attachedListing, error: attachError } = await supabase.from("consumer_listings")
          .update({ image_url: imageUrl })
          .eq("id", listingId)
          .eq("seller_user_id", profile.id)
          .select("id")
          .maybeSingle();
        if (attachError || !attachedListing) {
          imageWarning = "Kuluttajaerä julkaistiin, mutta kuvaa ei voitu liittää ilmoitukseen.";
          try { await supabase.storage.from(CONSUMER_LISTING_IMAGE_BUCKET).remove([uploadedImagePath]); } catch { /* Listing itself remains valid. */ }
          uploadedImagePath = "";
        } else {
          imageAttached = true;
        }
      }

      const notificationResult = await invokeEdgeFunctionAuthenticated("notify-consumer-listing", { listingId }, accessToken);
      onPublished({
        listingId,
        listingUrl: getConsumerListingUrl(listingId, publicAppBaseUrl),
        notificationError: notificationResult.error,
        recipients: Number(notificationResult.data?.recipients || 0),
        imageWarning,
      });
    } catch (publishError) {
      if (uploadedImagePath && !imageAttached) {
        try { await supabase.storage.from(CONSUMER_LISTING_IMAGE_BUCKET).remove([uploadedImagePath]); } catch { /* Preserve original error. */ }
      }
      setError(String(publishError?.message || publishError || "Kuluttajaerän julkaiseminen epäonnistui."));
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2700, padding: 16, background: "rgba(15, 23, 42, 0.55)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => { if (!saving) onClose(); }}>
      <div style={{ ...styles.card, ...styles.sectionCard, width: "min(880px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxSizing: "border-box", background: "#fff" }} onClick={(event) => event.stopPropagation()}>
        <div style={styles.rowBetween}>
          <div><div style={{ fontSize: 22, fontWeight: 800 }}>Myy suoraan kuluttajalle</div><div style={styles.muted}>{formatSpeciesForSale(entry.species)} · saalis {catchKilos.toLocaleString("fi-FI")} kg · {entry.batchId || "Erätunnus puuttuu"}</div></div>
          <button style={styles.button} type="button" onClick={onClose} disabled={saving}>Sulje</button>
        </div>

        <div style={{ ...styles.noticeInfo, marginTop: 14 }}><strong>Voit myydä koko saaliin tai vain osan siitä.</strong> Pakkauskoot ja niiden kappalemäärät määrittävät kuluttajamyyntiin tulevan kilomäärän.</div>

        <div style={{ ...styles.stack, marginTop: 16 }}>
          <div style={styles.field}><label>Myyntiyksikkö</label><div style={{ ...styles.row, flexWrap: "wrap" }}><button type="button" style={{ ...styles.button, background: draft.unitType === "package" ? "#0f766e" : "#fff", color: draft.unitType === "package" ? "#fff" : "#134e4a" }} onClick={() => selectUnitType("package")}>Valmiit pakkaukset</button><button type="button" style={{ ...styles.button, background: draft.unitType === "whole_fish" ? "#0f766e" : "#fff", color: draft.unitType === "whole_fish" ? "#fff" : "#134e4a" }} onClick={() => selectUnitType("whole_fish")}>Kokonaiset kalat</button></div></div>
          <div style={styles.field}><label>Tuotteen nimi</label><input style={styles.input} value={draft.productName} onChange={(event) => setDraft((current) => ({ ...current, productName: event.target.value }))} /></div>

          <div style={{ ...styles.field, border: "1px solid #99f6e4", borderRadius: 14, padding: 12 }}>
            <label>Tuotteen tai saaliin kuva (valinnainen)</label>
            <div style={{ ...styles.row, flexWrap: "wrap", marginTop: 8 }}><label style={{ ...styles.button, cursor: "pointer" }}>{imageFile ? "Vaihda kuva" : "Valitse kuva"}<input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={selectImage} /></label><label style={{ ...styles.button, cursor: "pointer" }}>Ota kuva<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={selectImage} /></label>{imageFile ? <button type="button" style={styles.button} onClick={() => { setImageFile(null); setImagePreviewUrl(""); }}>Poista kuva</button> : null}</div>
            {imagePreviewUrl ? <img src={imagePreviewUrl} alt="Kuvan esikatselu" style={{ display: "block", width: "100%", maxWidth: 520, maxHeight: 300, marginTop: 10, objectFit: "cover", borderRadius: 12 }} /> : null}
          </div>

          {draft.variants.map((variant, index) => (
            <div key={variant.id} style={{ ...styles.field, border: "1px solid #99f6e4", borderRadius: 14, padding: 12 }}>
              <div style={styles.rowBetween}><strong>{draft.unitType === "whole_fish" ? `Kokoluokka ${index + 1}` : `Pakkauskoko ${index + 1}`}</strong>{draft.variants.length > 1 ? <button type="button" style={styles.button} onClick={() => setDraft((current) => ({ ...current, variants: current.variants.filter((item) => item.id !== variant.id) }))}>Poista</button> : null}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 10 }}>
                <div style={styles.field}><label>Nimi</label><input style={styles.input} value={variant.label} onChange={(event) => updateVariant(variant.id, "label", event.target.value)} placeholder={draft.unitType === "whole_fish" ? "Esim. Kuha 1,2–1,8 kg" : "Esim. 1 kg pakkaus"} /></div>
                {draft.unitType === "package" ? <><div style={styles.field}><label>Pakkauksen koko kg</label><input style={styles.input} inputMode="decimal" value={variant.packageSizeKg} onChange={(event) => updateVariant(variant.id, "packageSizeKg", event.target.value)} /></div><div style={styles.field}><label>Hinta / pakkaus sis. ALV (€)</label><input style={styles.input} inputMode="decimal" value={variant.unitPrice} onChange={(event) => updateVariant(variant.id, "unitPrice", event.target.value)} /></div></> : <><div style={styles.field}><label>Pienin paino kg / kala</label><input style={styles.input} inputMode="decimal" value={variant.minWeightKg} onChange={(event) => updateVariant(variant.id, "minWeightKg", event.target.value)} /></div><div style={styles.field}><label>Suurin paino kg / kala</label><input style={styles.input} inputMode="decimal" value={variant.maxWeightKg} onChange={(event) => updateVariant(variant.id, "maxWeightKg", event.target.value)} /></div><div style={styles.field}><label>Kilohinta sis. ALV (€ / kg)</label><input style={styles.input} inputMode="decimal" value={variant.pricePerKg} onChange={(event) => updateVariant(variant.id, "pricePerKg", event.target.value)} /></div></>}
                <div style={styles.field}><label>{draft.unitType === "whole_fish" ? "Kaloja myyntiin (kpl)" : "Pakkauksia myyntiin (kpl)"}</label><input style={styles.input} type="number" min="1" step="1" value={variant.availableUnits} onChange={(event) => updateVariant(variant.id, "availableUnits", event.target.value)} /></div>
              </div>
            </div>
          ))}
          <button type="button" style={{ ...styles.button, justifySelf: "start" }} onClick={() => setDraft((current) => ({ ...current, variants: [...current.variants, newVariant(current.unitType, current.suggestedGrossPrice)] }))}>+ Lisää {draft.unitType === "whole_fish" ? "kokoluokka" : "pakkauskoko"}</button>

          <div style={{ ...styles.noticeInfo, display: "grid", gap: 4 }}><strong>Kuluttajamyyntiin: {allocation.minimum.toLocaleString("fi-FI", { maximumFractionDigits: 3 })}{allocation.maximum !== allocation.minimum ? `–${allocation.maximum.toLocaleString("fi-FI", { maximumFractionDigits: 3 })}` : ""} kg</strong><span>Saaliista jää tämän listauksen ulkopuolelle vähintään {remainingKilos.toLocaleString("fi-FI", { maximumFractionDigits: 3 })} kg.</span></div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}><div style={{ ...styles.field, gridColumn: "1 / -1" }}><label>Nouto-osoite tai tarkka noutopaikka</label><input style={styles.input} value={draft.pickupLocation} onChange={(event) => setDraft((current) => ({ ...current, pickupLocation: event.target.value }))} /></div><div style={styles.field}><label>Noutopäivä</label><input style={{ ...styles.input, ...styles.dateInput }} type="date" value={draft.pickupDate} onChange={(event) => setDraft((current) => ({ ...current, pickupDate: event.target.value }))} /></div><div style={styles.field}><label>Noudettavissa alkaen</label><input style={styles.input} type="time" value={draft.pickupStartTime} onChange={(event) => setDraft((current) => ({ ...current, pickupStartTime: event.target.value }))} /></div><div style={styles.field}><label>Noudettavissa asti</label><input style={styles.input} type="time" value={draft.pickupEndTime} onChange={(event) => setDraft((current) => ({ ...current, pickupEndTime: event.target.value }))} /></div><div style={styles.field}><label>Tilaukset viimeistään (tuntia ennen noutoa)</label><input style={styles.input} type="number" min="0" step="0.5" value={draft.orderDeadlineHours} onChange={(event) => setDraft((current) => ({ ...current, orderDeadlineHours: event.target.value }))} /></div></div>

          <div style={styles.field}><label>Maksutavat (valitse vähintään yksi)</label><div style={{ ...styles.row, flexWrap: "wrap" }}>{CONSUMER_PAYMENT_METHOD_OPTIONS.map((method) => { const selected = draft.paymentMethods.includes(method); return <label key={method} style={{ ...styles.button, cursor: "pointer", background: selected ? "#dbeafe" : "#fff" }}><input type="checkbox" checked={selected} onChange={() => setDraft((current) => ({ ...current, paymentMethods: selected ? current.paymentMethods.filter((item) => item !== method) : [...current.paymentMethods, method] }))} />{method}</label>; })}</div></div>
          <div style={styles.field}><label>Kuluttajalle näkyvä kuvaus</label><textarea style={styles.textarea} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Kerro käsittelystä, tuoreudesta ja noudosta." /></div>
          <div style={styles.noticeInfo}>Kuluttaja maksaa suoraan kalastajalle. Palvelu kirjaa jokaisesta tehdystä tilauksesta 8 % provision varaushetkellä.</div>
          {error ? <div style={styles.noticeError}>{error}</div> : null}
          <div style={{ ...styles.row, flexWrap: "wrap" }}><button type="button" style={{ ...styles.button, background: "linear-gradient(135deg, #059669, #16a34a)", borderColor: "#047857", color: "#fff", fontWeight: 800 }} onClick={publish} disabled={saving}>{saving ? "Julkaistaan…" : "Julkaise kuluttajamyyntiin"}</button><button type="button" style={styles.button} onClick={onClose} disabled={saving}>Peruuta</button></div>
        </div>
      </div>
    </div>
  );
}
