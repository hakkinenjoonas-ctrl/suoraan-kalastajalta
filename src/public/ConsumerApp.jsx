import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import ConsumerMarketplaceView from "../components/ConsumerMarketplaceView.jsx";
import {
  getRequestedConsumerListingId,
  normalizeConsumerListing,
} from "../lib/consumerMarketplace.js";
import { supabase } from "../lib/supabase.js";
import { fetchPublicConsumerListings, invokeConsumerOrderAction } from "../services/edgeFunctions.js";

const TERMS_URL = "https://www.suoraankalastajalta.fi/tietosuojaseloste-ja-k%C3%A4ytt%C3%B6ehdot";
const GOOGLE_PLAY_URL = String(import.meta.env?.VITE_GOOGLE_PLAY_URL || "https://play.google.com/store/apps/details?id=fi.suoraankalastajalta.app").trim();
const CONFIGURED_APP_STORE_URL = String(import.meta.env?.VITE_APP_STORE_URL || "").trim();
const APP_STORE_SEARCH_URL = "https://apps.apple.com/fi/search?term=Suoraan%20Kalastajalta";

export default function ConsumerApp({ initialListingId = "" }) {
  const requestedListingId = initialListingId || getRequestedConsumerListingId();
  const [session, setSession] = useState(null);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", acceptedTerms: false });
  const [authError, setAuthError] = useState("");
  const [installPromptOpen, setInstallPromptOpen] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    const result = await fetchPublicConsumerListings();
    if (result.error) {
      setError("Kalaerien hakeminen epäonnistui. Yritä hetken kuluttua uudelleen.");
      setListings([]);
    } else {
      setListings((result.data?.listings || []).map(normalizeConsumerListing));
      setError("");
    }
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async (activeSession) => {
    if (!activeSession?.user) {
      setOrders([]);
      return;
    }
    const { data, error: ordersError } = await supabase
      .from("consumer_orders")
      .select("id, listing_id, variant_id, status, sale_unit_type, variant_label, unit_count, package_count, estimated_weight_kg, total_including_vat, created_at, consumer_listings(product_name, species, pickup_location)")
      .order("created_at", { ascending: false });
    if (!ordersError) {
      setOrders((data || []).map((order) => ({ ...order, ...(order.consumer_listings || {}) })));
    }
  }, []);

  const ensureConsumerAccount = useCallback(async (activeSession) => {
    if (!activeSession?.user?.id) return false;
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", activeSession.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (existingProfile && existingProfile.role !== "consumer") {
      throw new Error("Tämä tunnus kuuluu palvelun yritys- tai kalastajapuolelle. Kuluttajavarauksiin tarvitaan erillinen kuluttajatunnus.");
    }
    if (!existingProfile) {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: activeSession.user.id,
        email: String(activeSession.user.email || "").trim().toLowerCase(),
        display_name: String(activeSession.user.user_metadata?.display_name || activeSession.user.email || "Kuluttaja").trim(),
        role: "consumer",
        is_active: true,
      });
      if (insertError) throw insertError;
    }
    return true;
  }, []);

  useEffect(() => {
    void loadListings();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      void loadOrders(data.session || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      void loadOrders(nextSession || null);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadListings, loadOrders]);

  const openAuth = () => {
    setAuthError("");
    setAuthOpen(true);
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    setAuthError("");
    const email = authForm.email.trim().toLowerCase();
    try {
      if (authMode === "signin") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: authForm.password });
        if (signInError) throw signInError;
        await ensureConsumerAccount(data.session);
        setSession(data.session || null);
        setAuthOpen(false);
        setMessage("Kirjautuminen onnistui. Voit nyt vahvistaa varauksen.");
      } else {
        if (!authForm.name.trim() || !authForm.acceptedTerms) {
          throw new Error("Täytä nimi ja hyväksy käyttöehdot.");
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: authForm.password,
          options: { data: { display_name: authForm.name.trim(), requested_role: "consumer", legal_terms_version: "2026-07-22", legal_terms_accepted_at: new Date().toISOString() } },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          await ensureConsumerAccount(data.session);
          setSession(data.session);
          setAuthOpen(false);
          setMessage("Tunnus luotiin. Voit nyt vahvistaa varauksen.");
        } else {
          setAuthMode("signin");
          setMessage("Tunnus luotiin. Vahvista sähköpostiosoite ja kirjaudu sen jälkeen.");
        }
      }
    } catch (authFailure) {
      setAuthError(String(authFailure?.message || authFailure || "Kirjautuminen epäonnistui."));
    } finally {
      setBusy(false);
    }
  };

  const reserve = async ({ listing, variant, unitCount, phone, note }) => {
    if (!session?.access_token) {
      openAuth();
      return false;
    }
    setBusy(true);
    setError("");
    try {
      await ensureConsumerAccount(session);
    } catch (accountError) {
      setError(String(accountError?.message || accountError));
      setBusy(false);
      return false;
    }
    const result = await invokeConsumerOrderAction(session.access_token, { action: "reserve", listingId: listing.id, variantId: variant.id, unitCount, phone, note });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Varaus epäonnistui.");
      return false;
    }
    setMessage("Kalaerä on varattu. Kalastaja saa varauksesta tiedon.");
    await Promise.all([loadListings(), loadOrders(session)]);
    if (!Capacitor.isNativePlatform()) setInstallPromptOpen(true);
    return true;
  };

  const subscribe = async ({ species, municipality }) => {
    if (!session?.access_token) {
      openAuth();
      return false;
    }
    setBusy(true);
    try {
      await ensureConsumerAccount(session);
    } catch (accountError) {
      setError(String(accountError?.message || accountError));
      setBusy(false);
      return false;
    }
    const result = await invokeConsumerOrderAction(session.access_token, { action: "subscribe", species, municipality });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Ilmoituksen tallennus epäonnistui.");
      return false;
    }
    setMessage("Kalaeräilmoitus tallennettiin.");
    return true;
  };

  return (
    <>
      <ConsumerMarketplaceView
        listings={listings}
        orders={orders}
        loading={loading}
        error={error}
        user={session?.user || null}
        initialListingId={requestedListingId}
        busy={busy}
        message={message}
        onOpenAuth={openAuth}
        onSignOut={() => supabase.auth.signOut()}
        onReserve={reserve}
        onSubscribe={subscribe}
      />
      {authOpen ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Kuluttajan kirjautuminen">
          <form className="consumer-dialog consumer-form" onSubmit={submitAuth}>
            <div className="consumer-dialog-head"><div><div className="consumer-kicker">Varausta varten</div><h2>{authMode === "signin" ? "Kirjaudu" : "Luo kuluttajatunnus"}</h2></div><button type="button" className="consumer-close" onClick={() => setAuthOpen(false)}>×</button></div>
            <div className="consumer-field"><label>Sähköposti</label><input className="consumer-input" type="email" required value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} /></div>
            {authMode === "signup" ? <div className="consumer-field"><label>Nimi</label><input className="consumer-input" required value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} /></div> : null}
            <div className="consumer-field"><label>Salasana</label><input className="consumer-input" type="password" minLength="8" required value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} /></div>
            {authMode === "signup" ? <label className="consumer-small"><input type="checkbox" checked={authForm.acceptedTerms} onChange={(event) => setAuthForm((current) => ({ ...current, acceptedTerms: event.target.checked }))} /> Hyväksyn <a href={TERMS_URL} target="_blank" rel="noreferrer">käyttöehdot ja tietosuojaselosteen</a>.</label> : null}
            {authError ? <div className="consumer-notice">{authError}</div> : null}
            <button className="consumer-button consumer-primary" disabled={busy}>{busy ? "Odota…" : authMode === "signin" ? "Kirjaudu" : "Luo tunnus"}</button>
            <button type="button" className="consumer-button" onClick={() => { setAuthError(""); setAuthMode((current) => current === "signin" ? "signup" : "signin"); }}>{authMode === "signin" ? "Ei tunnusta? Rekisteröidy" : "Onko sinulla jo tunnus? Kirjaudu"}</button>
          </form>
        </div>
      ) : null}
      {installPromptOpen ? (
        <div className="consumer-overlay" role="dialog" aria-modal="true" aria-label="Jatka sovelluksessa" onMouseDown={(event) => { if (event.target === event.currentTarget) setInstallPromptOpen(false); }}>
          <div className="consumer-dialog consumer-form">
            <div className="consumer-dialog-head">
              <div><div className="consumer-kicker">Varaus onnistui</div><h2>Jatka samalla tilillä sovelluksessa</h2></div>
              <button type="button" className="consumer-close" onClick={() => setInstallPromptOpen(false)} aria-label="Sulje">×</button>
            </div>
            <p className="consumer-description">Kirjaudu sovellukseen samalla sähköpostilla ja salasanalla. Näet varauksesi ja saat puhelimeen ilmoitukset uusista kiinnostavista kalaeristä.</p>
            <a className="consumer-button consumer-primary" href={GOOGLE_PLAY_URL} target="_blank" rel="noreferrer" style={{ textAlign: "center", textDecoration: "none" }}>Lataa Google Playsta</a>
            <a className="consumer-button" href={CONFIGURED_APP_STORE_URL || APP_STORE_SEARCH_URL} target="_blank" rel="noreferrer" style={{ textAlign: "center", textDecoration: "none" }}>{CONFIGURED_APP_STORE_URL ? "Lataa App Storesta" : "Etsi App Storesta"}</a>
            {!CONFIGURED_APP_STORE_URL ? <div className="consumer-small">Suora App Store -latauslinkki korvaa hakulinkin automaattisesti, kun App Storen sovellustunnus lisätään julkaisuasetuksiin.</div> : null}
            <button type="button" className="consumer-button" onClick={() => setInstallPromptOpen(false)}>Jatka selaimessa</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
