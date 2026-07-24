export const AUCTION_DURATION_OPTIONS = Object.freeze([
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 tunti" },
  { minutes: 180, label: "3 tuntia" },
  { minutes: 360, label: "6 tuntia" },
  { minutes: 720, label: "12 tuntia" },
  { minutes: 1440, label: "24 tuntia" },
]);

export const AUCTION_EXTENSION_MINUTES = 3;

export function extractAuctionAdditionalNotes(notes) {
  const userWrittenPart = String(notes || "")
    .split(/(?:^|\n)(?:Pyydyksen ja saaliin lisätiedot|Pyydyksen lisätiedot):\s*\n/i, 1)[0]
    .trim();

  if (!userWrittenPart) return "";

  const cleaned = [];
  let inSpeciesBlock = false;
  for (const rawLine of userWrittenPart.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "Erän lajit:") {
      inSpeciesBlock = true;
      continue;
    }
    if (line === "Toimitus:") {
      inSpeciesBlock = false;
      continue;
    }
    if (inSpeciesBlock) continue;
    if (
      line.startsWith("Hinta:") ||
      line.startsWith("Hinta ALV 0 %") ||
      line.startsWith("Hinta sis. ALV") ||
      line === "Kilpailuta kuljetus: Ei" ||
      line.startsWith("Toimitustapa:") ||
      line.startsWith("Toimitusalue:") ||
      line.startsWith("Noutopaikka:") ||
      line.startsWith("Toimituskustannus:") ||
      line.startsWith("Aikaisin toimitus:") ||
      line.startsWith("Kylmäkuljetus:") ||
      line.startsWith("Kaupallisen kalastajan tunnus:") ||
      line.startsWith("Paikkakunta:")
    ) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

export function normalizeAuctionMoney(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export function validateAuctionDraft(draft) {
  const durationMinutes = Number(draft?.durationMinutes);
  const startingPrice = normalizeAuctionMoney(draft?.startingPrice);
  const minimumIncrement = normalizeAuctionMoney(draft?.minimumIncrement);
  const reservePrice = draft?.reservePrice === "" || draft?.reservePrice == null
    ? null
    : normalizeAuctionMoney(draft.reservePrice);

  if (!String(draft?.entryId || "").trim()) return "Valitse huutokaupattava kalaerä.";
  if (!AUCTION_DURATION_OPTIONS.some((option) => option.minutes === durationMinutes)) return "Valitse sallittu huutokaupan kesto.";
  if (startingPrice == null || startingPrice <= 0) return "Anna lähtöhinta, joka on suurempi kuin nolla.";
  if (minimumIncrement == null || minimumIncrement <= 0) return "Anna minimikorotus, joka on suurempi kuin nolla.";
  if (reservePrice != null && reservePrice < startingPrice) return "Pohjahinta ei voi olla lähtöhintaa pienempi.";
  return "";
}

export function minimumNextBid(auction) {
  const current = Number(auction?.current_price_per_kg ?? auction?.starting_price_per_kg ?? 0);
  const increment = Number(auction?.minimum_increment ?? 0);
  return Math.round((current + increment) * 100) / 100;
}

export function getAuctionRemainingMs(auction, now = Date.now()) {
  const endAt = Date.parse(auction?.effective_end_at || auction?.ends_at || "");
  return Number.isFinite(endAt) ? Math.max(0, endAt - now) : 0;
}

export function formatAuctionRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function auctionStatusLabel(status) {
  if (status === "scheduled") return "Ajastettu";
  if (status === "open") return "Käynnissä";
  if (status === "sold") return "Myyty";
  if (status === "unsold") return "Ei myyty";
  if (status === "cancelled") return "Peruttu";
  return status || "-";
}
