import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

type WeatherRequest = {
  fishingArea?: string;
  fishingMunicipality?: string;
  latitude?: number;
  longitude?: number;
  debug?: boolean;
};

type Coordinates = {
  lat: number;
  lon: number;
};

type WeatherCandidate = {
  airTemperatureC: number;
  windSpeedMs: number;
  windDirectionDeg: number | null;
  weatherType: string;
  stationName: string;
  stationLatitude: number;
  stationLongitude: number;
  stationDistanceKm: number;
  observedAt: string;
};

const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_STATION_DISTANCE_KM = 100;

const fishingAreaCoordinates: Record<string, Coordinates> = {
  "Saimaa|Kyläniemi": { lat: 61.24, lon: 28.2 },
  "Saimaa|Lappeenranta": { lat: 61.0587, lon: 28.1887 },
  "Saimaa|Taipalsaari": { lat: 61.166, lon: 28.061 },
  "Saimaa|Lauritsala": { lat: 61.0587, lon: 28.286 },
  "Pien-Saimaa|Lappeenranta": { lat: 61.12, lon: 28.05 },
  "Päijänne|Sysmä": { lat: 61.5004, lon: 25.6848 },
  "Kallavesi|Kuopio": { lat: 62.8949, lon: 27.6782 },
  "Oulujärvi|Kajaani": { lat: 64.2273, lon: 27.7285 },
  "Inarijärvi|Inari": { lat: 68.9056, lon: 27.0286 },
  "Suur-Saimaa|Lappeenranta": { lat: 61.0587, lon: 28.1887 },
  "Suur-Saimaa|Taipalsaari": { lat: 61.166, lon: 28.061 },
  "|Lappeenranta": { lat: 61.0587, lon: 28.1887 },
  "|Lauritsala": { lat: 61.0587, lon: 28.286 },
  "|Taipalsaari": { lat: 61.166, lon: 28.061 },
  "|Kuopio": { lat: 62.8949, lon: 27.6782 },
  "|Kajaani": { lat: 64.2273, lon: 27.7285 },
  "|Inari": { lat: 68.9056, lon: 27.0286 },
  "|Sysmä": { lat: 61.5004, lon: 25.6848 },
};

const weatherSymbolMap: Record<number, string> = {
  1: "Selkeää",
  2: "Puolipilvistä",
  3: "Pilvistä",
  21: "Heikkoja sadekuuroja",
  22: "Sadekuuroja",
  23: "Voimakkaita sadekuuroja",
  31: "Heikkoa vesisadetta",
  32: "Vesisadetta",
  33: "Voimakasta vesisadetta",
  41: "Heikkoja lumikuuroja",
  42: "Lumikuuroja",
  43: "Voimakkaita lumikuuroja",
  51: "Heikkoa lumisadetta",
  52: "Lumisadetta",
  53: "Voimakasta lumisadetta",
  61: "Ukkoskuuroja",
  62: "Ukkosta",
  63: "Voimakasta ukkosta",
  71: "Heikkoja räntäkuuroja",
  72: "Räntäkuuroja",
  73: "Voimakkaita räntäkuuroja",
  81: "Heikkoa räntäsadetta",
  82: "Räntäsadetta",
  83: "Voimakasta räntäsadetta",
  91: "Utua",
  92: "Sumua",
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

function resolveCoordinates(body: WeatherRequest) {
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
    const numeric = Number(source.replace(",", ".").trim());
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

function extractWeatherCandidatesFromJson(payload: unknown, coords: Coordinates): WeatherCandidate[] {
  const features = Array.isArray((payload as Record<string, unknown>)?.features)
    ? ((payload as Record<string, unknown>).features as Array<Record<string, unknown>>)
    : [];

  return features
    .map((feature) => {
      const properties = (feature.properties || {}) as Record<string, unknown>;
      const featureCoords = extractCoordinatesFromFeature(feature);
      if (!featureCoords) return null;

      const airTemperatureC = findNumericValue(
        properties.AirTemperature ?? properties.airTemperature ?? properties.temperature,
      );
      const windSpeedMs = findNumericValue(
        properties.WindSpeedMS ?? properties.windSpeedMS ?? properties.windspeedms ?? properties.windSpeed,
      );
      const windDirectionDeg = findNumericValue(
        properties.WindDirection ?? properties.windDirection ?? properties.winddirection,
      );
      const weatherSymbol = findNumericValue(
        properties.WeatherSymbol3 ?? properties.weatherSymbol3 ?? properties.weathersymbol3,
      );
      const observedAt = findObservedAt(properties);

      if (airTemperatureC == null || windSpeedMs == null || !observedAt) return null;

      return {
        airTemperatureC,
        windSpeedMs,
        windDirectionDeg,
        weatherType: weatherSymbol != null ? (weatherSymbolMap[Math.round(weatherSymbol)] || `Sääsymboli ${Math.round(weatherSymbol)}`) : "Säätyyppi ei saatavilla",
        stationName:
          findStringValue(properties, ["stationName", "name", "fmisid", "region", "locality"]) ||
          "Tuntematon mittauspiste",
        stationLatitude: featureCoords.lat,
        stationLongitude: featureCoords.lon,
        stationDistanceKm: haversineKm(coords.lat, coords.lon, featureCoords.lat, featureCoords.lon),
        observedAt,
      };
    })
    .filter((candidate): candidate is WeatherCandidate => Boolean(candidate && isFreshObservation(candidate.observedAt)))
    .sort((left, right) => left.stationDistanceKm - right.stationDistanceKm);
}

function getDescendantText(root: Element, localNames: string[]) {
  const wanted = new Set(localNames.map((name) => name.toLowerCase()));
  const stack: Element[] = [root];

  while (stack.length) {
    const current = stack.pop()!;
    const localName = (current.localName || current.nodeName || "").toLowerCase();
    if (wanted.has(localName)) {
      const text = current.textContent?.trim() || "";
      if (text) return text;
    }
    for (const child of Array.from(current.children)) stack.push(child);
  }

  return "";
}

function parsePosText(text: string): Coordinates | null {
  const parts = text.trim().split(/\s+/).map((part) => Number(part));
  if (parts.length < 2 || parts.some((value) => !Number.isFinite(value))) return null;
  const [first, second] = parts;
  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) return { lat: first, lon: second };
  if (Math.abs(second) <= 90 && Math.abs(first) <= 180) return { lat: second, lon: first };
  return null;
}

function extractWeatherCandidatesFromXml(xmlText: string, coords: Coordinates): WeatherCandidate[] {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = xml.querySelector("parsererror");
  if (parseError) return [];

  const elements = Array.from(xml.getElementsByTagName("*")).filter(
    (element) => (element.localName || "").toLowerCase() === "bswfselement",
  );

  const grouped = new Map<string, {
    stationName: string;
    observedAt: string;
    coords: Coordinates | null;
    airTemperatureC: number | null;
    windSpeedMs: number | null;
    windDirectionDeg: number | null;
    weatherSymbol: number | null;
  }>();

  for (const element of elements) {
    const parameterName = getDescendantText(element, ["ParameterName", "parametername", "Parameter"]).toLowerCase();
    const valueText = getDescendantText(element, ["ParameterValue", "parametervalue", "Value", "value"]);
    const observedAt = getDescendantText(element, ["Time", "time", "TimePosition", "timePosition", "MeasurementTime"]);
    const stationName =
      getDescendantText(element, ["StationName", "stationname", "GeographicalName", "geographicalname", "Name", "name", "Location", "location"]) ||
      "Tuntematon mittauspiste";
    const coordsText = getDescendantText(element, ["pos", "Pos"]);
    const parsedCoords = parsePosText(coordsText);
    if (!observedAt) continue;

    const groupKey = `${stationName}|${observedAt}|${coordsText}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        stationName,
        observedAt,
        coords: parsedCoords,
        airTemperatureC: null,
        windSpeedMs: null,
        windDirectionDeg: null,
        weatherSymbol: null,
      });
    }
    const group = grouped.get(groupKey)!;
    const numeric = toNumber(valueText);

    if (/(^|[^a-z])(airtemperature|temperature|t2m)($|[^a-z])/i.test(parameterName) && !/water|sea/i.test(parameterName)) {
      group.airTemperatureC = numeric;
    } else if (/(windspeedms|windspeed|ws_10min)/i.test(parameterName)) {
      group.windSpeedMs = numeric;
    } else if (/(winddirection|wd_10min)/i.test(parameterName)) {
      group.windDirectionDeg = numeric;
    } else if (/(weathersymbol3|weathersymbol|wawa)/i.test(parameterName)) {
      group.weatherSymbol = numeric;
    }
  }

  return Array.from(grouped.values())
    .filter((candidate) => candidate.coords && candidate.airTemperatureC != null && candidate.windSpeedMs != null && isFreshObservation(candidate.observedAt))
    .map((candidate) => ({
      airTemperatureC: candidate.airTemperatureC as number,
      windSpeedMs: candidate.windSpeedMs as number,
      windDirectionDeg: candidate.windDirectionDeg,
      weatherType:
        candidate.weatherSymbol != null
          ? (weatherSymbolMap[Math.round(candidate.weatherSymbol)] || `Sääsymboli ${Math.round(candidate.weatherSymbol)}`)
          : "Säätyyppi ei saatavilla",
      stationName: candidate.stationName,
      stationLatitude: (candidate.coords as Coordinates).lat,
      stationLongitude: (candidate.coords as Coordinates).lon,
      stationDistanceKm: haversineKm(coords.lat, coords.lon, (candidate.coords as Coordinates).lat, (candidate.coords as Coordinates).lon),
      observedAt: candidate.observedAt,
    }))
    .sort((left, right) => left.stationDistanceKm - right.stationDistanceKm);
}

function buildFmiQueryUrls(coords: Coordinates, body: WeatherRequest) {
  const starttime = new Date(Date.now() - MAX_OBSERVATION_AGE_MS).toISOString();
  const endtime = new Date().toISOString();
  const lonDelta = 1.2;
  const latDelta = 0.8;
  const bbox = [
    (coords.lon - lonDelta).toFixed(4),
    (coords.lat - latDelta).toFixed(4),
    (coords.lon + lonDelta).toFixed(4),
    (coords.lat + latDelta).toFixed(4),
  ].join(",");
  const base = "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature";
  const municipality = normalizePart(body.fishingMunicipality);
  const parameterVariants = [
    "temperature,windspeedms,winddirection,weathersymbol3",
    "temperature,windspeedms,winddirection,WeatherSymbol3",
    "AirTemperature,WindSpeedMS,WindDirection,WeatherSymbol3",
  ];
  const urls: string[] = [];

  for (const parameters of parameterVariants) {
    if (municipality) {
      urls.push(
        `${base}&storedquery_id=fmi::observations::weather::simple&place=${encodeURIComponent(municipality)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=${encodeURIComponent(parameters)}&outputFormat=application/json`,
      );
      urls.push(
        `${base}&storedquery_id=fmi::observations::weather::simple&place=${encodeURIComponent(municipality)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=${encodeURIComponent(parameters)}`,
      );
    }
    urls.push(
      `${base}&storedquery_id=fmi::observations::weather::simple&bbox=${encodeURIComponent(bbox)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=${encodeURIComponent(parameters)}&outputFormat=application/json`,
    );
    urls.push(
      `${base}&storedquery_id=fmi::observations::weather::simple&bbox=${encodeURIComponent(bbox)}&starttime=${encodeURIComponent(starttime)}&endtime=${encodeURIComponent(endtime)}&parameters=${encodeURIComponent(parameters)}`,
    );
  }

  return urls;
}

async function queryFmiWeather(coords: Coordinates, body: WeatherRequest) {
  const urls = buildFmiQueryUrls(coords, body);
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      let candidates: WeatherCandidate[] = [];
      if (contentType.includes("json")) {
        const payload = await response.json();
        candidates = extractWeatherCandidatesFromJson(payload, coords);
      } else {
        const xmlText = await response.text();
        candidates = extractWeatherCandidatesFromXml(xmlText, coords);
      }
      if (candidates.length > 0) return candidates;
    } catch (_error) {
      // Fall through to next FMI query variation.
    }
  }
  return [];
}

function withDebug<T extends Record<string, unknown>>(payload: T, debugEnabled: boolean, debug: Record<string, unknown>) {
  if (!debugEnabled) return payload;
  return { ...payload, debug };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const body = (await req.json().catch(() => ({}))) as WeatherRequest;
  const debugEnabled = body.debug === true;

  try {
    const fishingArea = normalizePart(body.fishingArea);
    const fishingMunicipality = normalizePart(body.fishingMunicipality);
    const coords = resolveCoordinates(body);
    const debugPayload: Record<string, unknown> = {
      fishingArea,
      fishingMunicipality,
      resolvedCoordinates: coords,
      fmiTried: false,
    };

    if (!coords) {
      return jsonResponse(200, withDebug({
        success: false,
        message: "Säätietoa ei vielä saatavilla. Lisää kalastamisalue tai paikkakunta.",
        source: "fallback",
      }, debugEnabled, debugPayload));
    }

    debugPayload.fmiTried = true;
    const candidates = await queryFmiWeather(coords, body);
    debugPayload.fmiCandidateCount = candidates.length;
    const nearest = candidates.find((candidate) => candidate.stationDistanceKm <= MAX_STATION_DISTANCE_KM) || null;

    if (!nearest) {
      return jsonResponse(200, withDebug({
        success: false,
        message: "Säätietoa ei juuri nyt saatavilla",
        source: "fallback",
      }, debugEnabled, {
        ...debugPayload,
        sourceUsed: "fallback",
        nearestFmiStation: candidates[0]?.stationName || "",
      }));
    }

    return jsonResponse(200, withDebug({
      success: true,
      airTemperatureC: nearest.airTemperatureC,
      windSpeedMs: nearest.windSpeedMs,
      windDirectionDeg: nearest.windDirectionDeg,
      windDirectionText: nearest.windDirectionDeg == null ? "" : windDirectionToFinnish(nearest.windDirectionDeg),
      weatherType: nearest.weatherType,
      lakeOrSeaArea: fishingArea || fishingMunicipality,
      locationName: fishingMunicipality || fishingArea,
      stationName: nearest.stationName,
      stationLatitude: nearest.stationLatitude,
      stationLongitude: nearest.stationLongitude,
      stationDistanceKm: nearest.stationDistanceKm,
      observedAt: nearest.observedAt,
      source: "FMI",
    }, debugEnabled, {
      ...debugPayload,
      sourceUsed: "FMI",
      matchedFmiStation: nearest.stationName,
      weatherType: nearest.weatherType,
      windSpeedMs: nearest.windSpeedMs,
    }));
  } catch (_error) {
    return jsonResponse(200, withDebug({
      success: false,
      message: "Säätietoa ei juuri nyt saatavilla",
      source: "fallback",
    }, debugEnabled, {
      error: "handler_exception",
    }));
  }
});

function windDirectionToFinnish(degrees: number) {
  const value = ((degrees % 360) + 360) % 360;
  const directions = [
    "pohjoisesta",
    "koillisesta",
    "idästä",
    "kaakosta",
    "etelästä",
    "lounaasta",
    "lännestä",
    "luoteesta",
  ];
  const index = Math.round(value / 45) % 8;
  return directions[index];
}
