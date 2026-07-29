const PREFIX = "FLUUX";

function output(level, area, message, details) {
  const colors = {
    info: "#284B63",
    success: "#24a36b",
    warn: "#F96900",
    error: "#e74c5f",
  };
  const method = level === "success" ? "log" : level;
  const args = [
    `%c[${PREFIX}]%c[${area}] ${message}`,
    "color:#fff;background:#284B63;padding:2px 5px;border-radius:3px;font-weight:700",
    `color:${colors[level] || colors.info};font-weight:700`,
  ];
  if (details !== undefined) args.push(details);
  console[method](...args);
}

export const log = {
  info: (area, message, details) => output("info", area, message, details),
  success: (area, message, details) => output("success", area, message, details),
  warn: (area, message, details) => output("warn", area, message, details),
  error: (area, message, details) => output("error", area, message, details),
  boot() {
    console.groupCollapsed("%c FLUUX · Diagnóstico do sistema ", "background:#284B63;color:#fff;padding:5px 9px;border-radius:5px;font-weight:800");
    console.info("Versão: 1.0.0");
    console.info(`Inicialização: ${new Date().toLocaleString("pt-BR")}`);
    console.info(`Navegador online: ${navigator.onLine ? "sim" : "não"}`);
    console.groupEnd();
  },
};
