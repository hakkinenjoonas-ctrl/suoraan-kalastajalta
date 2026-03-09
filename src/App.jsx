import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
const defaultAreas = ["Suur-Saimaa", "Pien-Saimaa", "Saimaa", "Muu vesialue"];
const fishingSpots = ["Kyläniemen pohjoispuoli", "Kyläniemen eteläpuoli", "Sammaljärven ok"];

function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSpeciesRow() {
  return { id: safeId(), species: "Muikku", kilos: "", count: "" };
}

function euro(value) {
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 16,
  },
  container: { maxWidth: 1180, margin: "0 auto" },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  headerCard: { padding: 20, marginBottom: 18 },
  sectionCard: { padding: 18 },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  rowBetween: {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 32, lineHeight: 1.1 },
  subtitle: { margin: "6px 0 0", color: "#475569", fontSize: 14 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#1e293b",
    fontSize: 14,
    border: "1px solid #cbd5e1",
  },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    background: "#fff",
    border: "1px solid #e2e8f0",
    padding: 8,
    borderRadius: 18,
    marginBottom: 16,
  },
  tabs4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    background: "#fff",
    border: "1px solid #e2e8f0",
    padding: 8,
    borderRadius: 18,
    marginBottom: 16,
  },
  tab: {
    border: 0,
    background: "transparent",
    padding: "12px 10px",
    borderRadius: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#0f172a",
  },
  activeTab: { background: "#0f172a", color: "#fff" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  metric: { fontSize: 34, fontWeight: 700, margin: "8px 0 0" },
  muted: { color: "#64748b", fontSize: 14 },
  progress: { height: 12, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" },
  progressFill: { display: "block", height: "100%", background: "#0f172a", borderRadius: 999 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fieldFull: { gridColumn: "1 / -1" },
  input: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    background: "#fff",
    font: "inherit",
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    background: "#fff",
    font: "inherit",
    minHeight: 96,
    resize: "vertical",
  },
  button: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 14,
    padding: "11px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButton: { background: "#0f172a", color: "#fff", borderColor: "#0f172a" },
  speciesBox: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    background: "#f8fafc",
    padding: 16,
  },
  speciesRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr 0.8fr auto",
    gap: 12,
    alignItems: "end",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 12,
  },
  entry: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
  },
  entryHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  entryBadges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  noticeError: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
  },
  noticeInfo: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  noticeSuccess: {
    padding: "12px 14px",
    borderRadius: 14,
    fontSize: 14,
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
  },
  small: { fontSize: 12, color: "#64748b" },
};

function responsiveGridStyle(base) {
  if (typeof window !== "undefined" && window.innerWidth < 960) {
    return { ...base, gridTemplateColumns: "1fr" };
  }
  return base;
}

function AuthView({ authMode, setAuthMode, authForm, setAuthForm, onSignIn, onSignUp, authError, authInfo }) {
  return (
    <div style={styles.app}>
      <div style={{ ...styles.container, maxWidth: 520 }}>
        <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
          <h1 style={styles.title}>Suoraan Kalastajalta</h1>
          <div style={{ ...styles.tabs4, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <button style={{ ...styles.tab, ...(authMode === "signin" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signin")}>Kirjaudu</button>
            <button style={{ ...styles.tab, ...(authMode === "signup" ? styles.activeTab : {}) }} onClick={() => setAuthMode("signup")}>Rekisteröidy</button>
          </div>

          <div style={styles.field}>
            <label>Sähköposti</label>
            <input
              style={styles.input}
              type="email"
              value={authForm.email}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="esim. nimi@yritys.fi"
            />
          </div>

          <div style={styles.field}>
            <label>Salasana</label>
            <input
              style={styles.input}
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="salasana"
            />
          </div>

          {authMode === "signup" && (
            <div style={styles.field}>
              <label>Nimi</label>
              <input
                style={styles.input}
                value={authForm.displayName}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="Esim. Joonas Häkkinen"
              />
            </div>
          )}

          {authError ? <div style={styles.noticeError}>{authError}</div> : null}
          {authInfo ? <div style={styles.noticeSuccess}>{authInfo}</div> : null}

          {authMode === "signin" ? (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignIn}>Kirjaudu sisään</button>
          ) : (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSignUp}>Luo tunnus</button>
          )}

          <div style={styles.small}>
            Järjestys: 1) lisää sähköposti allowed_users-listaan, 2) rekisteröidy tällä sähköpostilla, 3) kirjaudu sisään.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [entryScope, setEntryScope] = useState("own");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "" });
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [form, setForm] = useState({
    date: today(),
    area: "Suur-Saimaa",
    spot: "",
    gear: "Rysä",
    gearCount: "",
    destination: "Myyntiin",
    buyer: "",
    pricePerKg: "",
    notes: "",
  });
  const [speciesRows, setSpeciesRows] = useState([createSpeciesRow()]);
  const [newAllowedForm, setNewAllowedForm] = useState({ email: "", displayName: "", role: "member" });
  const [userMessage, setUserMessage] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      setLoading(false);
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setEntries([]);
      setAllowedUsers([]);
      return;
    }

    const ensureProfile = async () => {
      const email = session.user.email || "";

      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        setAuthError(profileError.message);
        return;
      }

      if (existingProfile) {
        setProfile(existingProfile);
        return;
      }

      const { data: allowed, error: allowedError } = await supabase
        .from("allowed_users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (allowedError && allowedError.code !== "PGRST116") {
        setAuthError(allowedError.message);
        return;
      }

      if (!allowed || !allowed.is_active) {
        setAuthError("Sähköpostia ei ole hyväksytty käyttöön.");
        await supabase.auth.signOut();
        return;
      }

      const { data: insertedProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email,
          display_name: allowed.display_name || session.user.user_metadata?.display_name || email,
          role: allowed.role || "member",
          is_active: allowed.is_active,
        })
        .select("*")
        .single();

      if (insertError) {
        setAuthError(insertError.message);
        return;
      }

      setProfile(insertedProfile);
    };

    ensureProfile();
  }, [session]);

  useEffect(() => {
    if (!profile) return;

    const loadData = async () => {
      setAuthError("");

      const entriesQuery = supabase
        .from("catch_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      const finalEntriesQuery =
        profile.role === "owner" && entryScope === "all"
          ? entriesQuery
          : entriesQuery.eq("owner_user_id", profile.id);

      const [{ data: entryData, error: entryError }, { data: allowedData, error: allowedError }] =
        await Promise.all([
          finalEntriesQuery,
          profile.role === "owner"
            ? supabase.from("allowed_users").select("*").order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (entryError) {
        setAuthError(entryError.message);
      } else {
        setEntries(
          (entryData || []).map((entry) => ({
            id: entry.id,
            date: entry.date,
            area: entry.area,
            spot: entry.spot || "",
            species: entry.species,
            kilos: Number(entry.kilos || 0),
            count: Number(entry.count || 0),
            gear: entry.gear,
            gearCount: Number(entry.gear_count || 0),
            destination: entry.destination,
            buyer: entry.buyer || "",
            pricePerKg: Number(entry.price_per_kg || 0),
            notes: entry.notes || "",
            ownerName: entry.owner_name,
          }))
        );
      }

      if (allowedError) {
        setAuthError(allowedError.message);
      } else {
        setAllowedUsers(allowedData || []);
      }
    };

    loadData();
  }, [profile, entryScope, refreshTick]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!q) return true;
      return [entry.species, entry.area, entry.spot, entry.gear, entry.destination, entry.buyer, entry.notes, entry.ownerName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [entries, search]);

  const totals = useMemo(() => {
    const totalKg = entries.reduce((sum, e) => sum + Number(e.kilos || 0), 0);
    const totalValue = entries.reduce((sum, e) => sum + Number(e.kilos || 0) * Number(e.pricePerKg || 0), 0);
    const totalGearCount = entries.reduce((sum, e) => sum + Number(e.gearCount || 0), 0);
    const catchPerGear = totalGearCount > 0 ? totalKg / totalGearCount : 0;
    const forSaleKg = entries
      .filter((e) => ["Myyntiin", "Tukkuun", "Jalostukseen"].includes(e.destination))
      .reduce((sum, e) => sum + Number(e.kilos || 0), 0);

    const speciesSummary = fishSpecies
      .map((species) => ({
        species,
        kilos: entries.filter((e) => e.species === species).reduce((sum, e) => sum + Number(e.kilos || 0), 0),
      }))
      .filter((item) => item.kilos > 0)
      .sort((a, b) => b.kilos - a.kilos);

    const spotSummaryMap = entries.reduce((acc, entry) => {
      const key = entry.spot || "Ei valittu";
      if (!acc[key]) acc[key] = { spot: key, kilos: 0, value: 0, entries: 0 };
      acc[key].kilos += Number(entry.kilos || 0);
      acc[key].value += Number(entry.kilos || 0) * Number(entry.pricePerKg || 0);
      acc[key].entries += 1;
      return acc;
    }, {});

    return {
      totalKg,
      totalValue,
      forSaleKg,
      catchPerGear,
      speciesSummary,
      spotSummary: Object.values(spotSummaryMap).sort((a, b) => b.kilos - a.kilos),
    };
  }, [entries]);

  const addSpeciesRow = () => setSpeciesRows((prev) => [...prev, createSpeciesRow()]);
  const updateSpeciesRow = (id, field, value) =>
    setSpeciesRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  const removeSpeciesRow = (id) =>
    setSpeciesRows((prev) => (prev.length === 1 ? [createSpeciesRow()] : prev.filter((row) => row.id !== id)));
  const duplicateSpeciesRow = (id) =>
    setSpeciesRows((prev) => {
      const row = prev.find((item) => item.id === id);
      if (!row) return prev;
      const copy = { ...row, id: safeId() };
      const index = prev.findIndex((item) => item.id === id);
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });

  const handleSignIn = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthError("Väärä sähköposti tai salasana – tai käyttäjää ei ole vielä rekisteröity.");
    }
  };

  const handleSignUp = async () => {
    setAuthError("");
    setAuthInfo("");
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;
    const displayName = authForm.displayName.trim();

    if (!email || !password || !displayName) {
      setAuthError("Täytä sähköposti, salasana ja nimi.");
      return;
    }

    const { data: allowed, error: allowedError } = await supabase
      .from("allowed_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (allowedError && allowedError.code !== "PGRST116") {
      setAuthError(allowedError.message);
      return;
    }

    if (!allowed || !allowed.is_active) {
      setAuthError("Tätä sähköpostia ei ole vielä lisätty sallittuihin käyttäjiin.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthInfo("Tunnus luotu. Kirjaudu nyt sisään.");
    setAuthMode("signin");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const handleCreateAllowedUser = async () => {
    if (!profile || profile.role !== "owner") return;

    setUserMessage("");
    const email = newAllowedForm.email.trim().toLowerCase();
    const displayName = newAllowedForm.displayName.trim();

    if (!email || !displayName) {
      setUserMessage("Täytä sähköposti ja nimi.");
      return;
    }

    const { error } = await supabase.from("allowed_users").insert({
      email,
      display_name: displayName,
      role: newAllowedForm.role === "owner" ? "owner" : "member",
      is_active: true,
    });

    if (error) {
      setUserMessage(error.message);
      return;
    }

    setNewAllowedForm({ email: "", displayName: "", role: "member" });
    setUserMessage(`Sallittu käyttäjä ${displayName} lisätty.`);
    setRefreshTick((prev) => prev + 1);
  };

  const toggleAllowedUserActive = async (row) => {
    const { error } = await supabase
      .from("allowed_users")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      setUserMessage(error.message);
      return;
    }

    setRefreshTick((prev) => prev + 1);
  };

  const handleSave = async () => {
    if (!profile) return;

    const validRows = speciesRows.filter((row) => Number(row.kilos || 0) > 0);
    if (!validRows.length) return;

    setSaving(true);
    const timestamp = new Date().toISOString();

    const payload = validRows.map((row) => ({
      date: form.date,
      area: form.area,
      spot: form.spot,
      species: row.species,
      kilos: Number(row.kilos || 0),
      count: Number(row.count || 0),
      gear: form.gear,
      gear_count: Number(form.gearCount || 0),
      destination: form.destination,
      buyer: form.buyer,
      price_per_kg: Number(form.pricePerKg || defaultFishPrices[row.species] || 0),
      notes: form.notes,
      batch_id: timestamp,
      owner_user_id: profile.id,
      owner_name: profile.display_name,
    }));

    const { error } = await supabase.from("catch_entries").insert(payload);
    setSaving(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setForm((prev) => ({ ...prev, buyer: "", pricePerKg: "", notes: "", date: today() }));
    setSpeciesRows([createSpeciesRow()]);
    setRefreshTick((prev) => prev + 1);
    setActiveTab("entries");
  };

  if (loading) {
    return (
      <div style={styles.app}>
        <div style={styles.container}>
          <div style={{ ...styles.card, ...styles.sectionCard }}>Ladataan...</div>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <AuthView
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        authError={authError}
        authInfo={authInfo}
      />
    );
  }

  const tabStyle = profile.role === "owner" ? styles.tabs : styles.tabs4;
  const grid3 = responsiveGridStyle(styles.grid3);
  const grid2 = responsiveGridStyle(styles.grid2);
  const formGrid = responsiveGridStyle(styles.formGrid);
  const speciesRow = responsiveGridStyle(styles.speciesRow);

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.headerCard }}>
          <div style={styles.rowBetween}>
            <div>
              <h1 style={styles.title}>Suoraan Kalastajalta</h1>
              <p style={styles.subtitle}>
                Kirjautunut: <strong>{profile.display_name}</strong> · rooli: {profile.role === "owner" ? "omistaja" : "käyttäjä"}
              </p>
            </div>

            <div style={styles.toolbar}>
              {profile.role === "owner" ? (
                <select style={styles.input} value={entryScope} onChange={(e) => setEntryScope(e.target.value)}>
                  <option value="own">Näytä vain omat</option>
                  <option value="all">Näytä kaikkien saaliit</option>
                </select>
              ) : null}
              <span style={styles.badge}>{totals.totalKg.toFixed(1)} kg yhteensä</span>
              <span style={styles.badge}>{euro(totals.totalValue)} arvo</span>
              <span style={styles.badge}>{totals.catchPerGear.toFixed(1)} kg / pyydys</span>
              <button style={styles.button} onClick={() => setRefreshTick((prev) => prev + 1)}>Päivitä</button>
              <button style={styles.button} onClick={handleLogout}>Kirjaudu ulos</button>
            </div>
          </div>
        </div>

        {authError ? <div style={{ ...styles.noticeError, marginBottom: 16 }}>{authError}</div> : null}

        <div style={tabStyle}>
          <button style={{ ...styles.tab, ...(activeTab === "dashboard" ? styles.activeTab : {}) }} onClick={() => setActiveTab("dashboard")}>Yhteenveto</button>
          <button style={{ ...styles.tab, ...(activeTab === "add" ? styles.activeTab : {}) }} onClick={() => setActiveTab("add")}>Lisää saalis</button>
          <button style={{ ...styles.tab, ...(activeTab === "entries" ? styles.activeTab : {}) }} onClick={() => setActiveTab("entries")}>Saaliit</button>
          <button style={{ ...styles.tab, ...(activeTab === "future" ? styles.activeTab : {}) }} onClick={() => setActiveTab("future")}>Laajennus</button>
          {profile.role === "owner" ? (
            <button style={{ ...styles.tab, ...(activeTab === "users" ? styles.activeTab : {}) }} onClick={() => setActiveTab("users")}>Käyttäjät</button>
          ) : null}
        </div>

        {activeTab === "dashboard" && (
          <div style={styles.stack}>
            <div style={grid3}>
              <div style={{ ...styles.card, ...styles.sectionCard }}>
                <div style={styles.metric}>{totals.totalKg.toFixed(1)} kg</div>
                <div style={styles.muted}>Kokonaissaalis</div>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard }}>
                <div style={styles.metric}>{euro(totals.totalValue)}</div>
                <div style={styles.muted}>Arvioitu myyntiarvo</div>
              </div>
              <div style={{ ...styles.card, ...styles.sectionCard }}>
                <div style={styles.metric}>{totals.forSaleKg.toFixed(1)} kg</div>
                <div style={styles.muted}>Myytävissä / jalostukseen</div>
              </div>
            </div>

            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Lajikohtainen yhteenveto</strong>
              {totals.speciesSummary.length === 0 ? (
                <div style={styles.muted}>Ei vielä saalistietoja.</div>
              ) : (
                totals.speciesSummary.map((item) => (
                  <div key={item.species} style={{ ...styles.stack, gap: 6 }}>
                    <div style={styles.rowBetween}>
                      <span>{item.species}</span>
                      <span>{item.kilos.toFixed(1)} kg</span>
                    </div>
                    <div style={styles.progress}>
                      <span
                        style={{
                          ...styles.progressFill,
                          width: `${Math.max((item.kilos / Math.max(totals.totalKg, 1)) * 100, 4)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "add" && (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={formGrid}>
              <div style={styles.field}>
                <label>Päivämäärä</label>
                <input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>

              <div style={styles.field}>
                <label>Vesialue</label>
                <select style={styles.input} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                  {defaultAreas.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label>Pyyntipaikka</label>
                <select style={styles.input} value={form.spot} onChange={(e) => setForm({ ...form, spot: e.target.value })}>
                  <option value="">Valitse pyyntipaikka</option>
                  {fishingSpots.map((spot) => (
                    <option key={spot} value={spot}>{spot}</option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label>Kirjaaja</label>
                <input style={styles.input} value={profile.display_name} disabled />
              </div>

              <div style={{ ...styles.field, ...styles.fieldFull, ...styles.speciesBox, ...styles.stack }}>
                <div style={styles.rowBetween}>
                  <div>
                    <label>Kalalajit samasta tarkastuskerrasta</label>
                    <div style={styles.small}>Lisää yhdellä kertaa kaikki lajit, jotka tulivat samoista pyydyksistä.</div>
                  </div>
                  <button style={styles.button} type="button" onClick={addSpeciesRow}>Lisää laji</button>
                </div>

                {speciesRows.map((row, index) => (
                  <div key={row.id} style={speciesRow}>
                    <div style={styles.field}>
                      <label>Laji {index + 1}</label>
                      <select style={styles.input} value={row.species} onChange={(e) => updateSpeciesRow(row.id, "species", e.target.value)}>
                        {fishSpecies.map((species) => (
                          <option key={species} value={species}>{species}</option>
                        ))}
                      </select>
                    </div>

                    <div style={styles.field}>
                      <label>Kg</label>
                      <input style={styles.input} type="number" placeholder="0" value={row.kilos} onChange={(e) => updateSpeciesRow(row.id, "kilos", e.target.value)} />
                    </div>

                    <div style={styles.field}>
                      <label>Kpl</label>
                      <input style={styles.input} type="number" placeholder="0" value={row.count} onChange={(e) => updateSpeciesRow(row.id, "count", e.target.value)} />
                    </div>

                    <div style={styles.row}>
                      <button style={styles.button} type="button" onClick={() => duplicateSpeciesRow(row.id)}>Kopioi</button>
                      <button style={styles.button} type="button" onClick={() => removeSpeciesRow(row.id)}>Poista</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.field}>
                <label>Pyydys</label>
                <select style={styles.input} value={form.gear} onChange={(e) => setForm({ ...form, gear: e.target.value })}>
                  {gearTypes.map((gear) => (
                    <option key={gear} value={gear}>{gear}</option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label>Pyydysten määrä</label>
                <input style={styles.input} type="number" placeholder="Esim. 4" value={form.gearCount} onChange={(e) => setForm({ ...form, gearCount: e.target.value })} />
              </div>

              <div style={styles.field}>
                <label>Käyttötarkoitus</label>
                <select style={styles.input} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}>
                  {destinations.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label>Ostaja</label>
                <input style={styles.input} placeholder="Esim. Forelli / tukku" value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
              </div>

              <div style={styles.field}>
                <label>Hinta €/kg</label>
                <input style={styles.input} type="number" placeholder="Tyhjä = oletushinta" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} />
              </div>

              <div style={{ ...styles.field, ...styles.fieldFull }}>
                <label>Lisätiedot</label>
                <textarea style={styles.textarea} placeholder="Esim. laatu, jäähdytys, toimitus, huomioita" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div style={{ ...styles.row, justifyContent: "flex-end" }}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave} disabled={saving}>
                {saving ? "Tallennetaan..." : "Tallenna saalis"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "entries" && (
          <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
            <div style={styles.rowBetween}>
              <strong>{profile.role === "owner" && entryScope === "all" ? "Kaikkien saaliit" : "Omat saaliit"}</strong>
              <input style={{ ...styles.input, maxWidth: 360 }} placeholder="Hae lajilla, paikalla, pyydyksellä..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {filteredEntries.length === 0 ? (
              <div style={styles.muted}>Ei hakutuloksia.</div>
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} style={styles.entry}>
                  <div style={styles.entryHeader}>
                    <div>
                      <div style={styles.entryBadges}>
                        <span style={styles.badge}>{entry.species}</span>
                        <span style={styles.badge}>{entry.kilos} kg</span>
                        <span style={styles.badge}>{entry.gear}</span>
                        {entry.gearCount > 0 ? <span style={styles.badge}>{entry.gearCount} pyydystä</span> : null}
                        {entry.gearCount > 0 ? <span style={styles.badge}>{(Number(entry.kilos || 0) / Number(entry.gearCount)).toFixed(1)} kg / pyydys</span> : null}
                        <span style={styles.badge}>{entry.destination}</span>
                        <span style={styles.badge}>{entry.ownerName}</span>
                      </div>

                      <div style={styles.muted}>{entry.date} · {entry.area}{entry.spot ? ` / ${entry.spot}` : ""}</div>
                      <div style={styles.muted}>Ostaja: {entry.buyer || "-"} · Arvo: {euro(Number(entry.kilos || 0) * Number(entry.pricePerKg || 0))}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "future" && (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Seuraavat ominaisuudet</strong>
              <div>• Tukku-näkymä: ostajat näkevät myytävissä olevan kalan.</div>
              <div>• Kauppapaikka: ilmoitus “myydään 120 kg haukea”.</div>
              <div>• Karttanäkymä pyyntipaikoista.</div>
              <div>• Excel- ja PDF-raportit.</div>
              <div>• Hälytykset ja ilmoitukset tukuista.</div>
            </div>

            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Miten tämä toimii nyt</strong>
              <div>1. Owner lisää sallitut sähköpostit Käyttäjät-välilehdellä.</div>
              <div>2. Käyttäjä rekisteröityy omalla sähköpostilla ja salasanalla.</div>
              <div>3. Kaikki käyttävät samaa yhteistä tietokantaa eri laitteilla.</div>
              <div>4. Owner voi katsoa kaikkien saaliit.</div>
              <div>5. Tavallinen käyttäjä näkee vain omat kirjauksensa.</div>
            </div>
          </div>
        )}

        {activeTab === "users" && profile.role === "owner" && (
          <div style={grid2}>
            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <div style={styles.noticeInfo}>Lisää tähän kollegan sähköposti. Sen jälkeen hän voi rekisteröityä itse omalla salasanallaan.</div>

              <div style={styles.field}>
                <label>Nimi</label>
                <input style={styles.input} value={newAllowedForm.displayName} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Esim. Antti Kalastaja" />
              </div>

              <div style={styles.field}>
                <label>Sähköposti</label>
                <input style={styles.input} type="email" value={newAllowedForm.email} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="esim. antti@yritys.fi" />
              </div>

              <div style={styles.field}>
                <label>Rooli</label>
                <select style={styles.input} value={newAllowedForm.role} onChange={(e) => setNewAllowedForm((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="member">Käyttäjä</option>
                  <option value="owner">Omistaja</option>
                </select>
              </div>

              {userMessage ? <div style={styles.noticeSuccess}>{userMessage}</div> : null}

              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleCreateAllowedUser}>Lisää sallittuihin</button>
            </div>

            <div style={{ ...styles.card, ...styles.sectionCard, ...styles.stack }}>
              <strong>Käyttäjähallinta</strong>

              {allowedUsers.length === 0 ? (
                <div style={styles.muted}>Ei vielä sallittuja käyttäjiä.</div>
              ) : (
                allowedUsers.map((user) => (
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

                      <button style={styles.button} onClick={() => toggleAllowedUserActive(user)}>
                        {user.is_active ? "Poista käytöstä" : "Aktivoi"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
