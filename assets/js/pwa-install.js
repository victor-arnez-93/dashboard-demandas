(() => {
  const panel = document.getElementById("pwaInstall");
  const button = document.getElementById("pwaInstallButton");
  const help = document.getElementById("pwaInstallHelp");
  const standalone = matchMedia("(display-mode: standalone)");
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  let installed = false;

  function render(message = "") {
    const visible = !installed && !standalone.matches && navigator.standalone !== true;
    button.hidden = !visible || !installPrompt;
    help.textContent = message || (appleMobile && !installPrompt
      ? "No Safari, toque em Compartilhar, escolha Adicionar à Tela de Início e ative Abrir como App da Web, se aparecer."
      : "");
    help.hidden = !visible || !help.textContent;
    panel.hidden = button.hidden && help.hidden;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    render();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    installPrompt = null;
    render();
  });

  standalone.addEventListener("change", () => render());

  button.addEventListener("click", async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    button.disabled = true;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") installed = true;
      render(outcome === "dismissed" ? "Você pode instalar o FLUUX pelo menu do navegador quando quiser." : "");
    } catch {
      render("Para instalar, use a opção de instalação no menu do navegador.");
    } finally {
      button.disabled = false;
    }
  });

  render();
})();
