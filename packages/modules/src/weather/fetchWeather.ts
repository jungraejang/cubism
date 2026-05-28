import { normalizeZipCode } from "./config";

export type WeatherSnapshot = {
  locationName: string;
  region: string;
  temperatureF: number;
  temperatureC: number;
  apparentTemperatureF: number;
  apparentTemperatureC: number;
  humidity: number;
  windMph: number;
  windKmh: number;
  weatherCode: number;
  isDay: boolean;
  conditionLabel: string;
};

function fahrenheitToCelsius(f: number): number {
  return Math.round((f - 32) * (5 / 9));
}

function mphToKmh(mph: number): number {
  return Math.round(mph * 1.60934);
}

type ZippopotamResponse = {
  places: Array<{
    "place name": string;
    latitude: string;
    longitude: string;
    "state abbreviation"?: string;
    state?: string;
  }>;
};

type OpenMeteoResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
};

/**
 * Human-readable labels for WMO weather codes returned by Open-Meteo.
 * @see https://open-meteo.com/en/docs#weathervariables
 */
const WMO_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export function weatherCodeToLabel(code: number): string {
  return WMO_LABELS[code] ?? "Weather";
}

/**
 * Resolves a US ZIP to coordinates via zippopotam.us, then loads current
 * conditions from Open-Meteo. Both services are free and require no API key.
 */
export async function fetchWeatherForZip(
  zipCode: string,
): Promise<WeatherSnapshot> {
  const zip = normalizeZipCode(zipCode);
  if (zip.length !== 5) {
    throw new Error("Enter a valid 5-digit US ZIP code");
  }

  const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!geoRes.ok) {
    throw new Error(
      geoRes.status === 404 ? "ZIP code not found" : "Could not look up ZIP code",
    );
  }

  const geo = (await geoRes.json()) as ZippopotamResponse;
  const place = geo.places[0];
  if (!place) {
    throw new Error("ZIP code not found");
  }

  const lat = Number.parseFloat(place.latitude);
  const lon = Number.parseFloat(place.longitude);
  const locationName = place["place name"];
  const region =
    place["state abbreviation"] ?? place.state ?? "";

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "is_day",
    ].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
  });

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`,
  );
  if (!weatherRes.ok) {
    throw new Error("Could not fetch weather forecast");
  }

  const body = (await weatherRes.json()) as OpenMeteoResponse;
  const current = body.current;

  const temperatureF = Math.round(current.temperature_2m);
  const apparentTemperatureF = Math.round(current.apparent_temperature);
  const windMph = Math.round(current.wind_speed_10m);

  return {
    locationName,
    region,
    temperatureF,
    temperatureC: fahrenheitToCelsius(temperatureF),
    apparentTemperatureF,
    apparentTemperatureC: fahrenheitToCelsius(apparentTemperatureF),
    humidity: Math.round(current.relative_humidity_2m),
    windMph,
    windKmh: mphToKmh(windMph),
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
    conditionLabel: weatherCodeToLabel(current.weather_code),
  };
}
