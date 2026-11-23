import { isConfigured } from "./supabase-client.js";

const form = document.getElementById("inviteForm");
const password = document.getElementById("invitePassword");
const confirmation = document.getElementById("inviteConfirmation");
const submit = document.getElementById("inviteSubmit");
const message = document.getElementById("inviteMessage");
const title = document.getElementById("inviteTitle");
const description = document.getElementById("inviteDescription");

function showMessage(text = "") {
  message.textContent = text;
  message.hidden = !text;
}

function initializeInvite() {
  const tokenHash = new URLSearchParams(location.hash.slice(1)).get("convite");
  if (!tokenHash) {
    showMessage("Abra o link recebido por e-mail para definir sua senha.");
    return;
  }

  if (!isConfigured() || !window.supabase?.createClient) {
    showMessage("O serviço de autenticação está indisponível. Recarregue a página e tente novamente.");
    return;
  }

  // Keep the invitation session separate from the normal FLUUX login.
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.FLUUX_ENV;
  const { auth } = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey: "fluux-invite-auth",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let verified = false;
  form.hidden = false;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    showMessage();

    const newPassword = password.value;
    if (newPassword !== confirmation.value) {
      showMessage("As senhas precisam ser iguais.");
      confirmation.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "Salvando senha…";

    try {
      if (!verified) {
        const { data, error } = await auth.verifyOtp({
          token_hash: tokenHash,
          type: "invite",
        });

        if (error) throw error;
        if (!data.session) throw new Error("Sessão do convite ausente.");

        verified = true;
        history.replaceState(null, "", location.pathname + location.search);
      }

      const { error } = await auth.updateUser({ password: newPassword });
      if (error) throw error;

      form.reset();
      form.hidden = true;
      title.textContent = "Senha definida";
      description.textContent = "Agora você pode entrar com seu e-mail e a nova senha.";
      description.setAttribute("role", "status");
    } catch (error) {
      if (error.code === "otp_expired" || error.code === "access_denied") {
        showMessage("Este convite expirou ou já foi usado. Peça um novo acesso ao administrador.");
      } else if (error.code === "weak_password") {
        showMessage("Escolha uma senha mais forte, com mais caracteres.");
      } else if (error.code === "session_not_found" || error.code === "refresh_token_not_found") {
        showMessage("A sessão do convite expirou. Peça ao administrador um link para definir sua senha.");
      } else {
        showMessage("Não foi possível salvar a senha. Tente novamente sem fechar esta página.");
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar senha";
    }
  });
}

try {
  document.documentElement.dataset.theme = localStorage.getItem("fluux-landing-theme")
    || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
} catch {
  // The default theme is available without local storage.
}

initializeInvite();
