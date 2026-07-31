import { state, saveSettings } from "./store.js";
import { escapeHtml, showToast } from "./ui.js";
import { log } from "./logger.js";

let activeLocation = null;
const GEO_SESSION_KEY = "fluux-geolocation-attempted";

function weatherInfo(code, isNight = false) {
  if (code === 0) return ["Céu limpo", isNight ? "ico_noite.svg" : "ico_dia.svg", "fa-sun"];
  if (code <= 3) return ["Parcialmente nublado", "ico_nublado.svg", "fa-cloud-sun"];
  if (code <= 48) return ["Neblina", "ico_nublado.svg", "fa-smog"];
  if (code <= 82) return ["Chuva", "ico_chuva.svg", "fa-cloud-rain"];
  return ["Trovoadas", "ico_chuva.svg", "fa-cloud-bolt"];
}

function currentLocation() {
  return activeLocation || {
    city: state.settings.weather_city,
    latitude: Number(state.settings.weather_latitude),
    longitude: Number(state.settings.weather_longitude),
  };
}

function renderForecast(data, city) {
  const container = document.getElementById("weatherDays");
  const cityElement = document.getElementById("weatherPopoverCity");
  if (!container || !cityElement) return;
  cityElement.textContent = city;
  if (!data?.daily) {
    container.innerHTML = `<p class="weather-empty">Não foi possível carregar a previsão agora.</p>`;
    return;
  }
  container.innerHTML = data.daily.time.map((date, index) => {
    const [label, image] = weatherInfo(data.daily.weather_code[index]);
    const day = index === 0
      ? "hoje"
      : new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
    return `<article class="weather-day" title="${escapeHtml(label)}">
      <strong>${escapeHtml(day)}</strong>
      <span>${Math.round(data.daily.temperature_2m_max[index])}° <small>/ ${Math.round(data.daily.temperature_2m_min[index])}°</small></span>
      <img src="assets/img/weather/${image}" alt="${escapeHtml(label)}">
    </article>`;
  }).join("");
}

export async function fetchWeather(location = currentLocation()) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "3",
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const [label, , icon] = weatherInfo(data.current.weather_code, data.current.is_day === 0);
    document.getElementById("weatherTemp").textContent = `${Math.round(data.current.temperature_2m)}°`;
    document.getElementById("weatherCity").textContent = location.city;
    document.getElementById("weatherIcon").className = `fa-solid ${icon}`;
    document.getElementById("weatherButton").title = label;
    window.fluuxWeather = data;
    renderForecast(data, location.city);
    log.success("CLIMA", "Previsão carregada.", { local: location.city });
    return data;
  } catch (error) {
    const temp = document.getElementById("weatherTemp");
    const city = document.getElementById("weatherCity");
    if (temp) temp.textContent = "--°";
    if (city) city.textContent = "Clima indisponível";
    renderForecast(null, location.city);
    log.warn("CLIMA", "Falha ao carregar previsão.", error);
    return null;
  }
}

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada."));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 15 * 60 * 1000,
    });
  });
}

async function reverseLocation(latitude, longitude) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), localityLanguage: "pt" });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return [data.city || data.locality, data.principalSubdivision].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function useBrowserLocation(manual = false) {
  try {
    const position = await browserPosition();
    const latitude = Number(position.coords.latitude.toFixed(4));
    const longitude = Number(position.coords.longitude.toFixed(4));
    const city = await reverseLocation(latitude, longitude) || "Localização atual";
    activeLocation = { city, latitude, longitude };
    const changed =
      Math.abs(latitude - Number(state.settings.weather_latitude)) > .01 ||
      Math.abs(longitude - Number(state.settings.weather_longitude)) > .01 ||
      city !== state.settings.weather_city;
    if (changed) {
      try {
        await saveSettings({ weather_city: city, weather_latitude: latitude, weather_longitude: longitude });
      } catch (error) {
        log.warn("CLIMA", "Localização aplicada nesta sessão, mas não salva.", error);
      }
    }
    await fetchWeather(activeLocation);
    if (manual) showToast(`Clima atualizado para ${city}.`, "success");
    return true;
  } catch (error) {
    log.info("CLIMA", "Localização automática indisponível; usando o local salvo.", { motivo: error.message });
    if (manual) showToast("Não foi possível acessar a localização. Mantivemos o local salvo.", "info");
    return false;
  }
}

export async function initializeWeather() {
  await fetchWeather();
  if (sessionStorage.getItem(GEO_SESSION_KEY) === "1") return;
  sessionStorage.setItem(GEO_SESSION_KEY, "1");
  await useBrowserLocation(false);
}

export async function openWeather(event) {
  event?.stopPropagation();
  const popover = document.getElementById("weatherPopover");
  const button = document.getElementById("weatherButton");
  if (!popover || !button) return;
  const opening = popover.hidden;
  popover.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
  if (opening) {
    renderForecast(window.fluuxWeather, currentLocation().city);
    if (!window.fluuxWeather) await fetchWeather();
  }
}

export function closeWeather() {
  const popover = document.getElementById("weatherPopover");
  const button = document.getElementById("weatherButton");
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}

export async function refreshWeather() {
  const button = document.getElementById("refreshWeatherButton");
  if (button) button.disabled = true;
  await useBrowserLocation(true);
  if (button) button.disabled = false;
}
