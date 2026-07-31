import { bootPage } from "./shell.js";
import { state, saveProfile, saveSettings, uploadAvatar } from "./store.js";
import { applyIdentity, applyAvatar, showToast } from "./ui.js";
import { smartName, smartSentence, bindSmartText } from "./form-utils.js";

let editing = false;
let avatarFile = null;

function setEditing(value) {
  editing = value;
  ["settingsName", "settingsRole", "settingsAppName", "settingsAppSubtitle", "avatarInput"].forEach(id => {
    document.getElementById(id).disabled = !editing;
  });
  document.getElementById("saveSettingsButton").disabled = !editing;
  document.getElementById("settingsLock").innerHTML = editing
    ? `<i class="fa-solid fa-unlock"></i><span>Modo de edição ativo. Revise os dados antes de salvar.</span>`
    : `<i class="fa-solid fa-lock"></i><span>Configurações protegidas contra alterações acidentais.</span>`;
  document.getElementById("editSettingsButton").innerHTML = editing
    ? `<i class="fa-solid fa-xmark"></i> Cancelar edição`
    : `<i class="fa-solid fa-pen"></i> Editar`;
}

function populate() {
  document.getElementById("settingsName").value = state.profile.full_name || "";
  document.getElementById("settingsRole").value = state.profile.role || "";
  document.getElementById("settingsEmail").value = state.user.email || "";
  document.getElementById("settingsAppName").value = state.settings.app_name || "FLUUX";
  document.getElementById("settingsAppSubtitle").value = state.settings.app_subtitle || "Organização de Demandas";
  applyAvatar(state.profile.avatar_url, state.profile.full_name);
  avatarFile = null;
}

bootPage(() => {
  populate();
  setEditing(false);
  bindSmartText(document.getElementById("settingsName"), "name");
  bindSmartText(document.getElementById("settingsRole"), "sentence");
  bindSmartText(document.getElementById("settingsAppName"), "sentence");
  bindSmartText(document.getElementById("settingsAppSubtitle"), "sentence");

  document.getElementById("editSettingsButton").addEventListener("click", () => {
    if (editing) populate();
    setEditing(!editing);
  });

  document.getElementById("avatarInput").addEventListener("change", event => {
    avatarFile = event.target.files?.[0] || null;
    if (!avatarFile) return;
    if (avatarFile.size > 2 * 1024 * 1024) {
      avatarFile = null;
      event.target.value = "";
      showToast("A foto deve ter no máximo 2 MB.", "error");
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    applyAvatar(url, document.getElementById("settingsName").value || state.profile.full_name);
  });

  document.getElementById("settingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!editing) return;
    const button = document.getElementById("saveSettingsButton");
    const name = smartName(document.getElementById("settingsName").value);
    const role = smartSentence(document.getElementById("settingsRole").value);
    const appName = smartSentence(document.getElementById("settingsAppName").value);
    const subtitle = smartSentence(document.getElementById("settingsAppSubtitle").value);
    if (name.length < 2 || appName.length < 2 || subtitle.length < 2) {
      showToast("Revise nome, nome do sistema e subtítulo.", "error");
      return;
    }
    try {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;
      let avatarUrl = state.profile.avatar_url;
      if (avatarFile) avatarUrl = await uploadAvatar(avatarFile);
      await Promise.all([
        saveProfile({ full_name: name, role: role || "Gestão de Demandas", avatar_url: avatarUrl, theme: state.profile.theme }),
        saveSettings({ app_name: appName, app_subtitle: subtitle }),
      ]);
      applyIdentity();
      populate();
      setEditing(false);
      showToast("Configurações salvas e aplicadas ao sistema.", "success");
    } catch (error) {
      showToast(error.message || "Não foi possível salvar as configurações.", "error");
      button.disabled = false;
    } finally {
      button.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Salvar configurações`;
    }
  });
});
