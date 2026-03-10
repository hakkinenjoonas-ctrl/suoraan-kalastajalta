import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: true,
},
});

const fishSpecies = ["Muikku", "Kuha", "Ahven", "Hauki", "Lahna", "Särki", "Säyne", "Siika", "Made", "Muu"];
const defaultFishPrices = {
Hauki: 3,
Kuha: 7,
Ahven: 4,
Lahna: 0.8,
Säyne: 0.8,
Siika: 5,
Muikku: 2,
};
const gearTypes = ["Rysä", "Verkko", "Katiska", "Trooli", "Onki", "Muu"];
const destinations = ["Myyntiin", "Oma käyttö", "Jalostukseen", "Tukkuun", "Muu"];
const destinations = ["Myyntiin", "Oma käyttö", "Jalostukseen", "Tukkuun", "Muu"]; 

// Buyer side: offers shown as aggregated batches (one save = one batch_id).
const defaultAreas = ["Suur-Saimaa", "Pien-Saimaa", "Saimaa", "Muu vesialue"];
const fishingSpots = [
{ name: "Kyläniemen pohjoispuoli", lat: 61.33, lng: 28.18 },
@@ -268,6 +270,7 @@
background: "#ecfdf5",
color: "#047857",
border: "1px solid #a7f3d0",
    whiteSpace: "pre-wrap",
},
small: { fontSize: 12, color: "#64748b" },
mapWrap: {
@@ -420,7 +423,89 @@
<textarea
readOnly
style={{ ...styles.textarea, minHeight: 360, fontFamily: "monospace" }}
          value={`create table if not exists public.wholesale_offers (\n  id uuid primary key default gen_random_uuid(),\n  entry_id uuid not null references public.catch_entries(id) on delete cascade,\n  company_name text not null,\n  contact_name text not null,\n  contact_email text not null,\n  contact_phone text,\n  offer_price_per_kg numeric not null default 0,\n  message text,\n  status text not null default 'pending' check (status in ('pending','accepted','rejected')),\n  created_by_user_id uuid references public.profiles(id) on delete set null,\n  created_at timestamptz not null default now()\n);\n\nalter table public.wholesale_offers enable row level security;\n\ncreate policy if not exists "offers_select_signed_in" on public.wholesale_offers\nfor select to authenticated using (true);\n\ncreate policy if not exists "offers_insert_signed_in" on public.wholesale_offers\nfor insert to authenticated with check (true);\n\ncreate policy if not exists "offers_update_owner_or_entry_owner" on public.wholesale_offers\nfor update to authenticated\nusing (\n  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)\n  or exists (select 1 from public.catch_entries e where e.id = entry_id and e.owner_user_id = auth.uid())\n)\nwith check (\n  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)\n  or exists (select 1 from public.catch_entries e where e.id = entry_id and e.owner_user_id = auth.uid())\n);`}
          value={`create table if not exists public.wholesale_offers (\n  id uuid primary key default gen_random_uuid(),\n  entry_id uuid not null references public.catch_entries(id) on delete cascade,\n  company_name text not null,\n  contact_name text not null,\n  contact_email text not null,\n  contact_phone text,\n  offer_price_per_kg numeric not null default 0,\n  message text,\n  status text not null default 'pending' check (status in ('pending','accepted','rejected')),\n  created_by_user_id uuid references public.profiles(id) on delete set null,\n  created_at timestamptz not null default now()\n);\n\nalter table public.wholesale_offers enable row level security;\n\ncreate policy if not exists "offers_select_signed_in" on public.wholesale_offers
for select to authenticated using (true);

create policy if not exists "offers_insert_signed_in" on public.wholesale_offers
for insert to authenticated with check (true);

create policy if not exists "offers_update_owner_or_entry_owner" on public.wholesale_offers
for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)
  or exists (select 1 from public.catch_entries e where e.id = entry_id and e.owner_user_id = auth.uid())
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)
  or exists (select 1 from public.catch_entries e where e.id = entry_id and e.owner_user_id = auth.uid())
);

-- Buyer offers table (needed for buyer app):
create table if not exists public.buyer_offers (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  buyer_id uuid references public.buyers(id) on delete cascade,
  buyer_email text not null,
  seller_user_id uuid references public.profiles(id) on delete set null,
  seller_name text,
  total_kilos numeric not null default 0,
  species_summary text,
  area text,
  spot text,
  gear text,
  gear_count numeric,
  price_per_kg numeric,
  notes text,
  status text not null default 'sent' check (status in ('sent','viewed','countered','reserved','accepted','rejected','cancelled')),
  counter_price_per_kg numeric,
  reserved_kilos numeric,
  buyer_message text,
  seller_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.buyer_offers enable row level security;

drop policy if exists "buyer_offers_select_own" on public.buyer_offers;
create policy "buyer_offers_select_own" on public.buyer_offers
for select to authenticated
using (
  buyer_email = auth.email()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)
);

drop policy if exists "buyer_offers_insert_seller" on public.buyer_offers;
create policy "buyer_offers_insert_seller" on public.buyer_offers
for insert to authenticated
with check (
  seller_user_id = auth.uid()
);

drop policy if exists "buyer_offers_update_buyer_or_owner" on public.buyer_offers;
create policy "buyer_offers_update_buyer_or_owner" on public.buyer_offers
for update to authenticated
using (
  buyer_email = auth.email()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)
)
with check (
  buyer_email = auth.email()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active = true)
);

-- Optional: keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists buyer_offers_set_updated_at on public.buyer_offers;
create trigger buyer_offers_set_updated_at
before update on public.buyer_offers
for each row execute function public.set_updated_at();`}
/>
</div>
</div>
@@ -500,6 +585,10 @@
const [profile, setProfile] = useState(null);
const [entries, setEntries] = useState([]);
const [offers, setOffers] = useState([]);
  const [buyerOffers, setBuyerOffers] = useState([]);
  const [buyerOffersFilter, setBuyerOffersFilter] = useState("open");
  const [buyerOffersSearch, setBuyerOffersSearch] = useState("");
  const [buyerActiveOfferId, setBuyerActiveOfferId] = useState(null);
const [allowedUsers, setAllowedUsers] = useState([]);
const [buyers, setBuyers] = useState([]);
const [loading, setLoading] = useState(true);
@@ -528,6 +617,7 @@
});
const [speciesRows, setSpeciesRows] = useState([createSpeciesRow()]);
const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member" });
  const [buyerAction, setBuyerAction] = useState({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
const [offerForm, setOfferForm] = useState({
company_name: "",
contact_name: "",
@@ -583,6 +673,7 @@
return false;
})
.map((buyer) => ({
        buyer_id: buyer.id,
email: buyer.email,
channel: buyer.buyer_type,
company_name: buyer.company_name,
@@ -591,11 +682,11 @@
.filter((recipient, index, array) => index === array.findIndex((item) => item.email === recipient.email));
};

  const sendCatchOfferEmail = async ({ formState, rows, profileState }) => {
  const sendCatchOfferEmail = async ({ formState, rows, profileState, batchId }) => {
const recipients = buildOfferRecipients(formState, rows);

if (recipients.length === 0) {
      return { skipped: true };
      return { skipped: true, sent: [], failed: [] };
}

const summaryLines = rows
@@ -623,27 +714,76 @@

const { data: sessionData } = await supabase.auth.getSession();
const accessToken = sessionData?.session?.access_token;
    const sent = [];
    const failed = [];

    for (const recipient of recipients) {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-catch-offer-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          entry,
          recipients: [{ email: recipient.email }],
        }),
      });

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-catch-offer-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        entry,
        recipients,
      }),
    });

    const data = await response.json().catch(() => ({}));
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        sent.push({
          buyer_id: recipient.buyer_id,
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          data,
        });

        // Create buyer offer record so buyer can respond inside the app
        try {
          await supabase.from("buyer_offers").insert({
            batch_id: batchId,
            buyer_id: recipient.buyer_id || null,
            buyer_email: recipient.email,
            seller_user_id: profileState?.id || null,
            seller_name: profileState?.display_name || profileState?.email || null,
            total_kilos: entry.kilos,
            species_summary: summaryLines,
            area: entry.area,
            spot: entry.spot,
            gear: entry.gear,
            gear_count: entry.gearCount,
            price_per_kg: entry.pricePerKg || null,
            notes: entry.notes || null,
            status: "sent",
          });
        } catch (dbError) {
          console.warn("buyer_offers insert failed", dbError);
        }
      } else {
        failed.push({
          company_name: recipient.company_name,
          contact_name: recipient.contact_name,
          email: recipient.email,
          channel: recipient.channel,
          error: data?.error || `Tarjoussähköpostin lähetys epäonnistui (${response.status})`,
        });
      }
    }

    if (!response.ok) {
      throw new Error(data?.error || `Tarjoussähköpostin lähetys epäonnistui (${response.status})`);
    if (failed.length > 0 && sent.length === 0) {
      throw new Error(failed.map((item) => `${item.company_name}: ${item.error}`).join(" | "));
}

    return data;
    return {
      skipped: false,
      sent,
      failed,
    };
};

const invalidateSession = async (message = "Istunto on vanhentunut. Kirjaudu uudelleen sisään.") => {
@@ -779,14 +919,21 @@
return !error;
};

      const buyerOffersTableExists = async () => {
        const { error } = await supabase.from("buyer_offers").select("id", { count: "exact", head: true });
        return !error;
      };

try {
const hasOffersTable = await offerTableExists();
const hasBuyersTable = await buyersTableExists();
        const [{ data: entryData, error: entryError }, { data: allowedData, error: allowedError }, offerResult, buyersResult] = await Promise.all([
        const hasBuyerOffersTable = await buyerOffersTableExists();
        const [{ data: entryData, error: entryError }, { data: allowedData, error: allowedError }, offerResult, buyersResult, buyerOffersResult] = await Promise.all([
finalEntriesQuery,
profile.role === "owner" ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
hasOffersTable ? supabase.from("wholesale_offers").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
hasBuyersTable ? supabase.from("buyers").select("*").order("company_name", { ascending: true }) : Promise.resolve({ data: [], error: null }),
          hasBuyerOffersTable ? supabase.from("buyer_offers").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
]);

if (entryError) {
@@ -854,6 +1001,21 @@
max_kg: buyer.max_kg == null ? "" : Number(buyer.max_kg),
})));
}

        if (buyerOffersResult?.error && buyerOffersResult.error.code !== "PGRST116") {
          if (isMissingRefreshTokenError(buyerOffersResult.error)) {
            await invalidateSession();
            return;
          }
        } else {
          setBuyerOffers((buyerOffersResult?.data || []).map((offer) => ({
            ...offer,
            total_kilos: Number(offer.total_kilos || 0),
            price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
            counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
            reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
          })));
        }
} catch (error) {
if (isMissingRefreshTokenError(error)) {
await invalidateSession();
@@ -972,10 +1134,11 @@
setUserMessage("Täytä sähköposti ja nimi.");
return;
}
    const role = newAllowedForm.role === "owner" ? "owner" : newAllowedForm.role === "buyer" ? "buyer" : "member";
const { error } = await supabase.from("allowed_users").insert({
email,
display_name: displayName,
      role: newAllowedForm.role === "owner" ? "owner" : "member",
      role,
is_active: true,
});
if (error) {
@@ -1070,6 +1233,7 @@

const resetBuyerForm = () => {
setBuyerForm({
      id: "",
company_name: "",
buyer_type: "ravintola",
contact_name: "",
@@ -1083,6 +1247,74 @@
});
};

  const refreshBuyerOffers = async () => {
    const { data, error } = await supabase.from("buyer_offers").select("*").order("created_at", { ascending: false });
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return;
      }
      setAuthError(error.message);
      return;
    }
    setBuyerOffers((data || []).map((offer) => ({
      ...offer,
      total_kilos: Number(offer.total_kilos || 0),
      price_per_kg: offer.price_per_kg == null ? "" : Number(offer.price_per_kg),
      counter_price_per_kg: offer.counter_price_per_kg == null ? "" : Number(offer.counter_price_per_kg),
      reserved_kilos: offer.reserved_kilos == null ? "" : Number(offer.reserved_kilos),
    })));
  };

  const buyerUpdateOffer = async (offerId, patch) => {
    const { error } = await supabase.from("buyer_offers").update(patch).eq("id", offerId);
    if (error) {
      if (isMissingRefreshTokenError(error)) {
        await invalidateSession();
        return false;
      }
      setAuthError(error.message);
      return false;
    }
    await refreshBuyerOffers();
    return true;
  };

  const onSubmitCounter = async (offer) => {
    const price = buyerAction.counter_price_per_kg === "" ? null : Number(buyerAction.counter_price_per_kg);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "countered",
      counter_price_per_kg: price,
      buyer_message: msg,
    });
    if (ok) {
      setAuthInfo("Vastatarjous lähetetty myyjälle.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onReserve = async (offer) => {
    const reserved = buyerAction.reserved_kilos === "" ? Number(offer.total_kilos || 0) : Number(buyerAction.reserved_kilos);
    const msg = buyerAction.buyer_message?.trim() || null;
    const ok = await buyerUpdateOffer(offer.id, {
      status: "reserved",
      reserved_kilos: reserved,
      buyer_message: msg,
    });
    if (ok) {
      setAuthInfo("Erä varattu. Myyjälle näkyy varaus.");
      setBuyerAction({ counter_price_per_kg: "", reserved_kilos: "", buyer_message: "" });
      setBuyerActiveOfferId(null);
    }
  };

  const onRejectBuyerOffer = async (offer) => {
    const ok = await buyerUpdateOffer(offer.id, { status: "rejected" });
    if (ok) setAuthInfo("Tarjous hylätty.");
  };

const handleSaveBuyer = async () => {
if (!profile || profile.role !== "owner") return;
const payload = {
@@ -1223,14 +1455,30 @@
}

try {
      await sendCatchOfferEmail({
      const emailResult = await sendCatchOfferEmail({
formState: form,
rows: validRows,
profileState: profile,
        batchId: timestamp,
});

if (form.offerToShops || form.offerToRestaurants || form.offerToWholesalers) {
        setAuthInfo("Saalis tallennettu ja tarjousviesti lähetetty ostajille.");
        if (emailResult.skipped) {
          setAuthInfo("Saalis tallennettu, mutta yhtään ostajaa ei täyttänyt tarjousehtoja.");
        } else {
          const sentLines = emailResult.sent.map((item) => `✔ ${item.company_name} (${item.email})`);
          const failedLines = emailResult.failed.map((item) => `✖ ${item.company_name} (${item.email}) – ${item.error}`);
          const parts = [
            `Saalis tallennettu. Tarjous lähetetty ${emailResult.sent.length} ostajalle.`,
          ];
          if (sentLines.length > 0) {
            parts.push("", "Lähetetty:", ...sentLines);
          }
          if (failedLines.length > 0) {
            parts.push("", "Epäonnistui:", ...failedLines);
          }
          setAuthInfo(parts.join(String.fromCharCode(10)));
        }
} else {
setAuthInfo("Saalis tallennettu.");
}
@@ -1281,6 +1529,92 @@
return <AuthView authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} onSignIn={handleSignIn} onSignUp={handleSignUp} authError={authError} authInfo={authInfo} />;
}

  if (profile.role === "buyer") {
    const filteredBuyerOffers = buyerOffers.filter((offer) => {
      const q = buyerOffersSearch.trim().toLowerCase();
      const statusOk = buyerOffersFilter === "all" ? true : buyerOffersFilter === "open" ? ["sent", "viewed", "countered"].includes(offer.status) : offer.status === buyerOffersFilter;
      const text = [offer.seller_name, offer.area, offer.spot, offer.species_summary, offer.status, offer.buyer_message].filter(Boolean).join(" ").toLowerCase();
      return statusOk && (!q || text.includes(q));
    });

    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.headerCard }}>
            <div style={styles.rowBetween}>
              <div>
                <h1 style={styles.title}>Suoraan Kalastajalta</h1>
                <p style={styles.subtitle}>Ostaja: <strong>{profile.display_name}</strong></p>
              </div>
              <div style={styles.toolbar}>
                <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
                <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
              </div>
            </div>
          </div>

          {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}
          {authInfo ? <div style={{ ...styles.noticeSuccess, marginBottom: 16 }}>{authInfo}</div> : null}

          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>Minulle tarjotut erät</strong>
              <div style={styles.row}>
                <select style={styles.input} value={buyerOffersFilter} onChange={(e) => setBuyerOffersFilter(e.target.value)}>
                  <option value="open">Avoimet</option>
                  <option value="reserved">Varatut</option>
                  <option value="accepted">Hyväksytyt</option>
                  <option value="rejected">Hylätyt</option>
                  <option value="all">Kaikki</option>
                </select>
                <input style={{ ...styles.input, width: 320 }} placeholder="Hae myyjällä, alueella, lajilla..." value={buyerOffersSearch} onChange={(e) => setBuyerOffersSearch(e.target.value)} />
              </div>
            </div>

            {filteredBuyerOffers.length === 0 ? <div style={styles.muted}>Ei tarjottuja eriä.</div> : filteredBuyerOffers.map((o) => {
              const isActive = buyerActiveOfferId === o.id;
              return (
                <div key={o.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{o.status}</span>
                        <span style={styles.badge}>{o.total_kilos} kg</span>
                        {o.price_per_kg !== "" && o.price_per_kg != null ? <span style={styles.badge}>{euro(o.price_per_kg)} / kg</span> : null}
                        <span style={styles.badge}>{o.area || "-"}</span>
                        {o.seller_name ? <span style={styles.badge}>Myyjä: {o.seller_name}</span> : null}
                      </div>
                      <div style={styles.muted}>{o.species_summary || "-"}</div>
                      {o.spot ? <div style={styles.muted}>Paikka: {o.spot}</div> : null}
                      {o.buyer_message ? <div style={styles.muted}>Sinun viesti: {o.buyer_message}</div> : null}
                      {o.seller_message ? <div style={styles.muted}>Myyjän viesti: {o.seller_message}</div> : null}
                    </div>
                    <div style={styles.row}>
                      <button style={styles.button} onClick={() => setBuyerActiveOfferId(isActive ? null : o.id)}>{isActive ? "Sulje" : "Tee vastatarjous / varaa"}</button>
                      <button style={styles.button} onClick={() => onRejectBuyerOffer(o)}>Hylkää</button>
                    </div>
                  </div>

                  {isActive ? (
                    <div style={{ ...styles.stack, marginTop: 12 }}>
                      <div style={styles.field}><label>Vastatarjous €/kg</label><input style={styles.input} type="number" value={buyerAction.counter_price_per_kg} onChange={(e) => setBuyerAction((p) => ({ ...p, counter_price_per_kg: e.target.value }))} placeholder="Esim. 5.80" /></div>
                      <div style={styles.field}><label>Varaa kg (tyhjä = koko erä)</label><input style={styles.input} type="number" value={buyerAction.reserved_kilos} onChange={(e) => setBuyerAction((p) => ({ ...p, reserved_kilos: e.target.value }))} placeholder={`Max ${o.total_kilos}`} /></div>
                      <div style={styles.field}><label>Viesti myyjälle</label><textarea style={styles.textarea} value={buyerAction.buyer_message} onChange={(e) => setBuyerAction((p) => ({ ...p, buyer_message: e.target.value }))} placeholder="Toimitus, nouto, aikataulu..." /></div>
                      <div style={styles.row}>
                        <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => onSubmitCounter(o)}>Lähetä vastatarjous</button>
                        <button style={styles.button} onClick={() => onReserve(o)}>Varaa erä</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

const tabStyle = profile.role === "owner" ? styles.tabs : styles.tabs6;
const grid3 = responsiveGridStyle(styles.grid3);
const grid2 = responsiveGridStyle(styles.grid2);
@@ -1294,7 +1628,7 @@
<div style={styles.rowBetween}>
<div>
<h1 style={styles.title}>Suoraan Kalastajalta</h1>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : "käyttäjä"}</p>
              <p style={styles.subtitle}>Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : profile.role === "buyer" ? "ostaja" : "käyttäjä"}</p>
</div>
<div style={styles.toolbar}>
{profile.role === "owner" ? (
@@ -1473,31 +1807,31 @@
<div style={styles.noticeInfo}>Lisää tähän kollegan sähköposti. Sen jälkeen hän voi rekisteröityä itse omalla salasanallaan.</div>
<div style={styles.field}><label>Nimi</label><input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" /></div>
<div style={styles.field}><label>Sähköposti</label><input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" /></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Käyttäjä</option><option value="owner">Omistaja</option></select></div>
              <div style={styles.field}><label>Rooli</label><select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}><option value="member">Kalastaja</option><option value="buyer">Ostaja</option><option value="owner">Omistaja</option></select></div>
{userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}
<button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleCreateAllowedUser}>Lisää sallittuihin</button>
</div>
<div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
<strong>Käyttäjähallinta</strong>
{allowedUsers.length === 0 ? <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div> : allowedUsers.map((user) => (
<div key={user.id} style={styles.entry}>
<div style={styles.entryHeader}>
<div>
<div style={styles.entryBadges}>
<span style={styles.badge}>{user.display_name}</span>
<span style={styles.badge}>{user.email}</span>
<span style={styles.badge}>{user.role === "owner" ? "Omistaja" : "Käyttäjä"}</span>
<span style={styles.badge}>{user.is_active ? "Aktiivinen" : "Pois käytöstä"}</span>
</div>
</div>
<button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>{user.is_active ? "Poista käytöstä" : "Aktivoi"}</button>
</div>
</div>
))}
</div>
</div>
)}
</div>
</div>
);
}
