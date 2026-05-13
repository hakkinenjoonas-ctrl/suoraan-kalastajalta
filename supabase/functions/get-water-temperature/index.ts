import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

type WaterTemperatureRequest = {
  fishingArea?: string;
  fishingMunicipality?: string;
  latitude?: number;
  longitude?: number;
};

type Coordinates = {
  lat: number;
  lon: number;
};

type ObservationCandidate = {
  waterTemperatureC: number;
  stationName: string;
  stationLatitude: number;
  stationLongitude: number;
  observedAt: string;
};

type SykePlaceCandidate = {
  id: string;
  name: string;
  municipality: string;
  lat: number;
  lon: number;
};

const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_STATION_DISTANCE_KM = 50;

const fishingAreaCoordinates: Record<string, Coordinates> = {
  "Saimaa|Kyläniemi": { lat: 61.24, lon: 28.2 },
  "Saimaa|Lappeenranta": { lat: 61.0587, lon: 28.1887 },
  "Saimaa|Taipalsaari": { lat: 61.166, lon: 28.061 },
  "Saimaa|Lauritsala": { lat: 61.0587, lon: 28.286 },
  "Pien-Saimaa|Lappeenranta": { lat: 61.12, lon: 28.05 },
  "Päijänne|Sysmä": { lat: 61.5, lon: 25.68 },
  "Kallavesi|Kuopio": { lat: 62.8949, lon: 27.6782 },
  "Oulujärvi|Kajaani": { lat: 64.2841, lon: 27.7285 },
  "Inarijärvi|Inari": { lat: 68.9056, lon: 27.0286 },
  "Saimaa|": { lat: 61.25, lon: 28.08 },
  "Pien-Saimaa|": { lat: 61.12, lon: 28.05 },
  "Päijänne|": { lat: 61.5, lon: 25.68 },
  "Kallavesi|": { lat: 62.8949, lon: 27.6782 },
  "Oulujärvi|": { lat: 64.2841, lon: 27.7285 },
  "Inarijärvi|": { lat: 68.9056, lon: 27.0286 },
  "|Lappeenranta": { lat: 61.0587, lon: 28.1887 },
  "|Taipalsaari": { lat: 61.166, lon: 28.061 },
  "|Lauritsala": { lat: 61.0587, lon: 28.286 },
  "|Kuopio": { lat: 62.8949, lon: 27.6782 },
  "|Kajaani": { lat: 64.2273, lon: 27.7285 },
  "|Inari": { lat: 68.9056, lon: 27.0286 },
  "|Sysmä": { lat: 61.5004, lon: 25.6848 },
};

function normalizePart(value: unknown) {
  return safeString(value);
}

function buildAreaKey(area: unknown, municipality: unknown) {
  return `${normalizePart(area)}|${normalizePart(municipality)}`;
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function escapeODataString(value: string) {
  return value.replace(/'/g, "''");
}

function getCollectionItems(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.value)) return root.value as Array<Record<string, unknown>>;
  const d = root.d as Record<string, unknown> | undefined;
  if (Array.isArray(d?.results)) return d.results as Array<Record<string, unknown>>;
  return [];
}

function haversineKm(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const earthRadiusKm = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function isFreshObservation(observedAt: string) {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= MAX_OBSERVATION_AGE_MS;
}

function extractLatLon(record: Record<string, unknown>): Coordinates | null {
  const latCandidates = [
    record.latitude,
    record.lat,
    record.Latitude,
    record.Lat,
    record.WGS84Latitude,
    record.Wgs84Latitude,
    record.Leveysaste,
  ];
  const lonCandidates = [
    record.longitude,
    record.lon,
    record.lng,
    record.Longitude,
    record.Lon,
    record.WGS84Longitude,
    record.Wgs84Longitude,
    record.Pituusaste,
  ];

  for (const latValue of latCandidates) {
    const lat = toNumber(latValue);
    if (lat == null || Math.abs(lat) > 90) continue;
    for (const lonValue of lonCandidates) {
      const lon = toNumber(lonValue);
      if (lon == null || Math.abs(lon) > 180) continue;
      return { lat, lon };
    }
  }

  return null;
}

function extractSykePlaceId(record: Record<string, unknown>) {
  const keys = [
    "Paikka_Id",
    "PaikkaID",
    "PaikkaId",
    "PaikkaNro",
    "PaikkaNumero",
    "Id",
    "ID",
    "id",
  ];
  for (const key of keys) {
    const value = safeString(record[key]);
    if (value) return value;
  }
  return "";
}

function extractSykePlaceName(record: Record<string, unknown>) {
  return (
    findStringValue(record, ["Nimi", "PaikkaNimi", "name", "station"]) ||
    "Tuntematon mittauspiste"
  );
}

function extractSykeMunicipality(record: Record<string, unknown>) {
  return findStringValue(record, ["Kunta", "KuntaNimi", "municipality", "kunta"]);
}

function extractSykeObservationPlaceId(record: Record<string, unknown>) {
  const keys = [
    "Paikka_Id",
    "PaikkaID",
    "PaikkaId",
    "PaikkaNro",
    "PaikkaNumero",
    "Paikka",
    "paikkaId",
    "placeId",
  ];
  for (const key of keys) {
    const value = safeString(record[key]);
    if (value) return value;
  }
  return "";
}

function extractSykeTemperature(record: Record<string, unknown>) {
  const directKeys = [
    "LampoPintavesi",
    "Lampo",
    "Lämpötila",
    "Arvo",
    "Value",
    "value",
  ];
  for (const key of directKeys) {
    const numeric = findNumericValue(record[key]);
    if (numeric != null) return numeric;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!/(lampo|lämpö|temp|arvo|value)/i.test(key)) continue;
    const numeric = findNumericValue(value);
    if (numeric != null) return numeric;
  }

  return null;
}

function resolveCoordinates(body: WaterTemperatureRequest) {
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  if (latitude != null && longitude != null) {
    return { lat: latitude, lon: longitude };
  }

  const area = normalizePart(body.fishingArea);
  const municipality = normalizePart(body.fishingMunicipality);
  return (
    fishingAreaCoordinates[buildAreaKey(area, municipality)] ||
    fishingAreaCoordinates[buildAreaKey(area, "")] ||
    fishingAreaCoordinates[buildAreaKey("", municipality)] ||
    null
  );
}

async function fetchWithTimeout(url: string, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function findNumericValue(source: unknown): number | null {
  if (source == null) return null;
  if (typeof source === "number") return Number.isFinite(source) ? source : null;
  if (typeof source === "string") {
    const normalized = source.replace(",", ".").trim();
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      const numeric = findNumericValue(item);
      if (numeric != null) return numeric;
    }
    return null;
  }
  if (typeof source === "object") {
    for (const value of Object.values(source as Record<string, unknown>)) {
      const numeric = findNumericValue(value);
      if (numeric != null) return numeric;
    }
  }
  return null;
}

function findStringValue(source: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    const direct = safeString(source[candidate]);
    if (direct) return direct;
  }

  for (const [key, value] of Object.entries(source)) {
    if (candidates.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))) {
      const text = safeString(value);
      if (text) return text;
    }
  }

  return "";
}

function findObservedAt(source: Record<string, unknown>) {
  const directKeys = [
    "observedAt",
    "observationTime",
    "phenomenonTime",
    "resultTime",
    "time",
    "timeStamp",
  ];

  for (const key of directKeys) {
    const value = safeString(source[key]);
    if (value && !Number.isNaN(Date.parse(value))) return value;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!/time/i.test(key)) continue;
    const text = safeString(value);
    if (text && !Number.isNaN(Date.parse(text))) return text;
  }

  return "";
}

function extractCoordinatesFromFeature(feature: Record<string, unknown>): Coordinates | null {
  const geometry = feature.geometry as Record<string, unknown> | undefined;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry?.coordinates : null;
  if (coordinates && coordinates.length >= 2) {
    const lon = toNumber(coordinates[0]);
    const lat = toNumber(coordinates[1]);
    if (lat != null && lon != null) return { lat, lon };
  }

  const properties = (feature.properties || {}) as Record<string, unknown>;
  const lat = toNumber(properties.latitude ?? properties.lat);
  const lon = toNumber(properties.longitude ?? properties.lon ?? properties.lng);
  return lat != null && lon != null ? { lat, lon } : null;
}

function extractTemperatureCandidatesFromJson(payload: unknown): ObservationCandidate[] {
  const features = Array.isArray((payload as Record<string, unknown>)?.features)
    ? ((payload as Record<string, unknown>).features as Array<Record<string, unknown>>)
    : [];

  return features
    .map((feature) => {
      const properties = (feature.properties || {}) as Record<string, unknown>;
      const coords = extractCoordinatesFromFeature(feature);
      if (!coords) return null;

      const temperatureKeys = [
        "TemperatureSea",
        "temperatureSea",
        "waterTemperature",
        "WaterTemperature",
        "water_temperature",
        "sea_temperature",
      ];

      let waterTemperatureC: number | null = null;
      for (const key of temperatureKeys) {
        waterTemperatureC = findNumericValue(properties[key]);
        if (waterTemperatureC != null) break;
      }

      if (waterTemperatureC == null) {
        for (const [key, value] of Object.entries(properties)) {
          if (!/(water.*temp|temp.*water|temperaturesea|sea.*temp)/i.test(key)) continue;
          waterTemperatureC = findNumericValue(value);
          if (waterTemperatureC != null) break;
        }
      }

      if (waterTemperatureC == null) return null;

      const observedAt = findObservedAt(properties);
      return {
        waterTemperatureC,
        stationName:
          findStringValue(properties, ["stationName", "name", "fmisid", "region", "locality"]) || "Tuntematon mittauspiste",
        stationLatitude: coords.lat,
        stationLongitude: coords.lon,
        observedAt,
      };
    })
    .filter((candidate): candidate is ObservationCandidate => Boolean(candidate && candidate.observedAt));
}

async function querySykeWaterTemperature(coords: Coordinates, body: WaterTemperatureRequest) {
  const municipality = normalizePart(body.fishingMunicipality);
  const area = normalizePart(body.fishingArea);
  const base = "https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.1/odata";
  const areaFragments = [area, municipality].filter(Boolean);

  const placeUrl = municipality
    ? `${base}/Paikka?$format=json&$top=100&$filter=${encodeURIComponent(`KuntaNimi eq '${escapeODataString(municipality)}'`)}`
    : `${base}/Paikka?$format=json&$top=100`;

  try {
    const placeResponse = await fetchWithTimeout(placeUrl, 9000);
    if (!placeResponse.ok) return null;
    const placePayload = await placeResponse.json();
    const places = getCollectionItems(placePayload)
      .map((record) => {
        const placeCoords = extractLatLon(record);
        const id = extractSykePlaceId(record);
        if (!placeCoords || !id) return null;
        const name = extractSykePlaceName(record);
        const municipalityName = extractSykeMunicipality(record);
        const haystack = `${name} ${municipalityName}`.toLowerCase();
        if (areaFragments.length && !areaFragments.some((fragment) => haystack.includes(fragment.toLowerCase()))) {
          // Municipality-only matches are still accepted below if we found them via filter.
          if (!(municipalityName && municipality && municipalityName.toLowerCase() === municipality.toLowerCase())) {
            return null;
          }
        }
        return {
          id,
          name,
          municipality: municipalityName,
          lat: placeCoords.lat,
          lon: placeCoords.lon,
        };
      })
      .filter((candidate): candidate is SykePlaceCandidate => Boolean(candidate));

    if (!places.length) return null;

    const observationWindowStart = new Date(Date.now() - MAX_OBSERVATION_AGE_MS).toISOString();
    const observationUrl = `${base}/LampoPintavesi?$format=json&$top=300&$orderby=Aika desc&$filter=${encodeURIComponent(`Aika ge datetime'${observationWindowStart}'`)}`;
    const observationResponse = await fetchWithTimeout(observationUrl, 9000);
    if (!observationResponse.ok) return null;
    const observationPayload = await observationResponse.json();
    const observations = getCollectionItems(observationPayload);
    if (!observations.length) return null;

    const placeMap = new Map(places.map((place) => [place.id, place]));
    const candidates = observations
      .map((record) => {
        const placeId = extractSykeObservationPlaceId(record);
        const place = placeMap.get(placeId);
        if (!place) return null;
        const waterTemperatureC = extractSykeTemperature(record);
        if (waterTemperatureC == null) return null;
        const observedAt = findObservedAt(record);
        if (!observedAt || !isFreshObservation(observedAt)) return null;
        const stationDistanceKm = haversineKm(coords.lat, coords.lon, place.lat, place.lon);
        return {
          waterTemperatureC,
          stationName: place.name,
          stationLatitude: place.lat,
          stationLongitude: place.lon,
          stationDistanceKm,
          observedAt,
          municipality: place.municipality,
        };
      })
      .filter((candidate): candidate is ObservationCandidate & { stationDistanceKm: number; municipality: string } => Boolean(candidate))
      .sort((left, right) => left.stationDistanceKm - right.stationDistanceKm);

    const nearestObservation = candidates.find((candidate) => candidate.stationDistanceKm <= 100);
    if (!nearestObservation) return null;

    return {
      success: true,
      waterTemperatureC: nearestObservation.waterTemperatureC,
      lakeOrSeaArea: area || municipality,
      locationName: municipality || area || nearestObservation.municipality,
      stationName: nearestObservation.stationName,
      stationLatitude: nearestObservation.stationLatitude,
      stationLongitude: nearestObservation.stationLongitude,
      stationDistanceKm: nearestObservation.stationDistanceKm,
      observedAt: nearestObservation.observedAt,
      source: "SYKE",
    };
  } catch (_error) {
    return null;
  }
}

function buildFmiQueryUrls(coords: Coordinates) {
  const starttime = new Date(Date.now() - MAX_OBSERVATION_AGE_MS).toISOString();
  const endtime = new Date().toISOString();
  const lonDelta = 0.7;
  const latDelta = 0.45;
  const bbox = [
    (coords.lon - lonDelta).toFixed(4),
    (coords.lat - latDelta).toFixed(4),
    (coords.lon + lonDelta).toFixed(4),
    (coords.lat + latDelta).toFixed(4),
  ].join(",");

  const base = "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature";

  return [
    `${base}&storedquery_id=fmi::observations::weather::simple&bbox=${encodeURIComponent(bbox)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=TemperatureSea&outputFormat=application/json`,
    `${base}&storedquery_id=fmi::observations::weather::simple&bbox=${encodeURIComponent(bbox)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=WaterTemperature&outputFormat=application/json`,
    `${base}&storedquery_id=fmi::observations::weather::simple&bbox=${encodeURIComponent(bbox)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=temperatureSea&outputFormat=application/json`,
  ];
}

async function queryFmiWaterTemperature(coords: Coordinates) {
  const queryUrls = buildFmiQueryUrls(coords);

  for (const url of queryUrls) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) continue;
      const payload = await response.json();
      const candidates = extractTemperatureCandidatesFromJson(payload);
      if (candidates.length > 0) return candidates;
    } catch (_error) {
      // Ignore FMI transport and payload errors. Fallback is handled by caller.
    }
  }

  return [];
}

function pickNearestObservation(coords: Coordinates, candidates: ObservationCandidate[]) {
  return candidates
    .filter((candidate) => isFreshObservation(candidate.observedAt))
    .map((candidate) => ({
      ...candidate,
      stationDistanceKm: haversineKm(coords.lat, coords.lon, candidate.stationLatitude, candidate.stationLongitude),
    }))
    .filter((candidate) => candidate.stationDistanceKm <= MAX_STATION_DISTANCE_KM)
    .sort((left, right) => left.stationDistanceKm - right.stationDistanceKm)[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as WaterTemperatureRequest;
    const fishingArea = normalizePart(body.fishingArea);
    const fishingMunicipality = normalizePart(body.fishingMunicipality);
    const coords = resolveCoordinates(body);

    if (!coords) {
      return jsonResponse(200, {
        success: false,
        message: "Pintaveden lämpötilaa ei vielä saatavilla. Lisää kalastamisalue tai paikkakunta.",
        source: "fallback",
      });
    }

    const sykeResult = await querySykeWaterTemperature(coords, body);
    if (sykeResult) {
      return jsonResponse(200, sykeResult);
    }

    const fmiCandidates = await queryFmiWaterTemperature(coords);
    const nearestObservation = pickNearestObservation(coords, fmiCandidates);

    if (!nearestObservation) {
      return jsonResponse(200, {
        success: false,
        message: "Pintaveden lämpötilaa ei ole saatavilla tälle alueelle.",
        source: "fallback",
      });
    }

    return jsonResponse(200, {
      success: true,
      waterTemperatureC: nearestObservation.waterTemperatureC,
      lakeOrSeaArea: fishingArea || fishingMunicipality,
      locationName: fishingMunicipality || fishingArea,
      stationName: nearestObservation.stationName,
      stationLatitude: nearestObservation.stationLatitude,
      stationLongitude: nearestObservation.stationLongitude,
      stationDistanceKm: nearestObservation.stationDistanceKm,
      observedAt: nearestObservation.observedAt,
      source: "FMI",
    });
  } catch (_error) {
    return jsonResponse(200, {
      success: false,
      message: "Pintaveden lämpötilaa ei juuri nyt saatavilla",
      source: "fallback",
    });
  }
});
