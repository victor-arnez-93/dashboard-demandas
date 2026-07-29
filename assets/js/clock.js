function updateClock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("pt-BR", { hour:"2-digit", minute:"2-digit", hour12:false }).format(now);
  const date = new Intl.DateTimeFormat("pt-BR", { weekday:"short", day:"2-digit", month:"short" }).format(now).replaceAll(".","");
  const timeElement = document.getElementById("currentTime");
  const dateElement = document.getElementById("currentDate");
  if (timeElement) timeElement.textContent = time;
  if (dateElement) dateElement.textContent = date;
}

export function initClock() {
  updateClock();
  setInterval(updateClock, 30000);
}
