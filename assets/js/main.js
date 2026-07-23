/* ZYVA — main.js */

/* ⚠️ TROQUE AQUI: número do WhatsApp da Zyva no formato 55 + DDD + número (só dígitos) */
const WHATSAPP_NUMBER = "5585900000000";
const WHATSAPP_DEFAULT_MSG = "Olá, Zyva! Quero um diagnóstico gratuito para minha empresa.";

/* Aplica o número em todos os links de WhatsApp */
document.querySelectorAll("[data-wa]").forEach((el) => {
  const msg = el.getAttribute("data-wa-msg") || WHATSAPP_DEFAULT_MSG;
  el.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  el.target = "_blank";
  el.rel = "noopener";
});

/* Menu mobile */
const toggle = document.querySelector(".nav-toggle");
const links = document.querySelector(".nav-links");
if (toggle && links) {
  toggle.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}

/* Animação de entrada */
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* Formulário de contato → abre WhatsApp com a mensagem montada */
const form = document.querySelector("#form-contato");
if (form) {
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = (name) => (form.querySelector(`[name="${name}"]`)?.value || "").trim();
    if (!form.querySelector('[name="consent"]').checked) {
      alertBox("Para enviar, confirme que leu a Política de Privacidade.");
      return;
    }
    const msg =
      `Olá, Zyva! Meu nome é ${v("nome")}, da empresa ${v("empresa")}.\n` +
      `Tenho interesse em: ${v("servico")}.\n` +
      `${v("mensagem")}\n` +
      `Meu WhatsApp: ${v("whatsapp")}`;
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener"
    );
    const ok = document.querySelector("#form-ok");
    if (ok) ok.hidden = false;
  });
}

/* Aviso simples sem alert() nativo */
function alertBox(text) {
  let box = document.querySelector("#alert-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "alert-box";
    box.style.cssText =
      "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#1E2235;color:#fff;padding:14px 22px;border-radius:12px;z-index:99;font-size:.95rem;box-shadow:0 10px 30px rgba(0,0,0,.3)";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.hidden = false;
  setTimeout(() => (box.hidden = true), 4000);
}

/* Ano no rodapé */
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});
