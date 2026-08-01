const PREFIX = "[FLUUX]";
const VERSION = "1.3.0";

function write(method, area, message, details) {
  const args = [`${PREFIX} [${area}] ${message}`];
  if (details !== undefined) args.push(details);
  console[method](...args);
}

export const log = {
  boot() {
    console.info(`${PREFIX} FLUUX v${VERSION} — inicialização`);
  },
  info(area, message, details) { write("info", area, message, details); },
  success(area, message, details) { write("info", area, `✓ ${message}`, details); },
  warn(area, message, details) { write("warn", area, message, details); },
  error(area, message, details) { write("error", area, message, details); },
};
