/* ============================================================
   ZYVA SIGNAL — camada de experiência "Do ruído ao sinal"
   Zero dependências. Respeita prefers-reduced-motion.
   Módulos: sintonia (entrada), campo de sinal (herói),
            fio do sinal (leitura), dissolve por scroll.
   ============================================================ */
(() => {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn("[zyva-signal]", name, e); } };

  document.documentElement.classList.add("js-sig");

  /* ==========================================================
     1. SINTONIA — entrada da experiência (home, 1x por sessão)
        Uma linha de estática que se resolve na onda da marca.
     ========================================================== */
  safe("sintonia", () => {
    const el = document.getElementById("tuning");
    if (!el) return;

    const done = () => {
      document.documentElement.classList.add("sig-ready");
      el.classList.add("t-out");
      setTimeout(() => el.remove(), 700);
    };

    let seen = false;
    try { seen = sessionStorage.getItem("zyvaTuned") === "1"; } catch (e) {}

    if (REDUCED || seen) {
      document.documentElement.classList.add("sig-ready");
      el.remove();
      return;
    }
    try { sessionStorage.setItem("zyvaTuned", "1"); } catch (e) {}

    const canvas = el.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const DUR = 1050;
    const start = performance.now();

    const resize = () => {
      canvas.width = Math.min(560, window.innerWidth * 0.8) * 2;
      canvas.height = 120 * 2;
      canvas.style.width = canvas.width / 2 + "px";
      canvas.style.height = canvas.height / 2 + "px";
    };
    resize();

    const N = 140;
    const seedR = [];
    for (let i = 0; i < N; i++) seedR.push(Math.random() * 2 - 1);

    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, "#6C4CF1");
    grad.addColorStop(1, "#22D3EE");

    const frame = (now) => {
      const t = clamp((now - start) / DUR, 0, 1);
      const e = 1 - Math.pow(1 - t, 3); /* easeOutCubic */
      const w = canvas.width, h = canvas.height, mid = h / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 3;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        const noise = seedR[i] * (1 - e) * 42 * (0.4 + Math.random() * 0.6);
        const wave = Math.sin((i / (N - 1)) * Math.PI * 3 + now * 0.004) * 26 * e;
        const y = mid + noise + wave;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (t < 1) { requestAnimationFrame(frame); } else { done(); }
    };
    requestAnimationFrame(frame);

    /* segurança: nunca prender o usuário */
    setTimeout(() => { if (document.getElementById("tuning")) done(); }, DUR + 900);
  });

  /* Sem overlay (páginas internas): libera o estado imediatamente */
  if (!document.getElementById("tuning")) {
    document.documentElement.classList.add("sig-ready");
  }

  /* ==========================================================
     2. CAMPO DE SINAL — herói da home
        Partículas em ruído que se ORGANIZAM em ondas perto do
        cursor (desktop) ou do toque (mobile). Ruído -> sinal.
     ========================================================== */
  safe("signal-field", () => {
    const canvas = document.querySelector("[data-signal-field]");
    if (!canvas) return;
    const hero = canvas.closest(".hero") || canvas.parentElement;

    if (REDUCED) { canvas.remove(); return; }

    const ctx = canvas.getContext("2d");
    const DPR = clamp(window.devicePixelRatio || 1, 1, FINE ? 1.5 : 1.25);

    let W = 0, H = 0, parts = [], streams = 5;
    const pointer = { x: -9999, y: -9999, on: false };
    const ripples = [];
    let order = 0;            /* organização global 0..1 */
    let orderTarget = 0.32;   /* baseline após a sintonia */
    let dissolve = 0;         /* progresso de scroll no herói */
    let running = false, raf = 0, lastT = 0;

    const resize = () => {
      const r = hero.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const budget = FINE ? 9500 : 16000;
      const count = clamp(Math.round((W * H) / budget), 70, 240);
      parts = [];
      for (let i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          px: 0, py: 0,
          v: 0.35 + Math.random() * 0.75,
          stream: Math.floor(Math.random() * streams),
          ph: Math.random() * Math.PI * 2,
          j: Math.random() * 2 - 1,
          jt: Math.random() * 1000
        });
      }
    };

    const streamY = (p, x, t) =>
      H * (0.18 + (p.stream / (streams - 1)) * 0.64) +
      Math.sin(x * 0.012 + t * 0.0011 + p.ph) * (H * 0.045) +
      Math.sin(x * 0.004 - t * 0.0006) * (H * 0.02);

    const frame = (now) => {
      if (!running) return;
      const dt = clamp(now - lastT, 8, 40); lastT = now;

      order += (orderTarget - order) * 0.02;
      const fadeAll = 1 - dissolve * 0.92;

      ctx.clearRect(0, 0, W, H);
      if (fadeAll <= 0.02) { raf = requestAnimationFrame(frame); return; }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += dt * 0.28; rp.a -= dt * 0.0008;
        if (rp.a <= 0) ripples.splice(i, 1);
      }

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.px = p.x; p.py = p.y;
        p.x += p.v * (dt * 0.06) * (1 + dissolve * 0.6);
        if (p.x > W + 8) { p.x = -8; p.y = Math.random() * H; }

        /* ordem local: cursor + ondas de toque */
        let local = 0;
        if (pointer.on) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y;
          local = clamp(1 - Math.hypot(dx, dy) / 320, 0, 1);
        }
        for (const rp of ripples) {
          const d = Math.abs(Math.hypot(p.x - rp.x, p.y - rp.y) - rp.r);
          local = Math.max(local, clamp(1 - d / 90, 0, 1) * rp.a * 2.2);
        }
        const k = clamp(order + local, 0, 1);

        /* ruído: passeio pseudo-aleatório */
        p.jt += dt * 0.002;
        const nY = p.y + Math.sin(p.jt * 3.1 + p.ph * 7) * 1.6 * (1 - k) + p.j * (1 - k) * 0.6;
        const sY = streamY(p, p.x, now);
        p.y = nY + (sY - nY) * (0.055 + k * 0.13);
        p.y -= dissolve * dt * 0.05 * (0.5 + p.v);

        const mix = clamp(p.x / W, 0, 1);
        const r = Math.round(108 + (34 - 108) * mix);
        const g = Math.round(76 + (211 - 76) * mix);
        const b = Math.round(241 + (238 - 241) * mix);
        const a = (0.16 + k * 0.5) * fadeAll;

        ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + a + ")";
        ctx.lineWidth = 1.6 + k * 1.2;
        ctx.beginPath();
        ctx.moveTo(p.px - (p.v * 6) * (0.4 + k), p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };

    const play = () => { if (!running) { running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    /* interação */
    if (FINE) {
      hero.addEventListener("pointermove", (e) => {
        const r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
      }, { passive: true });
      hero.addEventListener("pointerleave", () => { pointer.on = false; }, { passive: true });
    } else {
      hero.addEventListener("touchstart", (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        if (ripples.length < 3) ripples.push({ x: t.clientX - r.left, y: t.clientY - r.top, r: 10, a: 0.9 });
      }, { passive: true });
    }

    /* dissolve conforme o herói sai da tela + pausa fora da tela */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        dissolve = clamp(-r.top / (r.height * 0.85), 0, 1);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? play() : stop()));
    }, { threshold: 0.01 });
    io.observe(hero);

    document.addEventListener("visibilitychange", () => {
      document.hidden ? stop() : onScroll() || play();
    });

    let rT;
    window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(resize, 180); });

    resize();
    /* após a sintonia, o campo "acorda" — a ordem baseline sobe */
    const boot = () => { orderTarget = 0.32; play(); };
    if (document.documentElement.classList.contains("sig-ready")) boot();
    else setTimeout(boot, 1150);
  });

  /* ==========================================================
     3. FIO DO SINAL — linha de leitura (desktop, home)
        Um fio gradiente desce acompanhando o progresso da
        página: o sinal percorrendo o método.
     ========================================================== */
  safe("signal-thread", () => {
    const thread = document.querySelector("[data-sig-thread]");
    if (!thread || REDUCED) { if (thread) thread.remove(); return; }
    if (window.innerWidth < 1100) { thread.remove(); return; }

    const fill = thread.querySelector(".sig-thread-fill");
    const dot = thread.querySelector(".sig-thread-dot");
    let ticking = false;

    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      fill.style.transform = "scaleY(" + p.toFixed(4) + ")";
      dot.style.transform = "translateY(" + (p * (window.innerHeight - 24)).toFixed(1) + "px)";
      dot.style.opacity = p > 0.005 ? "1" : "0";
    };
    window.addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  });
})();

/* ============================================================
   FASES INTERNAS — cada página com sua própria linguagem
   ============================================================ */
(() => {
  "use strict";
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(pointer: fine)").matches;
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn("[zyva-signal]", name, e); } };

  /* ---- CASES: holofote de descoberta nos cards ---- */
  safe("spotlight", () => {
    if (!FINE || REDUCED) return;
    const cards = document.querySelectorAll(".case-card, .m3-card, .post-card");
    if (!cards.length) return;
    cards.forEach((card) => {
      card.classList.add("spot");
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--sx", ((e.clientX - r.left) / r.width * 100).toFixed(2) + "%");
        card.style.setProperty("--sy", ((e.clientY - r.top) / r.height * 100).toFixed(2) + "%");
      }, { passive: true });
    });
  });

  /* ---- SERVIÇOS: energia fluindo na máquina ---- */
  safe("machine-flow", () => {
    if (REDUCED) return;
    const svg = document.querySelector(".pipe-svg");
    const rail = svg && svg.querySelector(".pipe-rail");
    if (!rail) return;
    const flow = rail.cloneNode(false);
    flow.setAttribute("class", "pipe-flow");
    svg.insertBefore(flow, rail.nextSibling);
  });

  /* ---- SOBRE: manifesto cinético (palavra a palavra) ---- */
  safe("manifesto", () => {
    const h1 = document.querySelector(".manifesto");
    if (!h1) return;
    const words = h1.textContent.trim().split(/\s+/);
    h1.textContent = "";
    words.forEach((w, i) => {
      const o = document.createElement("span");
      o.className = "mf-w";
      const inner = document.createElement("span");
      inner.className = "mf-wi";
      inner.textContent = w;
      inner.style.transitionDelay = REDUCED ? "0s" : (0.12 + i * 0.055) + "s";
      o.appendChild(inner);
      h1.appendChild(o);
      h1.appendChild(document.createTextNode(" "));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => h1.classList.add("mf-in")));
  });
})();
