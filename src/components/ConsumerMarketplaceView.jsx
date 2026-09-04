import React, { useEffect, useMemo, useState } from "react";
import { calculateConsumerReservationEstimate, filterConsumerListings, getConsumerAppDeepLink, getConsumerListingPath } from "../lib/consumerMarketplace.js";

const money = (value) => `${Number(value || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateTime = (value) => value ? new Date(value).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" }) : "Sovitaan myyjän kanssa";
const time = (value) => value ? new Date(value).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }) : "";

function pickupWindow(start, end) {
  if (!start) return "Sovitaan myyjän kanssa";
  const startDate = new Date(start);
  const date = startDate.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" });
  return `${date} klo ${time(start)}${end ? `–${time(end)}` : ""}`;
}

function orderingClosed(listing) {
  const deadline = Date.parse(listing?.orderDeadline || "");
  return Number.isFinite(deadline) && deadline <= Date.now();
}

function FishPlaceholder({ species }) {
  return (
    <div className="consumer-fish-placeholder" aria-label={`${species} – kuva tulossa`}>
      <span aria-hidden="true">🐟</span>
      <small>Kuva tulossa</small>
    </div>
  );
}

function getStartingPrice(listing) {
  const prices = (listing.variants || [])
    .map((variant) => variant.unitType === "whole_fish" ? variant.pricePerKg : variant.unitPrice)
    .filter((value) => Number(value) > 0);
  return prices.length > 0 ? Math.min(...prices) : 0;
}

export default function ConsumerMarketplaceView({
  listings,
  orders,
  loading,
  error,
  user,
  busy,
  message,
  initialListingId = "",
  onOpenAuth,
  onReturnToMainApp,
  onSignOut,
  onReserve,
  onSubscribe,
}) {
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [selected, setSelected] = useState(null);
  const [handledInitialListingId, setHandledInitialListingId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [unitCount, setUnitCount] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertSpecies, setAlertSpecies] = useState("");
  const [alertMunicipality, setAlertMunicipality] = useState("");

  const speciesOptions = useMemo(() => Array.from(new Set(listings.map((item) => item.species).filter(Boolean))).sort(), [listings]);
  const municipalityOptions = useMemo(() => Array.from(new Set(listings.map((item) => item.municipality).filter(Boolean))).sort(), [listings]);
  const visibleListings = useMemo(() => filterConsumerListings(listings, { search, species, municipality }), [listings, search, species, municipality]);
  const selectedVariant = selected?.variants?.find((variant) => variant.id === selectedVariantId) || selected?.variants?.[0] || null;
  const totals = selectedVariant ? calculateConsumerReservationEstimate({ variant: selectedVariant, unitCount, vatRate: selected.vatRate }) : null;

  useEffect(() => {
    const accountName = String(user?.user_metadata?.display_name || "").trim();
    if (accountName) setCustomerName((current) => current || accountName);
  }, [user]);

  const openListing = (listing, updateUrl = true) => {
    setSelected(listing);
    setSelectedVariantId(listing.variants?.[0]?.id || "");
    setUnitCount(1);
    setNote("");
    if (updateUrl && typeof window !== "undefined") {
      window.history.pushState({}, "", getConsumerListingPath(listing.id));
    }
  };

  const closeListing = () => {
    setSelected(null);
    if (typeof window !== "undefined") window.history.replaceState({}, "", getConsumerListingPath());
  };

  useEffect(() => {
    if (!initialListingId || initialListingId === handledInitialListingId || listings.length === 0) return;
    const linkedListing = listings.find((listing) => listing.id === initialListingId);
    if (linkedListing && selected?.id !== linkedListing.id) openListing(linkedListing, false);
    setHandledInitialListingId(initialListingId);
  }, [handledInitialListingId, initialListingId, listings, selected?.id]);

  const submitReservation = async () => {
    if (!user) {
      onOpenAuth({ listingId: selected?.id });
      return;
    }
    const ok = await onReserve({ listing: selected, variant: selectedVariant, unitCount, customerName, phone, note });
    if (ok) closeListing();
  };

  return (
    <div className="consumer-marketplace">
      <style>{`
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f4f8f5; }
        button, input, select, textarea { font: inherit; }
        .consumer-marketplace { min-height: 100dvh; color: #17352c; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(194, 224, 206, .72), transparent 34rem), #f4f8f5; }
        .consumer-shell { width: min(1120px, 100%); margin: 0 auto; padding: 18px clamp(14px, 4vw, 36px) 80px; }
        .consumer-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 10px 0 22px; }
        .consumer-brand { display: flex; align-items: center; gap: 12px; color: #123d32; text-decoration: none; }
        .consumer-brand img { width: 62px; height: 62px; object-fit: contain; }
        .consumer-brand strong { display: block; font-size: clamp(18px, 3vw, 25px); letter-spacing: -.03em; }
        .consumer-brand span { display: block; color: #527066; font-size: 13px; margin-top: 2px; }
        .consumer-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .consumer-button { border: 1px solid #bdd2c7; border-radius: 999px; background: rgba(255,255,255,.88); color: #17483a; min-height: 44px; padding: 10px 17px; font-weight: 750; cursor: pointer; }
        .consumer-button:hover { border-color: #3d8069; }
        .consumer-primary { border-color: #17694f; background: #17694f; color: #fff; box-shadow: 0 8px 24px rgba(23,105,79,.18); }
        .consumer-primary:disabled, .consumer-button:disabled { opacity: .58; cursor: wait; }
        .consumer-hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr); gap: 18px; align-items: stretch; margin-bottom: 18px; }
        .consumer-hero-main, .consumer-hero-side { border: 1px solid #c9dbd2; border-radius: 26px; padding: clamp(22px, 5vw, 42px); overflow: hidden; }
        .consumer-hero-main { background: linear-gradient(135deg, #123d32 0%, #1e765d 100%); color: white; position: relative; }
        .consumer-hero-main:after { content: ""; position: absolute; width: 230px; height: 230px; border-radius: 50%; right: -75px; bottom: -90px; background: rgba(255,255,255,.09); }
        .consumer-kicker { text-transform: uppercase; letter-spacing: .13em; font-size: 12px; font-weight: 850; opacity: .82; }
        .consumer-hero h1 { margin: 12px 0; max-width: 690px; font-size: clamp(34px, 7vw, 64px); line-height: .98; letter-spacing: -.055em; }
        .consumer-hero p { margin: 0; max-width: 650px; line-height: 1.55; font-size: clamp(16px, 2.4vw, 20px); opacity: .9; }
        .consumer-hero-side { background: rgba(255,255,255,.86); display: flex; flex-direction: column; justify-content: space-between; gap: 24px; }
        .consumer-hero-side strong { font-size: 22px; line-height: 1.15; }
        .consumer-hero-side p { color: #567066; font-size: 15px; }
        .consumer-demo { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 7px 11px; background: #fff2cc; color: #755915; font-weight: 800; font-size: 12px; }
        .consumer-filters { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(2, minmax(170px, .42fr)); gap: 10px; padding: 14px; margin: 18px 0; border-radius: 20px; background: rgba(255,255,255,.84); border: 1px solid #d4e1da; }
        .consumer-input { width: 100%; min-height: 48px; border: 1px solid #c8d8d0; border-radius: 14px; padding: 11px 13px; background: white; color: #17352c; outline: none; }
        .consumer-input:focus { border-color: #28745b; box-shadow: 0 0 0 3px rgba(40,116,91,.12); }
        .consumer-list-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 28px 0 12px; }
        .consumer-list-heading h2 { margin: 0; font-size: clamp(25px, 4vw, 34px); letter-spacing: -.035em; }
        .consumer-list-heading span { color: #60796f; font-weight: 650; }
        .consumer-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .consumer-card { display: flex; flex-direction: column; min-width: 0; border: 1px solid #ceddd5; border-radius: 22px; overflow: hidden; background: rgba(255,255,255,.94); box-shadow: 0 10px 30px rgba(32,72,57,.06); }
        .consumer-card-image, .consumer-fish-placeholder { height: 180px; width: 100%; object-fit: cover; background: linear-gradient(145deg, #dcebe4, #f4eee0); }
        .consumer-fish-placeholder { display: grid; place-items: center; align-content: center; gap: 5px; color: #476a5d; }
        .consumer-fish-placeholder span { font-size: 58px; filter: grayscale(.2); }
        .consumer-card-body { display: flex; flex: 1; flex-direction: column; padding: 18px; gap: 12px; }
        .consumer-card h3 { margin: 0; font-size: 21px; letter-spacing: -.025em; }
        .consumer-meta { display: flex; gap: 7px; flex-wrap: wrap; }
        .consumer-pill { border-radius: 999px; padding: 6px 9px; background: #edf5f1; color: #35604f; font-size: 12px; font-weight: 750; }
        .consumer-description { color: #567066; line-height: 1.45; font-size: 14px; flex: 1; }
        .consumer-price-row { display: flex; align-items: end; justify-content: space-between; gap: 10px; }
        .consumer-price { font-size: 25px; font-weight: 900; letter-spacing: -.035em; }
        .consumer-price small { display: block; font-size: 12px; font-weight: 650; color: #6b8078; letter-spacing: 0; }
        .consumer-notice, .consumer-empty { border: 1px solid #cddfd6; border-radius: 18px; padding: 16px; background: rgba(255,255,255,.84); color: #49685c; }
        .consumer-success { border-color: #91c9ac; background: #ebf8f0; color: #145c3d; }
        .consumer-orders { margin-top: 34px; padding-top: 26px; border-top: 1px solid #c8d8d0; }
        .consumer-order { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 16px 0; border-bottom: 1px solid #dae5df; }
        .consumer-overlay { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 14px; background: rgba(11,34,27,.62); backdrop-filter: blur(7px); }
        .consumer-dialog { width: min(620px, 100%); max-height: calc(100dvh - 28px); overflow-y: auto; border-radius: 25px; background: #fff; padding: clamp(19px, 4vw, 30px); box-shadow: 0 26px 90px rgba(7,32,24,.32); }
        .consumer-dialog-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
        .consumer-dialog h2 { margin: 0; font-size: 28px; letter-spacing: -.04em; }
        .consumer-close { width: 42px; height: 42px; border-radius: 50%; border: 1px solid #d3dfd9; background: #f7faf8; cursor: pointer; }
        .consumer-summary { display: grid; gap: 7px; margin: 18px 0; padding: 15px; border-radius: 16px; background: #f2f7f4; }
        .consumer-form { display: grid; gap: 13px; }
        .consumer-field { display: grid; gap: 6px; }
        .consumer-field label { font-size: 13px; font-weight: 800; color: #45665a; }
        .consumer-total { display: flex; justify-content: space-between; gap: 12px; font-size: 21px; font-weight: 900; }
        .consumer-small { font-size: 12px; color: #6c8179; line-height: 1.45; }
        @media (max-width: 850px) { .consumer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .consumer-hero { grid-template-columns: 1fr; } .consumer-hero-side { display: grid; grid-template-columns: 1fr auto; align-items: center; } }
        @media (max-width: 620px) { .consumer-shell { padding-top: 8px; } .consumer-header { align-items: flex-start; } .consumer-brand img { width: 48px; height: 48px; } .consumer-brand span { display: none; } .consumer-actions .consumer-button:first-child { display: none; } .consumer-hero-main, .consumer-hero-side { border-radius: 20px; padding: 22px; } .consumer-hero-side { display: flex; } .consumer-filters { grid-template-columns: 1fr; } .consumer-grid { grid-template-columns: 1fr; } .consumer-card { flex-direction: row; } .consumer-card-image, .consumer-fish-placeholder { width: 34%; min-width: 118px; height: auto; min-height: 210px; } .consumer-fish-placeholder span { font-size: 42px; } .consumer-card-body { padding: 15px; } .consumer-price-row { align-items: center; } .consumer-order { grid-template-columns: 1fr; } }
      `}</style>

      <main className="consumer-shell">
        <header className="consumer-header">
          <a className="consumer-brand" href="/kuluttaja">
            <img src="/logo.png" alt="" />
            <span><strong>Suoraan Kalastajalta</strong><span>Tuoretta lähikalaa ilman välikäsiä</span></span>
          </a>
          <div className="consumer-actions">
            {onReturnToMainApp ? <button className="consumer-button consumer-primary" onClick={onReturnToMainApp}>Palaa kalastajanäkymään</button> : null}
            <button className="consumer-button" onClick={() => setAlertsOpen(true)}>Kalaeräilmoitukset</button>
            {user ? (
              <button className="consumer-button" onClick={onSignOut}>Kirjaudu ulos</button>
            ) : (
              <button className="consumer-button consumer-primary" onClick={() => onOpenAuth({})}>Kirjaudu</button>
            )}
          </div>
        </header>

        <section className="consumer-hero">
          <div className="consumer-hero-main">
            <div className="consumer-kicker">Lähikalan markkinapaikka</div>
            <h1>Tuore kala löytyy läheltä.</h1>
            <p>Selaa kalastajien myynnissä olevia eriä ilman kirjautumista. Varaa sopiva pakkaus ja nouda se ilmoitetusta paikasta.</p>
          </div>
          <div className="consumer-hero-side">
            <div>
              <strong>Selaaminen toimii suoraan puhelimen selaimessa.</strong>
              <p>Sovellusta ei tarvitse asentaa. Jos haluat ilmoitukset uusista kalaeristä puhelimeen, voit kirjautua ja ottaa ne käyttöön.</p>
            </div>
            <span className="consumer-demo">SUORAAN PAIKALLISELTA KALASTAJALTA</span>
          </div>
        </section>

        {message ? <div className="consumer-notice consumer-success">{message}</div> : null}
        {error ? <div className="consumer-notice">{error}</div> : null}

        <section className="consumer-filters" aria-label="Suodata kalaeriä">
          <input className="consumer-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hae kalaa, tuotetta tai kalastajaa" />
          <select className="consumer-input" value={species} onChange={(event) => setSpecies(event.target.value)}>
            <option value="">Kaikki kalalajit</option>
            {speciesOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="consumer-input" value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            <option value="">Kaikki paikkakunnat</option>
            {municipalityOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </section>

        <div className="consumer-list-heading"><h2>Myynnissä nyt</h2><span>{visibleListings.length} kalaerää</span></div>
        {loading ? <div className="consumer-empty">Haetaan tuoreita kalaeriä…</div> : null}
        {!loading && visibleListings.length === 0 ? <div className="consumer-empty">Näillä rajauksilla ei löytynyt kalaeriä. Voit tilata ilmoituksen seuraavasta sopivasta erästä.</div> : null}
        <section className="consumer-grid">
          {visibleListings.map((listing) => (
            <article className="consumer-card" key={listing.id}>
              {listing.imageUrl ? <img className="consumer-card-image" src={listing.imageUrl} alt={listing.productName} /> : <FishPlaceholder species={listing.species} />}
              <div className="consumer-card-body">
                <div><h3>{listing.productName}</h3><div className="consumer-small">{listing.sellerName}</div></div>
                <div className="consumer-meta"><span className="consumer-pill">{listing.municipality || "Paikkakunta sovitaan"}</span><span className="consumer-pill">{listing.variants.some((variant) => variant.unitType === "whole_fish") ? "Kokonaisia kaloja" : "Valmiita pakkauksia"}</span><span className="consumer-pill">{listing.availableUnits} jäljellä</span></div>
                <div className="consumer-summary" style={{ margin: 0 }}><strong>Noudettavissa {pickupWindow(listing.pickupStart, listing.pickupEnd)}</strong><span>{listing.pickupLocation}</span><span className="consumer-small">{orderingClosed(listing) ? "Tilausaika on päättynyt" : `Tilaa viimeistään ${dateTime(listing.orderDeadline)}`}</span></div>
                <div className="consumer-description">{listing.description}</div>
                <div className="consumer-price-row">
                  <div className="consumer-price">{money(getStartingPrice(listing))}<small>{listing.variants.some((variant) => variant.unitType === "whole_fish") ? "sis. ALV / kg alkaen" : "sis. ALV / pakkaus alkaen"}</small></div>
                  <button className="consumer-button consumer-primary" disabled={orderingClosed(listing)} onClick={() => openListing(listing)}>{orderingClosed(listing) ? "Tilausaika päättynyt" : "Varaa"}</button>
                </div>
              </div>
            </article>
          ))}
        </section>

        {user ? (
          <section className="consumer-orders">
            <div className="consumer-list-heading"><h2>Omat varaukset</h2><span>{orders.length}</span></div>
            {orders.length === 0 ? <div className="consumer-empty">Sinulla ei ole vielä varauksia.</div> : orders.map((order) => (
              <div className="consumer-order" key={order.id}>
                <div><strong>{order.product_name || order.species || "Kalaerä"}</strong><div className="consumer-small">{order.unit_count || order.package_count} × {order.variant_label || (order.sale_unit_type === "whole_fish" ? "kokonainen kala" : "pakkaus")} · {order.pickup_location || "Noutopaikka vahvistetaan"}</div></div>
                <div><strong>{money(order.total_including_vat)}</strong><div className="consumer-small">{order.status === "reserved" ? "Varattu" : order.status}</div></div>
              </div>
            ))}
          </section>
        ) : null}
      </main>

      {selected ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Varaa kalaerä" onMouseDown={(event) => { if (event.target === event.currentTarget) closeListing(); }}>
          <div className="consumer-dialog">
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Varaa noudettavaksi</div><h2>{selected.productName}</h2></div><button className="consumer-close" onClick={closeListing} aria-label="Sulje">×</button></div>
            <div className="consumer-summary"><span><strong>Kalastaja:</strong> {selected.sellerName}</span><span><strong>Nouto:</strong> {selected.pickupLocation || selected.municipality}</span><span><strong>Noudettavissa:</strong> {pickupWindow(selected.pickupStart, selected.pickupEnd)}</span><span><strong>Tilaa viimeistään:</strong> {dateTime(selected.orderDeadline)}</span><span><strong>Erätunnus:</strong> {selected.batchId}</span></div>
            <div className="consumer-form">
              <a className="consumer-button" href={getConsumerAppDeepLink(selected.id)} style={{ textAlign: "center", textDecoration: "none" }}>Avaa Suoraan Kalastajalta -sovelluksessa</a>
              <div className="consumer-field"><label>{selectedVariant?.unitType === "whole_fish" ? "Kalan kokoluokka" : "Pakkauskoko"}</label><select className="consumer-input" value={selectedVariant?.id || ""} onChange={(event) => { setSelectedVariantId(event.target.value); setUnitCount(1); }}>{selected.variants.filter((variant) => variant.availableUnits > 0).map((variant) => <option key={variant.id} value={variant.id}>{variant.label} · {variant.unitType === "whole_fish" ? `${variant.minWeightKg}–${variant.maxWeightKg} kg/kpl · ${money(variant.pricePerKg)}/kg` : `${variant.packageSizeKg} kg · ${money(variant.unitPrice)}`}</option>)}</select></div>
              <div className="consumer-field"><label>{selectedVariant?.unitType === "whole_fish" ? "Kalojen määrä" : "Pakkausten määrä"}</label><select className="consumer-input" value={unitCount} onChange={(event) => setUnitCount(Number(event.target.value))}>{Array.from({ length: Math.min(selectedVariant?.availableUnits || 0, 10) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {selectedVariant?.unitType === "whole_fish" ? "kpl" : "pakkausta"}</option>)}</select></div>
              <div className="consumer-field"><label>Varaajan nimi</label><input className="consumer-input" autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Etunimi ja sukunimi" /></div>
              <div className="consumer-field"><label>Puhelinnumero noutoa varten</label><input className="consumer-input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="040 123 4567" /></div>
              <div className="consumer-field"><label>Viesti kalastajalle (valinnainen)</label><textarea className="consumer-input" rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Esimerkiksi arvioitu noutoaika" /></div>
              {selectedVariant?.unitType === "whole_fish" ? <div className="consumer-summary"><span><strong>Arvioitu yhteispaino:</strong> noin {totals?.estimatedWeightKg.toLocaleString("fi-FI")} kg</span><span>Lopullinen paino ja hinta vahvistetaan punnituksen jälkeen.</span></div> : null}
              <div className="consumer-total"><span>{totals?.isEstimate ? "Arviohinta" : "Yhteensä"}</span><span>{money(totals?.grossTotal)}</span></div>
              <div className="consumer-small">Hinta sisältää arvonlisäveron. Maksu suoritetaan suoraan kalastajalle noudon yhteydessä. Varaus vähentää valitun pakkauskoon tai kalakokoluokan saldoa.</div>
              <button className="consumer-button consumer-primary" disabled={busy || !customerName.trim() || !phone.trim() || orderingClosed(selected)} onClick={submitReservation}>{orderingClosed(selected) ? "Tilausaika on päättynyt" : busy ? "Varataan…" : user ? "Vahvista varaus" : "Kirjaudu ja varaa"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {alertsOpen ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Kalaeräilmoitukset" onMouseDown={(event) => { if (event.target === event.currentTarget) setAlertsOpen(false); }}>
          <div className="consumer-dialog">
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Pysy ajan tasalla</div><h2>Ilmoita uusista kalaeristä</h2></div><button className="consumer-close" onClick={() => setAlertsOpen(false)} aria-label="Sulje">×</button></div>
            <p className="consumer-description">Valitse kala ja paikkakunta. Saat uudesta sopivasta erästä sähköpostin ja sovelluksessa myös push-ilmoituksen, jos ilmoitukset ovat käytössä.</p>
            <div className="consumer-form">
              <div className="consumer-field"><label>Kalalaji</label><select className="consumer-input" value={alertSpecies} onChange={(event) => setAlertSpecies(event.target.value)}><option value="">Kaikki kalalajit</option>{speciesOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="consumer-field"><label>Paikkakunta</label><select className="consumer-input" value={alertMunicipality} onChange={(event) => setAlertMunicipality(event.target.value)}><option value="">Kaikki paikkakunnat</option>{municipalityOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <button className="consumer-button consumer-primary" disabled={busy} onClick={async () => { if (!user) { setAlertsOpen(false); onOpenAuth({ subscribe: { species: alertSpecies, municipality: alertMunicipality } }); return; } const ok = await onSubscribe({ species: alertSpecies, municipality: alertMunicipality }); if (ok) setAlertsOpen(false); }}>{user ? "Tallenna ilmoitus" : "Kirjaudu tilaamaan ilmoitus"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
