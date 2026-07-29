import { state } from "./store.js";
import { escapeHtml, openModal, showToast } from "./ui.js";
import { log } from "./logger.js";

const weatherMap = code => {
  if (code === 0) return ["Céu limpo", "fa-sun"];
  if (code <= 3) return ["Parcialmente nublado", "fa-cloud-sun"];
  if (code <= 48) return ["Neblina", "fa-smog"];
  if (code <= 67) return ["Chuva", "fa-cloud-rain"];
  if (code <= 77) return ["Neve", "fa-snowflake"];
  if (code <= 82) return ["Pancadas de chuva", "fa-cloud-showers-heavy"];
  return ["Trovoadas", "fa-cloud-bolt"];
};

export async function fetchWeather() {
  const settings = state.settings;
  const params = new URLSearchParams({
    latitude: settings.weather_latitude,
    longitude: settings.weather_longitude,
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "3",
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const [label, icon] = weatherMap(data.current.weather_code);
    document.getElementById("weatherTemp").textContent = `${Math.round(data.current.temperature_2m)}°`;
    document.getElementById("weatherCity").textContent = settings.weather_city;
    document.getElementById("weatherIcon").className = `fa-solid ${icon}`;
    document.getElementById("weatherButton").title = label;
    window.fluuxWeather = data;
    log.success("CLIMA", "Previsão carregada.", { cidade: settings.weather_city });
    return data;
  } catch (error) {
    document.getElementById("weatherTemp").textContent = "--°";
    document.getElementById("weatherCity").textContent = "Clima indisponível";
    log.warn("CLIMA", "Falha ao carregar previsão.", error);
    return null;
  }
}

export async function openWeather() {
  openModal("weatherModal");
  document.getElementById("weatherModalCity").textContent = state.settings.weather_city;
  const container = document.getElementById("weatherDays");
  container.innerHTML = `<span class="spinner"></span>`;
  const data = window.fluuxWeather || await fetchWeather();
  if (!data?.daily) {
    container.innerHTML = `<p class="empty-table">Não foi possível carregar a previsão agora.</p>`;
    return;
  }
  container.innerHTML = data.daily.time.map((date, index) => {
    const [label, icon] = weatherMap(data.daily.weather_code[index]);
    const day = index === 0 ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
    return `<article class="weather-day"><strong>${escapeHtml(day)}</strong><i class="fa-solid ${icon}"></i><span>${Math.round(data.daily.temperature_2m_max[index])}° <small>/ ${Math.round(data.daily.temperature_2m_min[index])}°</small></span><small>${escapeHtml(label)}</small></article>`;
  }).join("");
}

export async function searchCity(query) {
  const term = query.trim();
  if (term.length < 2) throw new Error("Digite uma cidade para pesquisar.");
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=5&language=pt&format=json`);
  if (!response.ok) throw new Error("Não foi possível pesquisar a cidade.");
  const data = await response.json();
  const result = data.results?.[0];
  if (!result) throw new Error("Cidade não encontrada.");
  const label = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
  showToast(`Cidade localizada: ${label}`, "success");
  return { city: label, latitude: result.latitude, longitude: result.longitude };
}
