/* ============================================================
   ZYVA — Motion Engine v1
   Zero dependências. Sem GSAP, sem Three.js, sem React.
   Portes em JS puro de: TargetCursor, RotatingText, TiltedCard.
   Cada módulo é isolado — se um falhar, os outros continuam.
   ============================================================ */
(() => {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(pointer: fine)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  /* Normaliza p dentro da faixa [a,b] → 0..1 */
  const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const safe = (name, fn) => {
    try { fn(); } catch (e) { console.warn("[zyva-motion] " + name, e); }
  };

  /* ==========================================================
     1. Scroll suave (mini-Lenis: usa window.scrollTo, então
        position:sticky e position:fixed continuam funcionando)
     ========================================================== */
  safe("smooth-scroll", () => {
    if (REDUCED || !FINE) return;
    if (document.documentElement.dataset.noSmooth === "1") return;

    /* CRÍTICO: o CSS tem `html { scroll-behavior: smooth }`. Se ficar ligado,
       cada window.scrollTo() vira uma animação nativa que a chamada do frame
       seguinte cancela — a página trava em ~2px. A inércia daqui substitui
       aquela, então desligamos a nativa e animamos as âncoras nós mesmos. */
    document.documentElement.style.scrollBehavior = "auto";

    let target = window.scrollY;
    let current = target;
    let lastSet = Math.round(current);
    let running = false;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const tick = () => {
      current += (target - current) * 0.13;
      if (Math.abs(target - current) < 0.4) {
        current = target;
        running = false;
      }
      lastSet = Math.round(current);
      window.scrollTo(0, lastSet);
      if (running) requestAnimationFrame(tick);
    };

    const start = () => {
      if (!running) {
        running = true;
        requestAnimationFrame(tick);
      }
    };

    window.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) return;                       /* zoom do navegador */
        if (e.target.closest("[data-native-scroll]")) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 22 : e.deltaMode === 2 ? window.innerHeight : 1;
        target = clamp(target + e.deltaY * unit, 0, maxScroll());
        start();
      },
      { passive: false }
    );

    /* Âncoras internas: animadas pela mesma inércia */
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      const dest = document.querySelector(id);
      if (!dest) return;
      e.preventDefault();
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 90;
      target = clamp(dest.getBoundingClientRect().top + window.scrollY - pad, 0, maxScroll());
      start();
      history.replaceState(null, "", id);
    });

    /* Se qualquer outra coisa rolar a página (teclado,
       barra de rolagem), reassume a posição real. */
    window.addEventListener(
      "scroll",
      () => {
        if (Math.abs(window.scrollY - lastSet) > 3) {
          target = current = lastSet = window.scrollY;
          running = false;
        }
      },
      { passive: true }
    );
  });

  /* ==========================================================
     2. Divisão de texto em palavras + revelação com máscara
        Preserva a estrutura HTML interna (<em>, <span>, links).
     ========================================================== */
  /* Elementos com gradiente recortado no texto (background-clip: text) não
     podem ser fatiados: cada fatia vira um inline-block e o recorte se perde,
     deixando o texto invisível. Esses viram UMA peça só. */
  const isClipped = (el) => {
    const s = getComputedStyle(el);
    return s.webkitBackgroundClip === "text" || s.backgroundClip === "text";
  };

  const splitWords = (el) => {
    const walk = (node) => {
      const kids = Array.from(node.childNodes);
      kids.forEach((child) => {
        if (child.nodeType === 1 && isClipped(child)) {
          child.classList.add("rv-word");
          return;
        }
        if (child.nodeType === 3) {
          const txt = child.textContent;
          if (!txt.trim()) return;
          const frag = document.createDocumentFragment();
          txt.split(/(\s+)/).forEach((piece) => {
            if (!piece) return;
            if (!piece.trim()) {
              frag.appendChild(document.createTextNode(piece));
              return;
            }
            const w = document.createElement("span");
            w.className = "rv-word";
            w.textContent = piece;
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && !child.classList.contains("rv-word")) {
          walk(child);
        }
      });
    };
    walk(el);
    const words = el.querySelectorAll(".rv-word");
    words.forEach((w, i) => w.style.setProperty("--rv-d", i * 0.045 + "s"));
    el.classList.add("rv-split");
    return words.length;
  };

  safe("reveal", () => {
    const heads = document.querySelectorAll("[data-reveal]");
    if (!REDUCED) heads.forEach((el) => splitWords(el));

    const items = document.querySelectorAll("[data-reveal], .rise");
    if (!items.length) return;

    if (REDUCED || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("rv-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("rv-in");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el) => io.observe(el));
  });

  /* ==========================================================
     3. Cursor-alvo (port do TargetCursor do React Bits)
        Cantos que travam no elemento sob o mouse.
     ========================================================== */
  safe("target-cursor", () => {
    if (REDUCED || !FINE || window.innerWidth <= 900) return;

    const SEL = ".cursor-target";
    const SIZE = 13;
    const BORDER = 2.5;

    const root = document.createElement("div");
    root.className = "zcursor";
    root.innerHTML =
      '<div class="zcursor-dot"></div>' +
      '<div class="zcursor-c zc-tl"></div><div class="zcursor-c zc-tr"></div>' +
      '<div class="zcursor-c zc-br"></div><div class="zcursor-c zc-bl"></div>';
    document.body.appendChild(root);
    document.body.classList.add("zcursor-active");

    const dot = root.querySelector(".zcursor-dot");
    const corners = Array.from(root.querySelectorAll(".zcursor-c"));
    /* posições de repouso: um quadrado girando em volta do ponto */
    const rest = [
      [-SIZE * 1.45, -SIZE * 1.45],
      [SIZE * 0.45, -SIZE * 1.45],
      [SIZE * 0.45, SIZE * 0.45],
      [-SIZE * 1.45, SIZE * 0.45],
    ];

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let spin = 0;
    let active = null;
    let lock = 0;                       /* 0 = solto, 1 = travado no alvo */
    const cur = rest.map((r) => r.slice());

    window.addEventListener(
      "mousemove",
      (e) => {
        mx = e.clientX;
        my = e.clientY;
        if (!root.classList.contains("on")) root.classList.add("on");
      },
      { passive: true }
    );

    window.addEventListener("mouseover", (e) => {
      const t = e.target.closest ? e.target.closest(SEL) : null;
      if (t !== active) active = t;
    }, { passive: true });

    window.addEventListener("mouseout", (e) => {
      if (active && !e.relatedTarget) active = null;
    }, { passive: true });

    let pressed = false;
    window.addEventListener("mousedown", () => (pressed = true));
    window.addEventListener("mouseup", () => (pressed = false));

    const loop = () => {
      cx += (mx - cx) * 0.19;
      cy += (my - cy) * 0.19;

      /* alvo ainda válido? (pode ter saído da tela no scroll) */
      if (active && !document.body.contains(active)) active = null;

      const want = active ? 1 : 0;
      lock += (want - lock) * 0.16;

      let goal = rest;
      if (active) {
        const r = active.getBoundingClientRect();
        if (r.width && r.height) {
          goal = [
            [r.left - BORDER - cx, r.top - BORDER - cy],
            [r.right + BORDER - SIZE - cx, r.top - BORDER - cy],
            [r.right + BORDER - SIZE - cx, r.bottom + BORDER - SIZE - cy],
            [r.left - BORDER - cx, r.bottom + BORDER - SIZE - cy],
          ];
        } else {
          active = null;
        }
      }

      spin = active ? spin * 0.86 : spin + 0.55;      /* para de girar ao travar */
      const s = pressed ? 0.82 : 1;

      corners.forEach((c, i) => {
        const gx = rest[i][0] + (goal[i][0] - rest[i][0]) * lock;
        const gy = rest[i][1] + (goal[i][1] - rest[i][1]) * lock;
        cur[i][0] += (gx - cur[i][0]) * 0.3;
        cur[i][1] += (gy - cur[i][1]) * 0.3;
        c.style.transform =
          "translate(" + cur[i][0].toFixed(2) + "px," + cur[i][1].toFixed(2) + "px) scale(" + s + ")";
      });

      root.style.transform =
        "translate(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px) rotate(" +
        (spin * (1 - lock)).toFixed(2) + "deg)";
      dot.style.transform = "scale(" + (pressed ? 0.6 : 1) + ")";

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  /* ==========================================================
     4. Botões magnéticos
     ========================================================== */
  safe("magnetic", () => {
    if (REDUCED || !FINE) return;
    document.querySelectorAll(".magnetic").forEach((el) => {
      const inner = el.firstElementChild || el;
      let raf = null;
      let tx = 0, ty = 0, ix = 0, iy = 0;

      const run = () => {
        ix += (tx - ix) * 0.18;
        iy += (ty - iy) * 0.18;
        el.style.transform = "translate(" + ix.toFixed(2) + "px," + iy.toFixed(2) + "px)";
        if (inner !== el) {
          inner.style.transform =
            "translate(" + (ix * 0.35).toFixed(2) + "px," + (iy * 0.35).toFixed(2) + "px)";
        }
        if (Math.abs(tx - ix) > 0.1 || Math.abs(ty - iy) > 0.1) raf = requestAnimationFrame(run);
        else raf = null;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(run); };

      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        tx = (e.clientX - r.left - r.width / 2) * 0.32;
        ty = (e.clientY - r.top - r.height / 2) * 0.42;
        kick();
      });
      el.addEventListener("mouseleave", () => { tx = 0; ty = 0; kick(); });
    });
  });

  /* ==========================================================
     5. Texto rotativo (port do RotatingText do React Bits)
        <span data-rotate='["a","b"]' data-rotate-interval="2600">
     ========================================================== */
  safe("rotating-text", () => {
    document.querySelectorAll("[data-rotate]").forEach((host) => {
      let list;
      try { list = JSON.parse(host.getAttribute("data-rotate")); } catch (e) { return; }
      if (!Array.isArray(list) || !list.length) return;

      const interval = parseInt(host.getAttribute("data-rotate-interval"), 10) || 2600;
      host.classList.add("rot-text");
      host.setAttribute("aria-live", "polite");
      /* limpa o texto que veio no HTML (fallback para quem está sem JS),
         senão ele fica somado ao texto animado */
      host.textContent = "";

      let idx = 0;
      let inner = null;

      const build = (text, animateIn) => {
        const box = document.createElement("span");
        box.className = "rot-text-inner";
        const chars = Array.from(text);
        chars.forEach((ch, i) => {
          const s = document.createElement("span");
          s.className = "rot-char" + (animateIn ? " in" : "");
          /* stagger a partir do fim, como no exemplo do React Bits */
          s.style.setProperty("--rc-d", (chars.length - 1 - i) * 0.022 + "s");
          s.textContent = ch;
          box.appendChild(s);
        });
        return box;
      };

      const render = (first) => {
        const next = build(list[idx], !first && !REDUCED);
        if (inner && !REDUCED) {
          const old = inner;
          const oldChars = Array.from(old.querySelectorAll(".rot-char"));
          oldChars.forEach((c, i) => {
            c.classList.remove("in");
            c.style.setProperty("--rc-d", i * 0.018 + "s");
            c.classList.add("out");
          });
          setTimeout(() => old.remove(), 520);
          old.style.position = "absolute";
          old.style.left = "0";
          old.style.top = "0";
        } else if (inner) {
          inner.remove();
        }
        host.appendChild(next);
        inner = next;
      };

      render(true);
      if (list.length > 1) {
        setInterval(() => {
          idx = (idx + 1) % list.length;
          render(false);
        }, interval);
      }
    });
  });

  /* ==========================================================
     6. Inclinação 3D em cartões (port do TiltedCard)
        <div class="tilt" data-tilt="12"><div class="tilt-inner">…
     ========================================================== */
  safe("tilt", () => {
    if (REDUCED || !FINE) return;
    document.querySelectorAll(".tilt").forEach((el) => {
      const inner = el.querySelector(".tilt-inner");
      if (!inner) return;
      const amp = parseFloat(el.getAttribute("data-tilt")) || 12;
      const scale = parseFloat(el.getAttribute("data-tilt-scale")) || 1.03;

      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const ox = e.clientX - r.left - r.width / 2;
        const oy = e.clientY - r.top - r.height / 2;
        el.classList.add("act");
        inner.style.transform =
          "rotateX(" + ((oy / (r.height / 2)) * -amp).toFixed(2) + "deg) rotateY(" +
          ((ox / (r.width / 2)) * amp).toFixed(2) + "deg) scale(" + scale + ")";
      });
      el.addEventListener("mouseleave", () => {
        el.classList.remove("act");
        inner.style.transform = "";
      });
    });
  });

  /* ==========================================================
     7. Motor de cena: converte scroll em progresso 0→1
        para qualquer bloco [data-scene] com filho .sticky-like
     ========================================================== */
  const scenes = [];
  const addScene = (track, sticky, onProgress) => {
    scenes.push({ track, sticky, onProgress, last: -1 });
  };
  const runScenes = () => {
    scenes.forEach((s) => {
      const r = s.track.getBoundingClientRect();
      const travel = r.height - s.sticky.offsetHeight;
      const p = travel > 0 ? clamp(-r.top / travel, 0, 1) : r.top <= 0 ? 1 : 0;
      if (Math.abs(p - s.last) > 0.0004) {
        s.last = p;
        s.onProgress(p);
      }
    });
  };
  let sceneTicking = false;
  const scheduleScenes = () => {
    if (sceneTicking) return;
    sceneTicking = true;
    requestAnimationFrame(() => {
      sceneTicking = false;
      runScenes();
    });
  };
  window.addEventListener("scroll", scheduleScenes, { passive: true });
  window.addEventListener("resize", scheduleScenes);

  /* ==========================================================
     8. Cena do celular 3D (página de Contato)
     ========================================================== */
  safe("phone-scene", () => {
    const track = document.querySelector("[data-phone-track]");
    if (!track) return;
    const sticky = track.querySelector(".phone-sticky");
    const phone = track.querySelector(".phone");
    const head = track.querySelector(".wa-head");
    const sendbar = track.querySelector(".wa-send");
    const hint = track.querySelector(".phone-hint");
    const rail = track.querySelector(".scene-rail i");
    const greet = track.querySelector("[data-greet]");
    const day = track.querySelector(".wa-day");
    const topics = Array.from(track.querySelectorAll(".topic"));
    if (!sticky || !phone) return;

    /* inclinação extra seguindo o mouse (some quando trava de frente) */
    let mrx = 0, mry = 0, tmrx = 0, tmry = 0;
    if (FINE && !REDUCED) {
      sticky.addEventListener("mousemove", (e) => {
        const r = sticky.getBoundingClientRect();
        tmry = ((e.clientX - r.left) / r.width - 0.5) * 13;
        tmrx = ((e.clientY - r.top) / r.height - 0.5) * -9;
      });
      sticky.addEventListener("mouseleave", () => { tmry = 0; tmrx = 0; });
    }

    let progress = 0;

    const paint = () => {
      const p = progress;
      const open = easeOut(range(p, 0, 0.3));       /* abrir/girar de frente */
      const wake = range(p, 0.17, 0.34);            /* tela acendendo */

      mrx += (tmrx - mrx) * 0.08;
      mry += (tmry - mry) * 0.08;
      const mouseMix = 0.35 + 0.65 * open;          /* mouse pesa mais já aberto */

      phone.style.setProperty("--ry", (-26 * (1 - open) + mry * mouseMix).toFixed(2) + "deg");
      phone.style.setProperty("--rx", (10 * (1 - open) + mrx * mouseMix).toFixed(2) + "deg");
      phone.style.setProperty("--rz", (-4 * (1 - open)).toFixed(2) + "deg");
      phone.style.setProperty("--sc", (0.82 + 0.18 * open).toFixed(3));
      phone.style.setProperty("--ty", (26 * (1 - open)).toFixed(1) + "px");
      phone.style.setProperty("--wake", wake.toFixed(3));
      phone.style.setProperty("--glow", wake.toFixed(3));

      if (head) {
        const t = easeOut(range(p, 0.3, 0.42));
        head.style.opacity = t;
        head.style.transform = "translateY(" + (-16 * (1 - t)).toFixed(1) + "px)";
      }
      if (day) day.style.opacity = range(p, 0.36, 0.44);
      if (greet && range(p, 0.42, 0.5) > 0.35) greet.classList.add("show");
      if (sendbar) {
        const t = easeOut(range(p, 0.5, 0.62));
        sendbar.style.opacity = t;
        sendbar.style.transform = "translateY(" + (16 * (1 - t)).toFixed(1) + "px)";
      }
      topics.forEach((el, i) => {
        const a = 0.42 + i * 0.07;
        const t = easeOut(range(p, a, a + 0.11));
        el.style.opacity = t;
        el.style.transform = "translateX(" + (-26 * (1 - t)).toFixed(1) + "px)";
        el.style.pointerEvents = t > 0.85 ? "auto" : "none";
      });
      if (hint) hint.style.opacity = 1 - range(p, 0.02, 0.14);
      if (rail) rail.style.height = (p * 100).toFixed(1) + "%";
    };

    addScene(track, sticky, (p) => { progress = p; paint(); });

    /* loop leve só para a inclinação do mouse continuar suave */
    const idle = () => {
      if (Math.abs(tmrx - mrx) > 0.02 || Math.abs(tmry - mry) > 0.02) paint();
      requestAnimationFrame(idle);
    };
    if (FINE && !REDUCED) requestAnimationFrame(idle);

    /* ---- Conversa: escolher assunto monta a mensagem de verdade ---- */
    const chat = track.querySelector(".wa-chat");
    const typing = track.querySelector(".wa-typing");
    const input = track.querySelector(".wa-input");
    const go = track.querySelector(".wa-go");
    const WA = (window.ZYVA_WA || "5598984337265");
    let outBubble = null;
    let timer = null;

    const stamp = () =>
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const pick = (btn) => {
      const msg = btn.getAttribute("data-msg") || "";
      topics.forEach((t) => t.setAttribute("aria-pressed", String(t === btn)));

      if (input) {
        input.textContent = msg;
        input.classList.add("filled");
      }
      if (go) {
        go.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
        go.classList.add("ready");
        go.setAttribute("aria-label", "Enviar no WhatsApp: " + msg);
      }

      if (outBubble) { outBubble.remove(); outBubble = null; }
      clearTimeout(timer);

      const write = () => {
        if (typing) typing.classList.remove("on");
        outBubble = document.createElement("div");
        outBubble.className = "wa-b wa-out show";
        outBubble.innerHTML =
          '<span class="wa-txt"></span><span class="wa-meta">' + stamp() +
          '<svg viewBox="0 0 16 11" aria-hidden="true"><path d="M11.07.65 4.99 6.73 2.83 4.57l-.72.72 2.88 2.88L11.79 1.4zM15 .65 8.92 6.73 8.2 6.01l-.72.72L8.92 8.2 15.72 1.4z"/></svg></span>';
        if (chat) chat.appendChild(outBubble);
        const txt = outBubble.querySelector(".wa-txt");
        if (REDUCED) { txt.textContent = msg; return; }
        let i = 0;
        const type = () => {
          txt.textContent = msg.slice(0, ++i);
          if (i < msg.length) timer = setTimeout(type, 16);
        };
        type();
      };

      if (typing && !REDUCED) {
        typing.classList.add("on");
        timer = setTimeout(write, 620);
      } else {
        write();
      }
    };

    topics.forEach((btn) => {
      btn.addEventListener("click", () => pick(btn));
      if (FINE) btn.addEventListener("mouseenter", () => {
        if (!topics.some((t) => t.getAttribute("aria-pressed") === "true")) pick(btn);
      });
    });

    paint();
    scheduleScenes();
  });

  /* ==========================================================
     9. Relógio e status de atendimento ao vivo (America/Sao_Paulo)
     ========================================================== */
  safe("live-status", () => {
    const clocks = document.querySelectorAll("[data-clock]");
    const status = document.querySelector("[data-live-status]");
    if (!clocks.length && !status) return;

    const brt = () => {
      const s = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      return new Date(s);
    };

    const tick = () => {
      const d = brt();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      clocks.forEach((c) => (c.textContent = hh + ":" + mm));

      if (status) {
        const day = d.getDay();
        const open = day >= 1 && day <= 5 && d.getHours() >= 9 && d.getHours() < 18;
        const label = status.querySelector("[data-live-label]");
        status.classList.toggle("off", !open);
        if (label) {
          label.textContent = open
            ? "Atendendo agora — resposta em minutos"
            : "Fora do horário — respondemos no próximo dia útil";
        }
      }
    };
    tick();
    setInterval(tick, 20000);
  });

  /* ==========================================================
     10. Campo de partículas que se organiza no "Z" da marca (Home)
         Metáfora do trabalho: atenção dispersa vira marca.
     ========================================================== */
  safe("particle-logo", () => {
    const cv = document.querySelector("[data-particle-z]");
    if (!cv) return;
    const host = cv.parentElement;
    if (REDUCED) { cv.style.display = "none"; return; }
    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;

    const Z_POLY = "10,10 54,10 54,20 38,31 46,31 30,44 54,44 54,54 10,54 10,44 26,33 18,33 34,20 10,20";

    /* Rasteriza o polígono do Z e amostra pontos internos: é a forma exata
       do logo, sem precisar embutir coordenadas à mão. */
    const sampleLogo = () => {
      const S = 200;
      const off = document.createElement("canvas");
      off.width = off.height = S;
      const c = off.getContext("2d");
      c.fillStyle = "#fff";
      c.beginPath();
      Z_POLY.split(" ").forEach((pair, i) => {
        const xy = pair.split(",");
        const px = (+xy[0] / 64) * S;
        const py = (+xy[1] / 64) * S;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath();
      c.fill();
      const d = c.getImageData(0, 0, S, S).data;
      const out = [];
      for (let y = 0; y < S; y += 3) {
        for (let x = 0; x < S; x += 3) {
          if (d[(y * S + x) * 4 + 3] > 140) out.push([x / S - 0.5, y / S - 0.5]);
        }
      }
      return out;
    };

    const targets = sampleLogo();
    if (!targets.length) return;

    let W = 0, H = 0, dpr = 1, box = 0, cxp = 0, cyp = 0;
    let mouse = { x: -9999, y: -9999 };
    let gather = 0;          /* 0 = disperso, 1 = formado */
    let started = 0;
    const parts = [];

    const layout = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + "px";
      cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Posição medida, não chutada: o Z ocupa o corredor livre entre o
         texto e o painel branco — assim nenhum trecho do traço fica
         escondido atrás do cartão e a letra se lê inteira. */
      const mock = host.querySelector(".mock");
      if (mock && W > 860) {
        const m = mock.getBoundingClientRect();
        const cardLeft = Math.max(360, m.left - r.left);
        box = Math.max(300, Math.min(H * 1.02, (cardLeft + 60) * 0.55));
        cxp = (cardLeft + 60) - box * 0.36;
        cyp = H * 0.54;
      } else {
        /* layout empilhado: vira um selo no alto, perto do título */
        box = Math.min(W * 0.55, H * 0.6);
        cxp = W * 0.80;
        cyp = H * 0.30;
      }
    };
    window.addEventListener("load", layout);

    layout();
    targets.forEach((t) => {
      parts.push({
        tx: t[0], ty: t[1],
        x: Math.random() * W, y: Math.random() * H,
        vx: 0, vy: 0,
        ph: Math.random() * Math.PI * 2,
        sz: 1.1 + Math.random() * 1.7
      });
    });

    host.addEventListener("mousemove", (e) => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    host.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });
    window.addEventListener("resize", layout);

    const draw = (t) => {
      if (!started) started = t;
      /* forma sozinho na entrada (sem exigir scroll) */
      gather = Math.min(1, (t - started) / 2200);
      const g = 1 - Math.pow(1 - gather, 3);

      /* some conforme sai da tela — não gasta bateria fora de vista */
      const r = host.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) {
        requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, W, H);
      const time = t * 0.001;

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const hx = cxp + p.tx * box + Math.sin(time * 0.6 + p.ph) * 2.2;
        const hy = cyp + p.ty * box + Math.cos(time * 0.5 + p.ph) * 2.2;
        const gx = p.x + (hx - p.x) * 0.055 * (0.25 + g);
        const gy = p.y + (hy - p.y) * 0.055 * (0.25 + g);

        /* o cursor empurra as partículas */
        let dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        let push = 0;
        if (d2 < 13000) {
          const d = Math.sqrt(d2) || 1;
          push = (1 - d / 114) * 5.5;
          dx /= d; dy /= d;
        }
        p.x = gx + (push ? dx * push : 0);
        p.y = gy + (push ? dy * push : 0);

        const mix = (p.tx + 0.5);
        ctx.fillStyle =
          "rgba(" + Math.round(108 + mix * (34 - 108)) + "," +
          Math.round(76 + mix * (211 - 76)) + "," +
          Math.round(241 + mix * (238 - 241)) + "," +
          (0.16 + g * 0.6) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, 6.283);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  /* ==========================================================
     11. Máquina de marketing: o fluxo se desenha no scroll (Serviços)
     ========================================================== */
  safe("pipeline", () => {
    const wrap = document.querySelector("[data-pipeline]");
    if (!wrap) return;
    const path = wrap.querySelector(".pipe-line");
    const dot = wrap.querySelector(".pipe-dot");
    const nodes = Array.from(wrap.querySelectorAll(".pipe-node"));
    if (!path) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = REDUCED ? 0 : len;

    const paint = (p) => {
      path.style.strokeDashoffset = len * (1 - p);
      if (dot && p > 0.02) {
        const pt = path.getPointAtLength(len * p);
        dot.setAttribute("cx", pt.x);
        dot.setAttribute("cy", pt.y);
        dot.style.opacity = p < 0.99 ? 1 : 0;
      }
      nodes.forEach((n, i) => {
        n.classList.toggle("on", p >= (i + 0.5) / nodes.length - 0.12);
      });
    };

    if (REDUCED) { paint(1); return; }
    if (!("IntersectionObserver" in window)) { paint(1); return; }

    /* Sem trava de "está visível": o observer dispara de forma assíncrona e,
       se o visitante parasse a rolagem no exato momento da entrada, o traço
       nunca era pintado. São cinco toggles de classe — pode rodar sempre. */
    /* Ancora no próprio gráfico e espalha o desenho por ~1 tela inteira de
       scroll: assim a linha não termina cedo demais — ela vai se desenhando
       enquanto cruza a tela e completa perto do topo. */
    const stage = wrap.querySelector(".pipe-stage") || wrap;
    const onScroll = () => {
      const vh = window.innerHeight || 1;
      const r = stage.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const p = clamp((vh - r.top) / (vh * 0.9), 0, 1);
      paint(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  });

  /* ==========================================================
     12. ZYVA: quatro letras, quatro valores (Sobre)
     ========================================================== */
  safe("brand-letters", () => {
    const wrap = document.querySelector("[data-brand-letters]");
    if (!wrap) return;
    const letters = Array.from(wrap.querySelectorAll(".bl-letter"));
    const panels = Array.from(wrap.querySelectorAll(".bl-value"));
    if (!letters.length) return;

    let active = 0;
    const show = (i) => {
      active = i;
      letters.forEach((l, k) => l.classList.toggle("on", k === i));
      panels.forEach((v, k) => v.classList.toggle("on", k === i));
    };
    show(0);

    letters.forEach((l, i) => {
      l.addEventListener("mouseenter", () => show(i));
      l.addEventListener("focus", () => show(i));
      l.addEventListener("click", () => show(i));
    });

    /* sem mouse (celular), o scroll conduz a troca */
    if (!FINE && !REDUCED) {
      let t = 0;
      setInterval(() => { t = (t + 1) % letters.length; show(t); }, 2600);
    }
  });

  /* ==========================================================
     13. Filtro do blog com animação FLIP (posições animam de verdade)
     ========================================================== */
  safe("blog-filter", () => {
    const bar = document.querySelector("[data-blog-filter]");
    const grid = document.querySelector("[data-blog-grid]");
    if (!bar || !grid) return;
    const cards = Array.from(grid.children);

    /* A categoria vem do próprio chip do card. Assim os posts que a
       automação diária publica entram no filtro sozinhos, sem precisar
       de nenhum atributo extra no HTML gerado. */
    const catOf = (c) => {
      const chip = c.querySelector(".post-cat");
      return (chip ? chip.textContent : "").trim();
    };

    const cats = [];
    cards.forEach((c) => {
      const k = catOf(c);
      if (k && cats.indexOf(k) === -1) cats.push(k);
    });
    if (cats.length < 2) return;

    const mk = (label, value, pressed) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip-filter cursor-target";
      b.textContent = label;
      b.setAttribute("data-cat", value);
      b.setAttribute("aria-pressed", String(pressed));
      bar.appendChild(b);
      return b;
    };

    bar.textContent = "";
    const btns = [mk("Todos", "*", true)];
    cats.forEach((k) => btns.push(mk(k, k, false)));

    const apply = (cat) => {
      const first = new Map();
      cards.forEach((c) => first.set(c, c.getBoundingClientRect()));

      cards.forEach((c) => {
        c.hidden = !(cat === "*" || catOf(c) === cat);
      });

      if (REDUCED) return;
      cards.forEach((c) => {
        if (c.hidden) return;
        const a = first.get(c);
        const b = c.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (!a.width) {
          c.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }],
            { duration: 340, easing: "cubic-bezier(.16,1,.3,1)" });
        } else if (dx || dy) {
          c.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }],
            { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      });
    };

    btns.forEach((b) => {
      b.addEventListener("click", () => {
        btns.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
        apply(b.getAttribute("data-cat"));
      });
    });
  });

  /* ==========================================================
     14. Barra de progresso de leitura (artigos do blog)
     ========================================================== */
  safe("read-progress", () => {
    const art = document.querySelector(".article");
    if (!art) return;
    const bar = document.createElement("div");
    bar.className = "read-bar";
    bar.innerHTML = "<i></i>";
    document.body.appendChild(bar);
    const fill = bar.firstElementChild;

    const onScroll = () => {
      const r = art.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? clamp((-r.top) / total, 0, 1) : (r.top <= 0 ? 1 : 0);
      fill.style.transform = "scaleX(" + p.toFixed(4) + ")";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  });

  /* ==========================================================
     13b. Marcadores de seção (kickers) + steppers: revelam
          ao entrar na tela. html.js-on habilita as animações.
     ========================================================== */
  safe("markers", () => {
    const els = document.querySelectorAll(".kicker, .timeline, .steps");
    if (!els.length) return;
    document.documentElement.classList.add("js-on");
    if (REDUCED || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("mk-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("mk-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
  });

  /* ==========================================================
     14a. Ícones vivos da faixa de confiança (home)
          Dispara ao entrar na tela; refaz a cada nova entrada.
     ========================================================== */
  safe("trust-icons", () => {
    const trust = document.querySelector(".trust");
    if (!trust) return;
    /* Sem movimento: deixa no estado final (--p = 1). */
    if (REDUCED) { trust.style.setProperty("--p", "1"); return; }

    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight || 1;
      const r = trust.getBoundingClientRect();
      /* p = 0 quando a faixa está entrando por baixo (topo em vh);
         p = 1 quando ela já subiu (topo em ~38% da tela).
         Descer aumenta p (avança), subir diminui (volta). */
      const p = clamp((vh - r.top) / (vh * 0.62), 0, 1);
      trust.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", update);
    update();
  });

  /* ==========================================================
     14b. Marquee 3D (Cases): clique/toque traz a peça à frente
          — no celular não há hover, então isto é essencial
     ========================================================== */
  safe("marquee-front", () => {
    const stage = document.querySelector(".m3-stage");
    if (!stage) return;
    const cards = Array.from(stage.querySelectorAll(".m3-card"));
    if (!cards.length) return;

    const clearAll = (except) => {
      cards.forEach((c) => { if (c !== except) c.classList.remove("m3-front"); });
    };

    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const wasFront = card.classList.contains("m3-front");
        clearAll(card);
        card.classList.toggle("m3-front", !wasFront);
      });
    });

    /* toca fora dos cards → volta tudo */
    const wrap = document.querySelector(".marquee3d");
    if (wrap) {
      wrap.addEventListener("click", (e) => {
        if (!e.target.closest(".m3-card")) clearAll(null);
      });
    }
  });

  /* ==========================================================
     15. Rodapé cinematográfico: cortina + parallax + revelação
     ========================================================== */
  safe("cine-footer", () => {
    const wrap = document.querySelector("[data-cine-reveal]");
    if (!wrap) return;
    const giant = wrap.querySelector("[data-cine-giant]");
    const title = wrap.querySelector("[data-cine-title]");
    const links = wrap.querySelector("[data-cine-links]");
    const topBtn = wrap.querySelector("[data-cine-top]");
    const waFloat = document.querySelector(".wa-float");

    if (topBtn) {
      topBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    /* Sem movimento: deixa tudo visível e para por aqui */
    if (REDUCED) {
      [giant, title, links].forEach((el) => {
        if (!el) return;
        el.style.opacity = "1";
        if (el === giant) el.style.transform = "translateX(-50%)";
        else el.style.transform = "none";
      });
      return;
    }

    const outCubic = (t) => 1 - Math.pow(1 - t, 3);
    let ticking = false;

    const paint = () => {
      ticking = false;
      const vh = window.innerHeight || 1;
      const r = wrap.getBoundingClientRect();
      /* p = 0 quando a cortina começa a entrar (topo em vh);
         p = 1 quando a cortina preenche a tela (topo em 0). */
      const p = clamp((vh - r.top) / (r.height || vh), 0, 1);

      if (giant) {
        const gp = outCubic(clamp(p * 1.12, 0, 1));
        giant.style.opacity = gp.toFixed(3);
        giant.style.transform =
          "translateX(-50%) translateY(" + ((1 - gp) * 10).toFixed(2) + "vh) scale(" +
          (0.8 + gp * 0.2).toFixed(3) + ")";
      }

      const reveal = (el, delay) => {
        if (!el) return;
        const cp = outCubic(clamp((p - delay) / 0.5, 0, 1));
        el.style.opacity = cp.toFixed(3);
        el.style.transform = "translateY(" + ((1 - cp) * 50).toFixed(2) + "px)";
      };
      reveal(title, 0.14);
      reveal(links, 0.26);

      /* esconde o WhatsApp flutuante quando a cortina já entrou */
      if (waFloat) waFloat.classList.toggle("wa-hidden", p > 0.35);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", () => setTimeout(paint, 120));
    paint();
  });

  /* Recalcula depois que fontes/imagens assentam */
  window.addEventListener("load", () => setTimeout(scheduleScenes, 120));
  scheduleScenes();
})();
