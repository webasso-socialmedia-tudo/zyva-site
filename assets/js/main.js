/* ZYVA — main.js */

const WHATSAPP_NUMBER = "5598984337265";
const WHATSAPP_DEFAULT_MSG = "Olá, Zyva! Quero um diagnóstico gratuito para minha empresa.";
const GA_ID = "G-8LGZNFHB8D";

/* ================================================================
   MEDIÇÃO
   O Analytics do Google pesa mais que o site inteiro. Carregá-lo no
   começo custaria a primeira impressão — e performance vem antes de
   captação na ordem de prioridade. Então ele entra depois: quando a
   página termina de carregar e a linha principal fica livre, ou no
   primeiro toque da pessoa, o que vier antes. Eventos disparados
   nesse meio-tempo ficam na fila e sobem quando ele chega, então
   nenhuma conversão se perde.
   ================================================================ */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

const zt = (evento, dados) => {
  try { gtag("event", evento, dados || {}); } catch (e) {}
};
/* exposto para os outros módulos poderem contar eventos */
window.zt = zt;

/* ================================================================
   CAPTURA — o carteiro dos leads (captura.js) entra logo cedo.
   É ele quem grava cada lead no servidor antes do WhatsApp e
   segura na fila local o que o servidor não puder receber.
   ================================================================ */
(() => {
  const s = document.createElement("script");
  s.src = "/assets/js/captura.js?v=1";
  s.defer = true;
  document.head.appendChild(s);
})();

(() => {
  if (!GA_ID || GA_ID.indexOf("G-") !== 0) return;
  let carregado = false;
  const carregar = () => {
    if (carregado) return;
    carregado = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", GA_ID);
  };
  const agendar = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(carregar, { timeout: 2500 });
    else setTimeout(carregar, 1200);
  };
  if (document.readyState === "complete") agendar();
  else addEventListener("load", agendar, { once: true });
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    addEventListener(ev, carregar, { once: true, passive: true })
  );
})();

/* ================================================================
   WHATSAPP — o caminho da conversão não pode falhar em silêncio
   Cada link [data-wa] já nasce com o endereço real no HTML, então
   funciona mesmo se este arquivo não carregar. Aqui o JS só refina
   a mensagem e conta o clique.
   ================================================================ */
const waLink = (msg) =>
  "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg || WHATSAPP_DEFAULT_MSG);

document.querySelectorAll("[data-wa]").forEach((el) => {
  const msg = el.getAttribute("data-wa-msg") || WHATSAPP_DEFAULT_MSG;
  el.href = waLink(msg);
  el.target = "_blank";
  el.rel = "noopener";
  el.addEventListener("click", () => {
    zt("clique_whatsapp", {
      origem: el.getAttribute("data-wa") || "link",
      pagina: location.pathname,
    });
  });
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

/* ================================================================
   Animação de entrada
   O que já está na primeira tela aparece na hora, sem esperar o
   observador. Esperar custava meio segundo do LCP na página de
   Serviços: o parágrafo estava lá, mas em opacity 0 aguardando um
   callback que só rodava depois de todo o resto.
   ================================================================ */
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
document.querySelectorAll(".reveal").forEach((el) => {
  if (el.getBoundingClientRect().top < (window.innerHeight || 800) * 0.98) {
    el.classList.add("visible", "reveal-now");
    return;
  }
  observer.observe(el);
});

/* ================================================================
   FORMULÁRIO DE CONTATO
   Antes isto chamava window.open — e o Safari do iPhone e o navegador
   interno do Instagram bloqueiam janelas abertas por script. A pessoa
   preenchia tudo, via "enviado" e o lead sumia. Agora a navegação é
   normal, na própria aba, que nenhum bloqueador impede. E a confirmação
   só aparece junto com um link manual de verdade: se por qualquer motivo
   o WhatsApp não abrir, o caminho continua visível na tela.
   ================================================================ */
const POLITICA_VERSAO = "2026-07-31";

const form = document.querySelector("#form-contato");
if (form) {
  /* O quiz do herói pré-preenche: ninguém digita duas vezes. */
  try {
    const diag = JSON.parse(sessionStorage.getItem("zyva_diag") || "null");
    if (diag && diag.msg) {
      const m = form.querySelector('[name="mensagem"]');
      if (m && !m.value) m.value = "Fiz o diagnóstico rápido no site. " +
        "O que mais trava: " + (diag.rotuloTrava || "") + ". " +
        "Sugestão do site: " + (diag.nomesFrentes || "") + ".";
    }
  } catch (e) {}

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
    const url = waLink(msg);

    zt("lead_formulario", { servico: v("servico"), pagina: location.pathname });

    /* CAPTURA PRIMEIRO: o lead é gravado no servidor (ou na fila
       local, se o servidor falhar) ANTES de qualquer redirecionamento.
       O keepalive garante que o envio sobrevive à navegação. */
    if (window.zCap) {
      window.zCap.send("contato", {
        nome: v("nome"), empresa: v("empresa"), whatsapp: v("whatsapp"),
        servico: v("servico"), mensagem: v("mensagem")
      }, {
        consent: { ok: true, versao: POLITICA_VERSAO, ts: new Date().toISOString() },
        site: v("site") /* honeypot */
      });
    }

    const ok = document.querySelector("#form-ok");
    if (ok) {
      ok.hidden = false;
      ok.innerHTML =
        '<strong>Recebido! Sua mensagem já está registrada com a gente.</strong><br>' +
        'Abrindo o WhatsApp com ela pronta — o Weba responde em até 1 dia útil.<br>' +
        'Não abriu? <a href="' + url + '" target="_blank" rel="noopener" data-wa-manual>Toque aqui para abrir</a> ' +
        'ou chame direto no <a href="tel:+' + WHATSAPP_NUMBER + '">(98) 98433-7265</a>.';
      const manual = ok.querySelector("[data-wa-manual]");
      if (manual) manual.addEventListener("click", () => zt("whatsapp_manual", { pagina: location.pathname }));
      ok.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* Navegação na própria aba: nunca é bloqueada. A pequena espera
       dá tempo de o POST com keepalive sair do portão. */
    setTimeout(() => { location.href = url; }, 400);
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
   Rodapé revelado (estilo "cortina"): o conteúdo desliza por cima
   do rodapé fixo, que aparece no fim da rolagem. Ativado só quando
   o rodapé cabe na tela; no celular fica estático como sempre.
   ================================================================ */
(() => {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;

  /* A cortina do rodapé só faz sentido em página de FUNDO ESCURO: o
     conteúdo escuro desliza revelando o rodapé escuro por baixo. Num
     post de blog (fundo claro) ela virava uma cortina CLARA com cantos
     arredondados por cima de um rodapé escuro — a emenda quebrada. Aqui
     ela fica desligada, e o post ganha um rodapé estático normal. */
  const fundoEscuro =
    document.body.classList.contains("home") ||
    document.body.classList.contains("dark-shell");
  if (!fundoEscuro) return;

  let wrap = null;
  const build = () => {
    if (wrap) return;
    /* div, não main: a página já tem seu <main id="conteudo">.
       Dois landmarks main deixam o leitor de tela sem referência. */
    wrap = document.createElement("div");
    wrap.className = "page-curtain";
    const move = [...document.body.children].filter(
      (el) =>
        el !== footer &&
        el.tagName !== "SCRIPT" &&
        !el.classList.contains("wa-float") &&
        !el.classList.contains("skip-link") &&
        el.id !== "alert-box"
    );
    document.body.insertBefore(wrap, footer);
    move.forEach((el) => wrap.appendChild(el));
  };

  const apply = () => {
    const h = footer.offsetHeight;
    const on = window.matchMedia("(min-width: 820px)").matches && h > 0 && h < window.innerHeight * 0.92;
    if (on) build();
    document.body.classList.toggle("curtain-on", on && !!wrap);
    if (wrap) wrap.style.marginBottom = on ? h + "px" : "";
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("load", () => {
    apply();
    setTimeout(apply, 600);
  });
})();

/* ================================================================
   Números dos compromissos: contagem animada ao entrar na tela
   ================================================================ */
(() => {
  const nums = document.querySelectorAll("[data-count]");
  if (!nums.length || !("IntersectionObserver" in window)) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const end = parseInt(el.getAttribute("data-count"), 10) || 0;
        if (reduced) { el.textContent = end; return; }
        const t0 = performance.now();
        const dur = 900;
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          el.textContent = Math.round(end * ease);
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.5 }
  );
  nums.forEach((n) => io.observe(n));
})();

/* ================================================================
   Card "post do dia" na home: preenche com o último post do blog
   a partir de /assets/data/latest.json (com fallback estático).
   ================================================================ */
(async () => {
  const slot = document.querySelector("[data-latest-slot]");
  if (!slot) return;
  try {
    const res = await fetch("/assets/data/latest.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const p = (data.special && data.special.slug ? data.special : null) || data.latest;
    if (!p || !p.slug || !p.title) return;
    const chip = slot.querySelector(".post-cat");
    const title = slot.querySelector("h3");
    const link = slot.querySelector("a.more");
    if (chip) {
      chip.textContent = data.special && p === data.special ? "Especial" : "Notícias";
      chip.style.background = "rgba(108,76,241,.16)";
      chip.style.color = "#5B3DE0";
    }
    if (title) title.textContent = p.title;
    const desc = slot.querySelector("p");
    if (desc) desc.textContent = "O post de hoje no blog — análise em português claro e o que muda para a sua empresa.";
    if (link) { link.textContent = "Ler artigo →"; link.href = p.slug; }
  } catch (e) {}
})();

/* ================================================================
   Cores por categoria nos chips do blog (.post-cat)
   "Notícias" ganha violeta para destacar o conteúdo do dia;
   "Especial ..." (datas comemorativas) ganha âmbar;
   demais categorias têm cores próprias para orientar a leitura.
   Categorias não mapeadas mantêm o estilo padrão (ciano do CSS).
   ================================================================ */
(() => {
  const CAT_COLORS = {
    "notícias": ["rgba(108,76,241,.16)", "#5B3DE0"],
    "anúncios": ["rgba(236,72,153,.14)", "#DB2777"],
    "seo local": ["rgba(16,185,129,.15)", "#059669"],
    "whatsapp": ["rgba(37,211,102,.16)", "#1FA855"],
    "sites": ["rgba(59,130,246,.14)", "#2563EB"],
    "gestão": ["rgba(245,158,11,.16)", "#B45309"]
  };
  document.querySelectorAll(".post-cat").forEach((chip) => {
    const t = (chip.textContent || "").trim().toLowerCase();
    let c = CAT_COLORS[t];
    if (!c && t.indexOf("especial") === 0) c = ["rgba(255,170,40,.18)", "#B36A00"];
    if (c) {
      chip.style.background = c[0];
      chip.style.color = c[1];
    }
  });
})();

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

    /* Aviso de post novo: notificação flutuante (sem emoji, sem sublinhado) */
    if (unseen.length) {
      const wrapEl = document.createElement("div");
      wrapEl.className = "zyva-toasts";
      let shown = 0;
      unseen.slice(0, 2).forEach((i) => {
        try { if (sessionStorage.getItem("zyva_hide_" + i.slug)) return; } catch (e) {}
        const special = i.kind === "special";
        const t = document.createElement("aside");
        t.className = "zyva-toast " + (special ? "zt-special" : "zt-news");
        t.setAttribute("role", "status");
        t.innerHTML =
          '<button class="zt-close" type="button" aria-label="Fechar aviso">&times;</button>' +
          '<span class="zt-label"><span class="zt-dot"></span><span class="zt-label-text"></span></span>' +
          '<strong class="zt-title"></strong>' +
          '<a class="zt-link">Ler agora <span aria-hidden="true">&rarr;</span></a>' +
          '<span class="zt-hint-arrow zt-hint-up" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></span>' +
          '<span class="zt-hint-arrow zt-hint-right" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
          '<span class="zt-flash" aria-hidden="true"></span>';
        t.querySelector(".zt-label-text").textContent = special ? "Especial de hoje" : "Novo no blog";
        t.querySelector(".zt-title").textContent = i.title;
        t.querySelector(".zt-link").href = i.slug;

        let interacted = false;
        let island = null;

        const hide = (remember) => {
          if (remember) {
            try { sessionStorage.setItem("zyva_hide_" + i.slug, "1"); } catch (e) {}
          }
          t.classList.remove("zt-in");
          setTimeout(() => t.remove(), 400);
        };
        t.querySelector(".zt-close").addEventListener("click", () => hide(true));

        /* --- confirmação curta sobre o toast --- */
        const flashEl = t.querySelector(".zt-flash");
        const showFlash = (msg, withCheck) => {
          flashEl.innerHTML = (withCheck
            ? '<svg class="zt-flash-ic" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' : "") + msg;
          flashEl.classList.add("on");
        };

        /* --- deslizar para CIMA: ativa avisos do navegador --- */
        const subscribeNotify = () => {
          interacted = true;
          t.style.transition = "transform .3s ease, opacity .3s ease";
          t.style.transform = "translateY(-12px)";
          t.style.opacity = "1";
          const fire = () => {
            try {
              const n = new Notification("Novo no blog — Zyva", {
                body: i.title,
                icon: "/assets/img/favicon.svg",
                badge: "/assets/img/favicon.svg",
                tag: "zyva-blog"
              });
              n.onclick = () => { window.focus(); location.href = i.slug; try { n.close(); } catch (e) {} };
            } catch (e) {}
          };
          if (!("Notification" in window)) {
            showFlash("Seu navegador não suporta avisos", false);
            setTimeout(() => hide(true), 1900); return;
          }
          if (Notification.permission === "granted") {
            fire(); showFlash("Avisos ativados", true); setTimeout(() => hide(true), 1700);
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((perm) => {
              if (perm === "granted") { fire(); showFlash("Avisos ativados", true); }
              else { showFlash("Avisos não permitidos", false); }
              setTimeout(() => hide(true), 1700);
            }).catch(() => { showFlash("Não foi possível ativar", false); setTimeout(() => hide(true), 1900); });
          } else {
            showFlash("Avisos bloqueados no navegador", false);
            setTimeout(() => hide(true), 2100);
          }
        };

        /* --- deslizar para o LADO: minimiza em Ilha Dinâmica --- */
        const expandFromIsland = () => {
          if (island) { island.classList.remove("zi-in"); const isl = island; island = null; setTimeout(() => isl.remove(), 380); }
          t.style.display = "";
          t.style.transition = "transform .45s cubic-bezier(.16,1,.3,1), opacity .35s ease";
          requestAnimationFrame(() => { t.style.transform = ""; t.style.opacity = "1"; t.classList.add("zt-in"); });
        };
        const minimize = () => {
          interacted = true;
          t.style.transition = "transform .42s cubic-bezier(.4,0,.2,1), opacity .42s ease";
          t.style.transform = "translate(0,-46px) scale(.55)";
          t.style.opacity = "0";
          setTimeout(() => { t.style.display = "none"; }, 440);
          if (island) { island.classList.add("zi-in"); return; }
          island = document.createElement("button");
          island.type = "button";
          island.className = "zyva-island" + (special ? " zt-special-i" : "");
          island.setAttribute("aria-label", "Abrir aviso do blog: " + i.title);
          island.innerHTML =
            '<span class="zi-dot"></span>' +
            '<svg class="zi-bell" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
            '<svg class="zi-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
          island.addEventListener("click", expandFromIsland);
          document.body.appendChild(island);
          requestAnimationFrame(() => island.classList.add("zi-in"));
        };

        /* --- gestos (mouse + toque via Pointer Events) --- */
        let sx = 0, sy = 0, dragging = false;
        const TH = 46;
        const onDown = (e) => {
          if (e.target.closest(".zt-close") || e.target.closest(".zt-link")) return;
          dragging = true; interacted = true;
          sx = e.clientX; sy = e.clientY;
          t.classList.remove("zt-hint");
          t.style.animation = "none";
          t.classList.add("zt-dragging");
          try { t.setPointerCapture(e.pointerId); } catch (er) {}
        };
        const onMove = (e) => {
          if (!dragging) return;
          const dx = e.clientX - sx;
          const ty = Math.min(e.clientY - sy, 0); /* só reage para cima */
          t.style.transform = "translate(" + dx + "px," + ty + "px)";
          const far = Math.max(-ty, Math.abs(dx));
          t.style.opacity = String(Math.max(0.4, 1 - far / 240));
        };
        const onUp = (e) => {
          if (!dragging) return;
          dragging = false;
          t.classList.remove("zt-dragging");
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (-dy > TH && -dy >= Math.abs(dx)) { subscribeNotify(); }
          else if (Math.abs(dx) > TH) { minimize(); }
          else { t.style.transform = ""; t.style.opacity = ""; } /* volta */
        };
        t.addEventListener("pointerdown", onDown);
        t.addEventListener("pointermove", onMove);
        t.addEventListener("pointerup", onUp);
        t.addEventListener("pointercancel", onUp);

        wrapEl.appendChild(t);
        shown++;
        const delay = 900 + shown * 260;
        setTimeout(() => t.classList.add("zt-in"), delay);
        /* dica: leves movimentos + setas mostrando as direções */
        setTimeout(() => { if (!interacted && document.body.contains(t)) t.classList.add("zt-hint"); }, delay + 700);

        /* Some sozinho se o visitante não interagir; interação cancela. */
        setTimeout(() => { if (!interacted) hide(false); }, 13000 + shown * 260);
        const onScroll = () => {
          if (window.scrollY > 600) {
            window.removeEventListener("scroll", onScroll);
            if (!interacted) hide(false);
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
      });
      if (wrapEl.children.length) document.body.appendChild(wrapEl);
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

/* Rede de segurança do rodapé: se o zyva-motion.js não carregar,
   nada de rodapé invisível para sempre. */
setTimeout(() => {
  if (!document.documentElement.classList.contains("cine-on")) {
    document.documentElement.classList.add("cine-fallback");
  }
}, 2500);
