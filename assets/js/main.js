/* ZYVA — main.js */

/* ⚠️ TROQUE AQUI: número do WhatsApp da Zyva no formato 55 + DDD + número (só dígitos) */
const WHATSAPP_NUMBER = "5598984337265";
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

/* ================================================================
   Destaque do blog diário (post do dia + data comemorativa)
   Lê /assets/data/latest.json e:
   1) mostra uma faixa "novo no blog" no topo até o visitante ler o post;
   2) marca com selo NOVO/ESPECIAL o card correspondente no /blog/;
   3) ao visitar o post, grava como "visto" (localStorage) e o destaque some.
   ================================================================ */
(async () => {
  try {
    const res = await fetch("/assets/data/latest.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const items = [];
    if (data.special && data.special.slug) items.push({ ...data.special, kind: "special" });
    if (data.latest && data.latest.slug) items.push({ ...data.latest, kind: "news" });
    if (!items.length) return;

    const seenKey = (slug) => "zyva_seen_" + slug;
    const here = location.pathname.endsWith("/") ? location.pathname : location.pathname + "/";

    /* Marca o post atual como visto */
    items.forEach((item) => {
      if (here === item.slug) {
        try { localStorage.setItem(seenKey(item.slug), "1"); } catch (e) {}
      }
    });

    const unseen = items.filter((i) => {
      try { return !localStorage.getItem(seenKey(i.slug)) && here !== i.slug; }
      catch (e) { return here !== i.slug; }
    });

    /* Faixa de destaque no topo (todas as páginas) */
    if (unseen.length) {
      const bar = document.createElement("div");
      bar.className = "zyva-newsbar";
      bar.style.cssText =
        "background:linear-gradient(90deg,#6C4CF1,#22D3EE);color:#fff;font-size:.92rem;padding:9px 16px;text-align:center;line-height:1.4;";
      bar.innerHTML = unseen
        .map((i) => {
          const icon = i.kind === "special" ? "🎉" : "📰";
          const label = i.kind === "special" ? "Especial de hoje" : "Novo no blog";
          const a = document.createElement("a");
          a.href = i.slug;
          a.textContent = icon + " " + label + ": " + i.title + " →";
          a.style.cssText = "color:#fff;font-weight:600;text-decoration:underline;";
          return a.outerHTML;
        })
        .join('<span style="opacity:.7;margin:0 10px;">·</span>');
      const header = document.querySelector(".site-header");
      if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
      else document.body.prepend(bar);
    }

    /* Selo NOVO/ESPECIAL nos cards do /blog/ */
    document.querySelectorAll(".post-card a.more").forEach((a) => {
      items.forEach((i) => {
        let seen = false;
        try { seen = !!localStorage.getItem(seenKey(i.slug)); } catch (e) {}
        if (a.getAttribute("href") === i.slug && !seen) {
          const h3 = a.closest(".post-card") && a.closest(".post-card").querySelector("h3");
          if (h3 && !h3.querySelector(".zyva-badge")) {
            const b = document.createElement("span");
            b.className = "zyva-badge";
            b.textContent = i.kind === "special" ? "ESPECIAL" : "NOVO";
            b.style.cssText =
              "display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.5px;background:linear-gradient(90deg,#6C4CF1,#22D3EE);color:#fff;vertical-align:middle;";
            h3.appendChild(b);
          }
        }
      });
    });
  } catch (e) {}
})();
