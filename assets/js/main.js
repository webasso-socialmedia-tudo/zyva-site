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
  s.src = "/assets/js/captura.js?v=655778b7";
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
   a mensagem. O rastreio do clique (GA) e o lead-sinal server-side
   moram no captura.js, delegados no documento — assim cobrem também
   links criados depois, como a barra mobile.
   ================================================================ */
const waLink = (msg) =>
  "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg || WHATSAPP_DEFAULT_MSG);

document.querySelectorAll("[data-wa]").forEach((el) => {
  const msg = el.getAttribute("data-wa-msg") || WHATSAPP_DEFAULT_MSG;
  el.href = waLink(msg);
  el.target = "_blank";
  el.rel = "noopener";
});

/* Clique rumo ao WhatsApp — registrado AQUI, sincronamente, para não
   existir janela sem rastreio (o dataLayer enfileira o evento mesmo
   antes de o Analytics carregar). Delegado no documento: cobre também
   links criados depois (barra mobile, resultado do quiz). O sinal
   server-side vai via zCap quando o captura.js já estiver de pé.
   Um envio por destino por página — clique repetido não duplica. */
const waVistos = new Set();
document.addEventListener("click", (ev) => {
  const a = ev.target.closest("a[data-wa], a.wa-go, [data-wa-manual], [data-diag-wa]");
  if (!a) return;
  const origem = a.getAttribute("data-wa") ||
    (a.classList.contains("wa-go") ? "chat-simulado" :
     a.hasAttribute("data-diag-wa") ? "diagnostico" :
     a.hasAttribute("data-wa-manual") ? "formulario-manual" : "link");
  zt("clique_whatsapp", { origem, pagina: location.pathname });
  const chave = origem + "|" + (a.getAttribute("href") || "");
  if (waVistos.has(chave)) return;
  waVistos.add(chave);
  if (window.zCap) window.zCap.send("wa-clique", { origem, pagina: location.pathname });
}, true);

/* Menu mobile */
const toggle = document.querySelector(".nav-toggle");
const links = document.querySelector(".nav-links");
if (toggle && links) {
  toggle.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}

/* A animação de entrada (.reveal) agora mora no zyva-motion.js,
   no MESMO observador dos [data-reveal]/.rise — um sistema só,
   com a mesma isenção de primeira tela que protege o LCP. */

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
      /* o clique no link manual é contado pelo captura.js (delegado) */
      ok.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    /* Navegação na própria aba: nunca é bloqueada. A pequena espera
       dá tempo de o POST com keepalive sair do portão. */
    setTimeout(() => { location.href = url; }, 400);
  });
}

/* Aviso simples sem alert() nativo (estilo em style.css: #alert-box) */
function alertBox(text) {
  let box = document.querySelector("#alert-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "alert-box";
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

/* (o módulo da "cortina" do rodapé antigo saiu: procurava um
   .site-footer que não existe em nenhuma página — o rodapé do site
   é o cinematográfico, cuidado pelo zyva-motion.js) */

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
   /assets/data/latest.json é lido por dois módulos (o card da home e
   o aviso do blog). Buscar duas vezes o mesmo arquivo é desperdício
   puro — a promessa abaixo é criada uma vez e os dois esperam nela.
   ================================================================ */
let ultimoJson = null;
const lerLatest = () => {
  if (!ultimoJson) {
    ultimoJson = fetch("/assets/data/latest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return ultimoJson;
};

/* ================================================================
   Card "post do dia" na home: preenche com o último post do blog
   a partir de /assets/data/latest.json (com fallback estático).
   ================================================================ */
(async () => {
  const slot = document.querySelector("[data-latest-slot]");
  if (!slot) return;
  try {
    const data = await lerLatest();
    if (!data) return;
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
  /* Tintas escurecidas para contraste AA (≥4,5:1) sobre os fundos
     tingidos — verde e rosa antigos reprovavam em texto pequeno. */
  const CAT_COLORS = {
    "notícias": ["rgba(108,76,241,.16)", "#5B3DE0"],
    "anúncios": ["rgba(236,72,153,.14)", "#B01A5F"],
    "seo local": ["rgba(16,185,129,.15)", "#046B4B"],
    "whatsapp": ["rgba(37,211,102,.16)", "#0F7A3D"],
    "sites": ["rgba(59,130,246,.14)", "#1D4FD7"],
    "gestão": ["rgba(245,158,11,.16)", "#9A4A08"]
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
    const data = await lerLatest();
    if (!data) return;
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
            h3.appendChild(b);
          }
        }
      });
    });
  } catch (e) {}
})();

/* Rede de segurança: se o zyva-motion.js não carregar, nada de
   rodapé invisível nem de conteúdo preso em opacity:0 para sempre. */
setTimeout(() => {
  if (!document.documentElement.classList.contains("cine-on")) {
    document.documentElement.classList.add("cine-fallback");
  }
  if (!document.documentElement.classList.contains("rv-on")) {
    document.documentElement.classList.add("rv-fallback");
  }
}, 2500);
