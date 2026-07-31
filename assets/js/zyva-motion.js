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
  const safe = (name, fn) => {
    try { fn(); } catch (e) { console.warn("[zyva-motion] " + name, e); }
  };

  /* ==========================================================
     1. Scroll suave (mini-Lenis: usa window.scrollTo, então
        position:sticky e position:fixed continuam funcionando)
     ========================================================== */


  /* Quebra um título em palavras para a revelação com máscara. */
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
    /* Regra dura do orçamento de performance: NADA de animação segurando
       texto da primeira tela. O que já está visível quando a página abre
       aparece pronto — o título precisa ser o maior conteúdo pintado, e
       um elemento em opacity:0 simplesmente não conta como LCP. */
    const vh = window.innerHeight || 800;
    const primeiraTela = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < vh * 0.92;
    };

    const heads = Array.from(document.querySelectorAll("[data-reveal]"));
    heads.forEach((el) => {
      if (primeiraTela(el)) { el.classList.add("rv-in", "rv-now"); return; }
      if (!REDUCED) splitWords(el);
    });

    const items = Array.from(document.querySelectorAll("[data-reveal], .rise"))
      .filter((el) => {
        if (!primeiraTela(el)) return true;
        el.classList.add("rv-in", "rv-now");
        return false;
      });
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
  safe("phone-scene", () => {
    const track = document.querySelector("[data-phone-track]");
    if (!track) return;
    const topics = Array.from(track.querySelectorAll(".topic"));
    if (!topics.length) return;

    /* A cena nao e mais dirigida por rolagem. Ela ja nasce pronta:
       o repouso do aparelho vem do CSS e os assuntos entram uma vez,
       quando a secao aparece. Sem loop, sem trilho de 380vh. */
    const greet = track.querySelector("[data-greet]");
    const typingEl = track.querySelector(".wa-typing");
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        /* os assuntos entram escalonados */
        topics.forEach((el, i) => {
          el.style.transitionDelay = (i * 0.06).toFixed(2) + "s";
          el.style.opacity = "1";
          el.style.transform = "none";
        });
        /* o balao de saudacao aparece logo depois (antes ficava preso
           em opacity:0 porque quem o revelava era a rolagem, ja removida) */
        if (greet) {
          if (REDUCED) { greet.classList.add("show"); if (typingEl) typingEl.style.display = "none"; }
          else {
            if (typingEl) typingEl.classList.add("on");
            setTimeout(() => {
              if (typingEl) { typingEl.classList.remove("on"); typingEl.style.display = "none"; }
              greet.classList.add("show");
            }, 640);
          }
        }
        io.disconnect();
      });
    }, { threshold: 0.2 });
    io.observe(track);

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

      if (input) { input.textContent = msg; input.classList.add("filled"); }
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

      if (typing && !REDUCED) { typing.classList.add("on"); timer = setTimeout(write, 620); }
      else { write(); }
    };

    topics.forEach((btn) => btn.addEventListener("click", () => pick(btn)));
  });
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
          /* Promessa única do site inteiro: até 1 dia útil.
             Prometer "minutos" e falhar corrói a confiança na hora
             exata da decisão — melhor prometer menos e cumprir. */
          label.textContent = open
            ? "Atendendo agora — resposta em até 1 dia útil"
            : "Fora do horário — respondemos em até 1 dia útil";
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
    document.documentElement.classList.add("cine-on");
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

  /* ==========================================================
     Máquina de marketing: energia correndo pelo trilho (Serviços)
     ========================================================== */
  safe("machine-flow", () => {
    if (REDUCED) return;
    const svg = document.querySelector(".pipe-svg");
    const rail = svg && svg.querySelector(".pipe-rail");
    if (!rail) return;
    const flow = rail.cloneNode(false);
    flow.setAttribute("class", "pipe-flow");
    svg.insertBefore(flow, rail.nextSibling);
  });

  /* ==========================================================
     Manifesto cinético, palavra a palavra (Sobre)
     ========================================================== */
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


  /* ==========================================================
     DIAGNÓSTICO NO HERÓI (home)
     Três perguntas e a pessoa lê o próprio negócio antes de
     falar com alguém. O WhatsApp abre já com as respostas dela.
     ========================================================== */
  safe("diagnostico", () => {
    const raiz = document.querySelector("[data-diag]");
    if (!raiz) return;

    const WA = window.ZYVA_WA || "5598984337265";
    const track = (ev, d) => { try { window.zt && window.zt(ev, d); } catch (e) {} };

    const NEGOCIO = {
      comercio:     { artigo: "sua", rotulo: "loja",          busca: "o que você vende, na sua cidade", reforco: "trafego" },
      servico:      { artigo: "seu", rotulo: "serviço local", busca: "seu serviço perto de mim",        reforco: "seo" },
      profissional: { artigo: "sua", rotulo: "consultoria",   busca: "o problema que você resolve",     reforco: "conteudo" },
      restaurante:  { artigo: "seu", rotulo: "restaurante",   busca: "onde comer perto de mim",         reforco: "redes" }
    };
    const TRAVA = {
      google:  { curto: "não apareço no Google",
                 frase: "você não está aparecendo para quem já está procurando o que você vende",
                 base: ["seo", "sites", "conteudo"] },
      social:  { curto: "seguidor não vira venda",
                 frase: "você tem audiência, mas ela não está virando conversa de venda",
                 base: ["redes", "conteudo", "whatsapp"] },
      anuncio: { curto: "gasto sem saber o retorno",
                 frase: "você está investindo no escuro, sem saber qual real trouxe cliente",
                 base: ["relatorios", "trafego", "sites"] },
      venda:   { curto: "perco a venda depois do contato",
                 frase: "o contato chega, mas se perde antes de virar venda",
                 base: ["whatsapp", "sites", "relatorios"] }
    };
    const VERBA = {
      zero:   { curto: "nada ainda",
                prazo: "Começando do zero, os primeiros 90 dias são de <b>estrutura</b>: ser encontrado, responder rápido e medir. Sem gastar em anúncio ainda — primeiro a casa em ordem, depois a torneira." },
      ate500: { curto: "até R$ 500/mês",
                prazo: "Com até R$ 500 por mês dá para montar a base e fazer <b>um teste pequeno</b> de anúncio. Em 90 dias você deve saber qual canal responde — e só então aumentar." },
      ate2k:  { curto: "R$ 500 a R$ 2.000/mês",
                prazo: "Nessa faixa os 90 dias já cabem base <b>e</b> anúncio rodando de verdade. A meta do mês 3 é você saber quanto custa cada contato que chega." },
      acima:  { curto: "acima de R$ 2.000/mês",
                prazo: "Com essa verba o problema raramente é dinheiro — é direção. Em 90 dias a meta é <b>cortar o que não dá retorno</b> e concentrar no que dá." }
    };
    const FRENTE = {
      seo:        { nome: "Aparecer no Google",
                    por: (n) => "Quem procura " + n.busca + " precisa achar você antes do concorrente. É o cliente que já quer comprar." },
      sites:      { nome: "Uma página que vende",
                    por: () => "Não é vitrine bonita: é uma página que responde a dúvida e leva ao WhatsApp em um toque." },
      conteudo:   { nome: "Conteúdo que responde",
                    por: () => "Cada dúvida do cliente vira um conteúdo. Isso te acha no Google e te faz confiável antes da conversa começar." },
      redes:      { nome: "Redes que geram conversa",
                    por: () => "Parar de postar para seguidor e passar a postar para quem compra. Menos volume, mais direção." },
      trafego:    { nome: "Anúncio com verba controlada",
                    por: () => "Google e Instagram com teto de gasto e um número de retorno no fim do mês. Nada de torneira aberta." },
      whatsapp:   { nome: "WhatsApp organizado",
                    por: () => "Resposta rápida, mensagem pronta, ninguém esquecido. É no WhatsApp que a venda se ganha ou se perde no Brasil." },
      relatorios: { nome: "Relatório todo mês",
                    por: () => "Em português, sem gráfico enfeitado: quanto entrou, de onde veio e o que fazer no mês seguinte." },
      branding:   { nome: "Identidade visual",
                    por: () => "Marca que parece profissional cobra mais caro e é lembrada depois." }
    };

    const resp = {};
    const perguntas = Array.from(raiz.querySelectorAll(".diag-q"));
    const body = raiz.querySelector("[data-diag-body]");
    const saida = raiz.querySelector("[data-diag-out]");
    const conta = raiz.querySelector("[data-diag-n]");
    const barra = raiz.querySelector("[data-diag-bar]");
    const voltar = raiz.querySelector("[data-diag-back]");
    const topo = raiz.querySelector(".diag-top");
    let atual = 0;
    let comecou = false;

    const mostra = (i) => {
      atual = i;
      perguntas.forEach((q, k) => { q.hidden = k !== i; });
      if (conta) conta.textContent = String(i + 1);
      if (barra) barra.style.width = ((i + 1) / perguntas.length * 100).toFixed(1) + "%";
      if (voltar) voltar.hidden = i === 0;
      const lg = perguntas[i].querySelector("legend");
      if (lg && i > 0) lg.setAttribute("tabindex", "-1"), lg.focus({ preventScroll: true });
    };

    const monta = () => {
      const n = NEGOCIO[resp.negocio];
      const tr = TRAVA[resp.trava];
      const vb = VERBA[resp.verba];

      /* ordem das frentes: a trava manda, o tipo de negócio reforça,
         e a verba pode tirar o anúncio de cena. */
      let ordem = tr.base.slice();
      if (ordem.indexOf(n.reforco) === -1) ordem.splice(1, 0, n.reforco);
      if (resp.verba === "zero") {
        ordem = ordem.filter((f) => f !== "trafego");
        ["seo", "whatsapp", "sites"].forEach((f) => { if (ordem.indexOf(f) === -1) ordem.push(f); });
      }
      ordem = ordem.slice(0, 3);

      const frentes = ordem.map((f, i) =>
        '<div class="diag-frente"><i>' + (i + 1) + "</i><div><b>" +
        FRENTE[f].nome + "</b><span>" + FRENTE[f].por(n) + "</span></div></div>").join("");

      const msg =
        "Olá, Zyva! Fiz o diagnóstico rápido no site.\n" +
        "Meu negócio: " + n.rotulo + "\n" +
        "O que mais trava: " + tr.curto + "\n" +
        "Invisto hoje: " + vb.curto + "\n" +
        "O site sugeriu começar por: " + ordem.map((f) => FRENTE[f].nome).join(", ") + ".\n" +
        "Quero aprofundar isso.";

      saida.innerHTML =
        "<h3>Pelo que você respondeu, " + n.artigo + " " + n.rotulo +
        " tem um problema claro: <b>" + tr.frase + "</b>.</h3>" +
        '<div class="diag-frentes">' + frentes + "</div>" +
        '<p class="diag-prazo">' + vb.prazo + "</p>" +
        '<div class="diag-cta">' +
        '<a class="btn btn-primary cursor-target" target="_blank" rel="noopener" href="https://wa.me/' +
        WA + "?text=" + encodeURIComponent(msg) + '" data-diag-wa>Quero aprofundar no WhatsApp</a>' +
        '<a class="btn btn-ghost cursor-target" href="/contato/">Prefiro escrever pelo formulário</a>' +
        '<button type="button" class="diag-refaz" data-diag-refaz>Responder de novo</button>' +
        "</div>";

      body.hidden = true;
      if (voltar) voltar.hidden = true;
      if (topo) topo.hidden = true;
      saida.hidden = false;

      /* A leitura é o momento da conversão: nada pode ficar por cima
         do botão. O aviso do blog sai de cena. */
      const toast = document.querySelector(".zyva-toast");
      if (toast) toast.remove();

      track("diagnostico_fim", { negocio: resp.negocio, trava: resp.trava, verba: resp.verba,
                                 frentes: ordem.join(",") });

      /* Conclusão vira lead-sinal no servidor e pré-preenche o
         formulário de contato: ninguém digita duas vezes. */
      try {
        sessionStorage.setItem("zyva_diag", JSON.stringify({
          resp: resp, msg: msg,
          rotuloTrava: tr.curto,
          nomesFrentes: ordem.map((f) => FRENTE[f].nome).join(", ")
        }));
        document.dispatchEvent(new CustomEvent("zyva:diag", {
          detail: { fim: true, resp: Object.assign({}, resp), frentes: ordem }
        }));
      } catch (e) {}

      const wa = saida.querySelector("[data-diag-wa]");
      if (wa) wa.addEventListener("click", () =>
        track("lead_diagnostico", { negocio: resp.negocio, trava: resp.trava, verba: resp.verba }));
      const refaz = saida.querySelector("[data-diag-refaz]");
      if (refaz) refaz.addEventListener("click", () => {
        delete resp.negocio; delete resp.trava; delete resp.verba;
        raiz.querySelectorAll(".diag-opt").forEach((b) => b.removeAttribute("aria-pressed"));
        saida.hidden = true; saida.innerHTML = "";
        body.hidden = false; if (topo) topo.hidden = false;
        mostra(0);
      });
    };

    const avanca = () => {
      if (atual < perguntas.length - 1) {
        if (REDUCED) { mostra(atual + 1); return; }
        body.classList.add("diag-swap");
        setTimeout(() => { mostra(atual + 1); body.classList.remove("diag-swap"); }, 200);
      } else {
        monta();
      }
    };

    raiz.querySelectorAll(".diag-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const campo = btn.closest(".diag-q").getAttribute("data-q");
        resp[campo] = btn.getAttribute("data-v");
        btn.closest(".diag-opts").querySelectorAll(".diag-opt")
          .forEach((o) => o.setAttribute("aria-pressed", String(o === btn)));
        if (!comecou) { comecou = true; track("diagnostico_inicio", {}); }
        /* Cada resposta é um sinal capturado: abandono no passo 2
           ainda vira dado (captura.js escuta este evento). */
        try {
          document.dispatchEvent(new CustomEvent("zyva:diag", {
            detail: { fim: false, passo: campo, resp: Object.assign({}, resp) }
          }));
        } catch (e) {}
        setTimeout(avanca, REDUCED ? 0 : 130);
      });
    });

    if (voltar) voltar.addEventListener("click", () => { if (atual > 0) mostra(atual - 1); });

    /* Enquanto o diagnóstico estiver na tela, o aviso do blog recua.
       No celular ele cobria a última opção — e nada pode ficar na
       frente do caminho de conversão. */
    if ("IntersectionObserver" in window) {
      const guard = new IntersectionObserver((es) => {
        const perto = es.some((e) => e.isIntersecting);
        document.documentElement.classList.toggle("diag-na-tela", perto);
      }, { threshold: 0.25 });
      guard.observe(raiz);
    }

    mostra(0);
  });

})();
