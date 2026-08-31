/* ============================================================
   ZYVA — Motion Engine v2
   Zero dependências. Sem GSAP, sem Three.js, sem React.
   Cada módulo é isolado — se um falhar, os outros continuam.
   A curva assinatura do site é --ease-zyva (style.css); aqui o
   equivalente em JS é o outCubic dos módulos de scroll.
   ============================================================ */
(() => {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(pointer: fine)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  /* Normaliza p dentro da faixa [a,b] → 0..1 */

  /* ----------------------------------------------------------
     Os módulos entram numa fila em vez de rodar todos de uma vez.
     Rodando em bloco, a soma dava uma trava de 213ms na linha
     principal — e trava é justamente o que estoura o INP se a
     pessoa tocar em algo nesse instante. A fila roda em fatias de
     ~24ms e devolve o controle ao navegador entre elas: o mesmo
     trabalho, sem nenhum toque preso esperando. A ORDEM é
     preservada, então quem revela a primeira tela continua sendo
     o primeiro a rodar.
     ---------------------------------------------------------- */
  const fila = [];
  const safe = (name, fn) => { fila.push([name, fn]); };
  const executa = (name, fn) => {
    try { fn(); } catch (e) { console.warn("[zyva-motion] " + name, e); }
  };
  const roda = () => {
    const t0 = performance.now();
    while (fila.length && performance.now() - t0 < 24) {
      const item = fila.shift();
      executa(item[0], item[1]);
    }
    if (!fila.length) return;
    if (window.requestIdleCallback) requestIdleCallback(roda, { timeout: 120 });
    else setTimeout(roda, 0);
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
       um elemento em opacity:0 simplesmente não conta como LCP.

       Sistema ÚNICO de entrada: [data-reveal]/.rise (vocabulário rv-*)
       e .reveal (vocabulário .visible, que era do main.js) dividem o
       mesmo observador e a mesma isenção de primeira tela. */
    document.documentElement.classList.add("rv-on"); /* p/ rede de segurança do main.js */
    const vh = window.innerHeight || 800;
    const primeiraTela = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < vh * 0.96;
    };
    const entra = (el) => {
      el.classList.add(el.classList.contains("reveal") ? "visible" : "rv-in");
    };
    const entraJa = (el) => {
      if (el.classList.contains("reveal")) el.classList.add("visible", "reveal-now");
      else el.classList.add("rv-in", "rv-now");
    };

    const heads = Array.from(document.querySelectorAll("[data-reveal]"));
    heads.forEach((el) => {
      if (primeiraTela(el)) { entraJa(el); return; }
      if (!REDUCED) splitWords(el);
    });

    const items = Array.from(document.querySelectorAll("[data-reveal], .rise, .reveal"))
      .filter((el) => {
        if (!primeiraTela(el)) return true;
        entraJa(el);
        return false;
      });
    if (!items.length) return;

    if (REDUCED || !("IntersectionObserver" in window)) {
      items.forEach(entra);
      return;
    }
    /* Cadência de grade: irmãos do mesmo .grid entram escalonados
       (60ms cada, teto 360ms) — sistema vivo, não bloco que pisca.
       O atraso é LIMPO depois da entrada para não atrasar hovers. */
    const escalona = (el) => {
      const pai = el.parentElement;
      if (!pai || !pai.classList.contains("grid")) return 0;
      const irmaos = Array.from(pai.children).filter((c) =>
        c.classList.contains("reveal") || c.classList.contains("rise") || c.hasAttribute("data-reveal"));
      return Math.min(Math.max(irmaos.indexOf(el), 0) * 60, 360);
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const d = escalona(e.target);
          if (d) {
            e.target.style.transitionDelay = d + "ms";
            setTimeout(() => { e.target.style.transitionDelay = ""; }, d + 800);
          }
          entra(e.target);
          io.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
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
      /* leitor de tela: o giro visual fica escondido (aria-hidden) e um
         irmão estático .sr-only lê a lista inteira UMA vez — aria-live
         aqui viraria anúncio em loop infinito (WCAG 2.2.2 / 4.1.3) */
      host.setAttribute("aria-hidden", "true");
      const srLista = document.createElement("span");
      srLista.className = "sr-only";
      srLista.textContent = list.join(", ");
      host.parentNode.insertBefore(srLista, host);
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
        /* O giro PARA quando o herói sai da tela ou a aba fica em
           segundo plano: movimento invisível não gasta bateria. */
        let timer = null;
        let naTela = true;
        const gira = () => { idx = (idx + 1) % list.length; render(false); };
        const liga = () => { if (!timer && naTela && !document.hidden) timer = setInterval(gira, interval); };
        const desliga = () => { if (timer) { clearInterval(timer); timer = null; } };
        document.addEventListener("visibilitychange", () => (document.hidden ? desliga() : liga()));
        if ("IntersectionObserver" in window) {
          new IntersectionObserver((es) => {
            naTela = es.some((e) => e.isIntersecting);
            naTela ? liga() : desliga();
          }, { threshold: 0 }).observe(host);
        }
        liga();
      }
    });
  });

  /* ==========================================================
     6. Cena do celular 3D (Contato): conversa simulada
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
    const mede = () => {
      const vh = window.innerHeight || 1;
      const r = stage.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const p = clamp((vh - r.top) / (vh * 0.9), 0, 1);
      paint(p);
    };
    /* rAF + trava: no máximo uma medição por quadro (protege o INP). */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; mede(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mede();
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
      letters.forEach((l, k) => {
        const on = k === i;
        l.classList.toggle("on", on);
        l.setAttribute("aria-pressed", String(on));
      });
      panels.forEach((v, k) => v.classList.toggle("on", k === i));
    };
    show(0);

    /* No celular as letras giram sozinhas, senão quem não tem mouse
       nunca veria os outros valores. Mas no instante em que a pessoa
       escolhe uma letra, a rotação PARA — antes ela continuava girando
       e roubava a escolha 2 segundos depois do toque, o que fazia a
       interação parecer quebrada. Escolha do usuário manda. */
    let giro = null;
    const paraDeGirar = () => { if (giro) { clearInterval(giro); giro = null; } };

    letters.forEach((l, i) => {
      l.addEventListener("mouseenter", () => show(i));
      l.addEventListener("focus", () => show(i));
      l.addEventListener("click", () => { paraDeGirar(); show(i); });
    });

    if (!FINE && !REDUCED) {
      let t = 0;
      giro = setInterval(() => { t = (t + 1) % letters.length; show(t); }, 2600);
      wrap.addEventListener("touchstart", paraDeGirar, { once: true, passive: true });
    }
  });

  /* ==========================================================
     13. Filtro do blog com animação FLIP (posições animam de verdade)
     ========================================================== */
  safe("blog-filter", () => {
    const grid = document.querySelector("[data-blog-grid]");
    if (!grid) return;
    const bar    = document.querySelector("[data-blog-filter]");
    const campo  = document.querySelector("[data-blog-busca]");
    const vazio  = document.querySelector("[data-blog-vazio]");
    const btnMais= document.querySelector("[data-blog-mais]");
    const cards  = Array.from(grid.children);
    const PASSO  = 6;

    /* Busca sem acento: quem digita "anuncio" tem que achar "anúncio". */
    const simples = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    /* A categoria vem do próprio chip do card. Assim os posts que a
       automação diária publica entram no filtro sozinhos, sem precisar
       de nenhum atributo extra no HTML gerado. */
    const catOf = (c) => {
      const chip = c.querySelector(".post-cat");
      return (chip ? chip.textContent : "").trim();
    };
    /* Índice de texto: título + resumo + categoria, calculado uma vez só. */
    const textoDe = new Map();
    cards.forEach((c) => {
      const t = c.querySelector("h3"), p = c.querySelector("p");
      textoDe.set(c, simples([(t && t.textContent) || "", (p && p.textContent) || "", catOf(c)].join(" ")));
    });

    let cat = "*", termo = "", mostrando = PASSO;

    const elegivel = (c) =>
      (cat === "*" || catOf(c) === cat) && (!termo || textoDe.get(c).indexOf(termo) !== -1);

    const pinta = (animar) => {
      const antes = animar && !REDUCED ? new Map(cards.map((c) => [c, c.getBoundingClientRect()])) : null;
      const lista = cards.filter(elegivel);
      const visiveis = lista.slice(0, mostrando);
      cards.forEach((c) => { c.hidden = visiveis.indexOf(c) === -1; });

      if (vazio) vazio.hidden = lista.length > 0;
      if (btnMais) {
        btnMais.hidden = lista.length <= mostrando;
        const restam = lista.length - mostrando;
        if (restam > 0) btnMais.textContent = "Carregar mais " + (restam > PASSO ? PASSO : restam) +
          (restam === 1 ? " artigo" : " artigos");
      }
      if (!antes) return;
      visiveis.forEach((c) => {
        const a = antes.get(c), b = c.getBoundingClientRect();
        if (!a || !a.width) {
          c.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }],
            { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
        } else if (a.left - b.left || a.top - b.top) {
          c.animate([{ transform: "translate(" + (a.left - b.left) + "px," + (a.top - b.top) + "px)" }, { transform: "none" }],
            { duration: 440, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      });
    };

    /* ---- chips de categoria ---- */
    if (bar) {
      const cats = [];
      cards.forEach((c) => { const k = catOf(c); if (k && cats.indexOf(k) === -1) cats.push(k); });
      if (cats.length >= 2) {
        const mk = (label, valor, ativo) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "chip-filter";
          b.textContent = label;
          b.setAttribute("data-cat", valor);
          b.setAttribute("aria-pressed", String(ativo));
          bar.appendChild(b);
          return b;
        };
        bar.textContent = "";
        const btns = [mk("Todos", "*", true)];
        cats.forEach((k) => btns.push(mk(k, k, false)));
        btns.forEach((b) => b.addEventListener("click", () => {
          btns.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
          cat = b.getAttribute("data-cat");
          mostrando = PASSO;
          pinta(true);
        }));
      }
    }

    /* ---- busca (com respiro para não repintar a cada tecla) ---- */
    if (campo) {
      let t;
      campo.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          termo = simples(campo.value.trim());
          mostrando = PASSO;
          pinta(true);
          try { window.zt && termo.length > 2 && window.zt("blog_busca", { termo: termo.slice(0, 40) }); } catch (e) {}
        }, 160);
      });
      campo.addEventListener("keydown", (e) => { if (e.key === "Escape") { campo.value = ""; campo.dispatchEvent(new Event("input")); } });
    }

    /* ---- carregar mais ---- */
    if (btnMais) btnMais.addEventListener("click", () => {
      mostrando += PASSO;
      pinta(true);
      const novos = cards.filter((c) => !c.hidden);
      const alvo = novos[Math.max(0, novos.length - PASSO)];
      if (alvo) alvo.querySelectorAll("h3")[0] && alvo.querySelectorAll("h3")[0].focus &&
        alvo.setAttribute("tabindex", "-1"), alvo.focus && alvo.focus({ preventScroll: true });
    });

    pinta(false);
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

    const mede = () => {
      const r = art.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? clamp((-r.top) / total, 0, 1) : (r.top <= 0 ? 1 : 0);
      fill.style.transform = "scaleX(" + p.toFixed(4) + ")";
    };
    /* rAF + trava: no máximo uma medição por quadro (protege o INP). */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; mede(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mede();
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
        /* rotateX: a palavra "deita" ao longe e levanta ao chegar —
           profundidade real na revelação (perspective no .cine-foot) */
        giant.style.transform =
          "translateX(-50%) translateY(" + ((1 - gp) * 10).toFixed(2) + "vh) scale(" +
          (0.8 + gp * 0.2).toFixed(3) + ") rotateX(" + ((1 - gp) * 24).toFixed(1) + "deg)";
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
      if (i < 0 || i >= perguntas.length) return; /* nunca fora da faixa */
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
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' +
        WA + "?text=" + encodeURIComponent(msg) + '" data-diag-wa>Quero aprofundar no WhatsApp</a>' +
        '<a class="btn btn-ghost" href="/contato/">Prefiro escrever pelo formulário</a>' +
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

    /* Dois toques rápidos na mesma pergunta agendavam DOIS avanços:
       o segundo relia `atual` já avançado e pulava uma pergunta — ou
       chamava mostra(3), que não existe, e matava o quiz inteiro com
       um TypeError. Agora: um timer de cada vez (o toque seguinte
       cancela o pendente) e o destino é congelado no agendamento. */
    let tAvanca = null;
    let tMostra = null;
    const avanca = () => {
      if (atual < perguntas.length - 1) {
        const alvo = atual + 1; /* congela o destino AQUI, não na execução */
        if (REDUCED) { mostra(alvo); return; }
        body.classList.add("diag-swap");
        clearTimeout(tMostra);
        tMostra = setTimeout(() => {
          mostra(alvo);
          /* dois quadros: o navegador precisa PINTAR a pergunta nova
             ainda em .diag-swap para a transição de entrada rodar */
          requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove("diag-swap")));
        }, 200);
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
        clearTimeout(tAvanca); /* trocar de resposta reagenda, não duplica */
        tAvanca = setTimeout(avanca, REDUCED ? 0 : 130);
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


  /* ==========================================================
     16. Sub-navegação dos Serviços com indicador de seção (N2)
         A página é longa: quem chega por #trafego-pago precisa
         saber onde está e como chegar no resto sem rolar tudo.
     ========================================================== */
  safe("svc-nav", () => {
    const nav = document.querySelector("[data-svc-nav]");
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll("a[href^='#']"));
    const secoes = links
      .map((a) => ({ a, el: document.getElementById(a.getAttribute("href").slice(1)) }))
      .filter((x) => x.el);
    if (!secoes.length) return;

    const trilho = nav.querySelector(".svc-nav-in") || nav;

    /* O cabeçalho é sticky e sua altura muda com a tela. Chutar um valor
       fixo deixava a sub-nav 5px escondida atrás dele — então medimos. */
    const cabecalho = document.querySelector(".site-header");
    const encaixa = () => {
      const alt = cabecalho ? Math.round(cabecalho.getBoundingClientRect().height) : 64;
      nav.style.top = alt + "px";
      document.documentElement.style.setProperty("--svc-nav-offset",
        (alt + Math.round(nav.getBoundingClientRect().height) + 16) + "px");
    };
    encaixa();
    addEventListener("resize", () => { clearTimeout(nav._t); nav._t = setTimeout(encaixa, 150); });
    const marcar = (alvo) => {
      secoes.forEach(({ a, el }) => {
        const on = el === alvo;
        a.classList.toggle("on", on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      /* no celular a barra rola: o item ativo tem que estar à vista */
      const ativo = nav.querySelector("a.on");
      if (ativo && trilho.scrollWidth > trilho.clientWidth) {
        const r = ativo.getBoundingClientRect(), t = trilho.getBoundingClientRect();
        if (r.left < t.left + 8 || r.right > t.right - 8) {
          trilho.scrollTo({ left: ativo.offsetLeft - trilho.clientWidth / 2 + ativo.offsetWidth / 2,
                            behavior: REDUCED ? "auto" : "smooth" });
        }
      }
    };

    if (!("IntersectionObserver" in window)) return;
    /* A "linha de leitura" fica a ~35% da tela: a seção ativa é a que
       cruza essa linha, não a que tem mais pixels visíveis. */
    const visiveis = new Set();
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => (e.isIntersecting ? visiveis.add(e.target) : visiveis.delete(e.target)));
      if (!visiveis.size) return;
      let melhor = null, topo = Infinity;
      visiveis.forEach((el) => {
        const t = Math.abs(el.getBoundingClientRect().top);
        if (t < topo) { topo = t; melhor = el; }
      });
      if (melhor) marcar(melhor);
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });
    secoes.forEach(({ el }) => io.observe(el));

    /* Chegou por link direto (#seo): destaca de cara E garante que o
       bloco pare ABAIXO da barra.
       Por que reancorar: o navegador rola para a âncora assim que lê o
       HTML — antes de fontes e imagens assentarem. Como a altura do que
       vem acima ainda vai mudar, o alvo escorrega: medido ao vivo, ora
       o título ficava escondido sob a barra, ora a página nem saía do
       topo. Então recolocamos no lugar quando tudo terminou de carregar.
       Se a pessoa já começou a rolar por conta própria, não mexemos —
       roubar a rolagem de alguém é pior que a âncora torta. */
    if (location.hash) {
      const alvo = document.getElementById(location.hash.slice(1));
      if (alvo && alvo.classList.contains("service-block")) {
        marcar(alvo);
        alvo.classList.add("svc-chegada");

        /* Só desiste se a pessoa demonstrar intenção de rolar. Antes eu
           escutava qualquer `keydown` — aí um Ctrl, um Tab ou um atalho
           qualquer já cancelava o reposicionamento sem motivo. */
        let rolouSozinho = false;
        const TECLAS_DE_ROLAGEM = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
        const marcaUsuario = () => { rolouSozinho = true; };
        addEventListener("wheel", marcaUsuario, { once: true, passive: true });
        addEventListener("touchmove", marcaUsuario, { once: true, passive: true });
        addEventListener("keydown", (e) => {
          if (TECLAS_DE_ROLAGEM.indexOf(e.key) !== -1) marcaUsuario();
        }, { passive: true });

        const reancora = () => {
          if (rolouSozinho) return;
          const off = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue("--svc-nav-offset"), 10) || 128;
          const y = alvo.getBoundingClientRect().top + window.scrollY - off;
          if (Math.abs(y - window.scrollY) > 4) window.scrollTo({ top: y, behavior: "auto" });
        };
        reancora();
        if (document.readyState !== "complete") addEventListener("load", reancora, { once: true });
        setTimeout(reancora, 600);
        setTimeout(() => { rolouSozinho = true; }, 1600); /* depois disso, a página é do usuário */
      }
    }
    links.forEach((a) => a.addEventListener("click", () => {
      try { window.zt && window.zt("svc_nav", { alvo: a.getAttribute("href") }); } catch (e) {}
    }));
  });

  /* ==========================================================
     17. "Continue lendo" nos posts + busca da 404 (N3/N5)
         Lê /assets/data/posts.json, gerado pelo mesmo script que
         faz o sitemap. O post de amanhã entra aqui sozinho —
         a publicação diária continua sem passo manual.
     ========================================================== */
  safe("relacionados", () => {
    const caixa = document.querySelector("[data-relacionados]");
    const grade404 = document.querySelector("[data-404-resultados]");
    const busca404 = document.querySelector("[data-404-busca]");
    if (!caixa && !grade404) return;

    const simples = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const cartao = (p) => {
      const a = document.createElement("a");
      a.className = "rel-card";
      a.href = p.url;
      const cat = document.createElement("span"); cat.className = "post-cat"; cat.textContent = p.cat;
      const h = document.createElement("b"); h.textContent = p.titulo;
      const d = document.createElement("span"); d.className = "rel-resumo";
      d.textContent = (p.resumo || "").slice(0, 105) + ((p.resumo || "").length > 105 ? "…" : "");
      a.append(cat, h, d);
      return a;
    };

    fetch("/assets/data/posts.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (!dados || !dados.posts || !dados.posts.length) return;
        const posts = dados.posts;

        /* ---- fim do artigo: mesma categoria primeiro, depois os mais novos ---- */
        if (caixa) {
          const aqui = location.pathname.replace(/\/?$/, "/");
          const atual = posts.filter((p) => p.url === aqui)[0];
          const outros = posts.filter((p) => p.url !== aqui);
          const mesma = atual ? outros.filter((p) => p.cat === atual.cat) : [];
          const resto = outros.filter((p) => mesma.indexOf(p) === -1);
          const escolha = mesma.concat(resto).slice(0, 3);
          if (escolha.length) {
            const grade = caixa.querySelector("[data-rel-grid]");
            escolha.forEach((p) => grade.appendChild(cartao(p)));
            caixa.hidden = false;
          }
        }

        /* ---- 404: busca ao vivo, começando pelos mais recentes ---- */
        if (grade404) {
          const pinta = (lista) => {
            grade404.textContent = "";
            if (!lista.length) {
              const p = document.createElement("p");
              p.className = "blog-vazio";
              p.textContent = "Nada com esse termo — tente outra palavra ou fale com a gente.";
              grade404.appendChild(p);
              return;
            }
            lista.slice(0, 3).forEach((p) => grade404.appendChild(cartao(p)));
          };
          pinta(posts);
          const campo = busca404 && busca404.querySelector("input");
          if (campo) {
            let t;
            busca404.addEventListener("submit", (e) => e.preventDefault());
            campo.addEventListener("input", () => {
              clearTimeout(t);
              t = setTimeout(() => {
                const q = simples(campo.value.trim());
                pinta(!q ? posts : posts.filter((p) =>
                  simples(p.titulo + " " + p.resumo + " " + p.cat).indexOf(q) !== -1));
              }, 160);
            });
          }
        }
      })
      .catch(() => {});
  });

  /* ==========================================================
     18. Barra de ação fixa no celular (N7)
         É no celular que a decisão acontece — e é lá que o CTA
         some ao rolar. Ela entra depois da primeira tela e sai
         de cena quando um CTA de verdade está à vista, para
         nunca competir com ele nem cobrir conteúdo.
     ========================================================== */
  safe("barra-mobile", () => {
    const ehToque = window.matchMedia("(max-width: 780px)").matches;
    if (!ehToque || document.querySelector("[data-barra-mobile]")) return;

    const WA = window.ZYVA_WA || "5598984337265";
    const barra = document.createElement("div");
    barra.className = "barra-mobile";
    barra.setAttribute("data-barra-mobile", "");
    barra.innerHTML =
      '<a class="bm-cta" href="/contato/">Diagnóstico gratuito</a>' +
      '<a class="bm-wa" href="https://wa.me/' + WA +
      '?text=' + encodeURIComponent("Olá, Zyva! Quero um diagnóstico gratuito para minha empresa.") +
      '" target="_blank" rel="noopener" data-wa aria-label="Falar no WhatsApp">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.03 1.02-1.03 2.48s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.35M12.05 21.8h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.89-9.88 9.89m8.41-18.3A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.9 11.9 0 0 0 5.69 1.45c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41Z"/></svg>' +
      "</a>";
    document.body.appendChild(barra);
    document.body.classList.add("tem-barra-mobile");

    /* Enquanto um CTA principal está na tela, a barra recolhe. */
    const rivais = Array.from(document.querySelectorAll(
      ".hero-ctas, .cta-final, .cine-reveal, #form-contato, .dquiz, .svc-cta, .news-cta"));
    const naTela = new Set();
    let passouDobra = false;

    const decide = () => {
      barra.classList.toggle("on", passouDobra && naTela.size === 0);
    };

    if ("IntersectionObserver" in window) {
      if (rivais.length) {
        const io = new IntersectionObserver((es) => {
          es.forEach((e) => (e.isIntersecting ? naTela.add(e.target) : naTela.delete(e.target)));
          decide();
        }, { threshold: 0.01 });
        rivais.forEach((el) => io.observe(el));
      }
      /* sentinela da dobra: sem listener de scroll */
      const marco = document.createElement("div");
      marco.setAttribute("aria-hidden", "true");
      marco.style.cssText = "position:absolute;top:70vh;height:1px;width:1px;pointer-events:none";
      document.body.appendChild(marco);
      new IntersectionObserver((es) => {
        passouDobra = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
        decide();
      }, { threshold: 0 }).observe(marco);
    }

    barra.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      try { window.zt && window.zt("barra_mobile", { acao: a.classList.contains("bm-wa") ? "whatsapp" : "diagnostico" }); } catch (err) {}
    });
  });


  /* ==========================================================
     FASE 3 · O NOTEBOOK QUE ABRE COM O SCROLL (peça central)
     Storyboard do DS em 3 quadros: (1) visto de CIMA, fechado,
     com a marca na tampa e a dobradiça no lado de cima; (2) ainda
     de cima, a tampa abre girando para TRÁS e revela o teclado
     embaixo (perto de você); (3) a câmera desce para a vista
     frontal com o relatório aceso. Em reduced-motion o CSS já
     entrega tudo aberto e estático.
     ========================================================== */
  safe("notebook", () => {
    const cena = document.querySelector("[data-notebook]");
    if (!cena) return;
    const laptop = cena.querySelector("[data-nb-laptop]");
    const passos = Array.from(cena.querySelectorAll(".nb-passo"));
    if (!laptop) return;

    if (REDUCED) { passos.forEach((p) => p.classList.add("on")); return; }

    /* Câmera (--nb-cam): -90° (a pino) → -18° (frontal), começa a
       descer DEPOIS que a tampa já está abrindo. Tampa (--nb-open):
       -90° (fechada por cima da base) → +10° (de pé). Como os dois
       giros são no mesmo eixo, o ângulo efetivo da tampa na tela é
       a soma — a tela só "acorda" quando essa soma vira para você. */
    /* Os marcos moram DEPOIS de a tela virar para o espectador
       (~p 0.5): cada passo acende um capítulo do relatório na tela
       (data-passo → .nb-tela no CSS). Antes disso o passo 0 narra
       a abertura. */
    const MARCOS = [0, 0.52, 0.68, 0.84];
    const outCubic = (t) => 1 - Math.pow(1 - t, 3);

    const mede = () => {
      const vh = window.innerHeight || 1;
      const r = cena.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const total = Math.max(r.height - vh, 1);
      const p = clamp(-r.top / total, 0, 1);
      const abre = outCubic(clamp((p - 0.04) / 0.55, 0, 1));  /* tampa abre ainda de cima */
      const desce = outCubic(clamp((p - 0.36) / 0.56, 0, 1)); /* câmera desce por último  */
      const cam = -90 + desce * 72;
      const open = -90 + abre * 100;
      laptop.style.setProperty("--nb-cam", cam.toFixed(2) + "deg");
      laptop.style.setProperty("--nb-open", open.toFixed(2) + "deg");
      laptop.style.setProperty("--nb-wake", clamp((cam + open + 70) / 50, 0, 1).toFixed(3));
      let ativo = 0;
      for (let i = MARCOS.length - 1; i >= 0; i--) { if (p >= MARCOS[i]) { ativo = i; break; } }
      passos.forEach((el, i) => el.classList.toggle("on", i === ativo));
      laptop.dataset.passo = String(ativo);
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; mede(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mede();
  });

  /* ==========================================================
     FASE 3 · CALCULADORA DE RETORNO
     Faixas CONSERVADORAS (médias BR para PME): CPC R$1,50-2,50,
     clique→conversa 3-6%, conversa→venda 20-35%. Nunca promessa:
     o resultado convida para o diagnóstico. O CTA pré-preenche o
     WhatsApp com a simulação e vira sinal server-side (zCap).
     ========================================================== */
  safe("calculadora", () => {
    const raiz = document.querySelector("[data-calc]");
    if (!raiz) return;
    const WA = window.ZYVA_WA || "5598984337265";
    const verba = raiz.querySelector("[data-calc-verba]");
    const ticket = raiz.querySelector("[data-calc-ticket]");
    const outs = {
      verba: raiz.querySelector("[data-calc-verba-out]"),
      ticket: raiz.querySelector("[data-calc-ticket-out]"),
      cliques: raiz.querySelector("[data-calc-cliques]"),
      conversas: raiz.querySelector("[data-calc-conversas]"),
      vendas: raiz.querySelector("[data-calc-vendas]"),
      retorno: raiz.querySelector("[data-calc-retorno]"),
    };
    const cta = raiz.querySelector("[data-calc-wa]");
    if (!verba || !ticket) return;

    const rs = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
    const faixa = (a, b) =>
      Math.max(Math.round(a), 0).toLocaleString("pt-BR") + "–" + Math.round(b).toLocaleString("pt-BR");

    /* Os números CORREM até o valor (~240ms) em vez de trocar secos:
       o painel parece computar — e computar é a tese da seção.
       Estado atual mostrado × alvo; um rAF só para as 4 linhas. */
    const mostrado = { cliMin: 400, cliMax: 667, convMin: 12, convMax: 40, vendMin: 2.4, vendMax: 14, retMin: 288, retMax: 1680 };
    let animRaf = null;
    const pinta = (m) => {
      outs.cliques.textContent = faixa(m.cliMin, m.cliMax);
      outs.conversas.textContent = faixa(m.convMin, m.convMax);
      outs.vendas.textContent = faixa(m.vendMin, m.vendMax);
      outs.retorno.textContent = "R$ " + faixa(m.retMin, m.retMax);
    };
    const corre = (alvo) => {
      if (animRaf) cancelAnimationFrame(animRaf);
      /* aba oculta: rAF congela e o valor ficaria velho — pinta direto */
      if (REDUCED || document.hidden) { Object.assign(mostrado, alvo); pinta(mostrado); return; }
      const de = Object.assign({}, mostrado);
      const ini = performance.now();
      const passo = (agora) => {
        const t = Math.min((agora - ini) / 240, 1);
        const e = 1 - Math.pow(1 - t, 3);
        for (const k in alvo) mostrado[k] = de[k] + (alvo[k] - de[k]) * e;
        pinta(mostrado);
        animRaf = t < 1 ? requestAnimationFrame(passo) : null;
      };
      animRaf = requestAnimationFrame(passo);
    };

    const calcula = () => {
      const v = Number(verba.value), t = Number(ticket.value);
      outs.verba.textContent = rs(v);
      outs.ticket.textContent = rs(t);
      verba.style.setProperty("--fill", (((v - verba.min) / (verba.max - verba.min)) * 100).toFixed(1) + "%");
      ticket.style.setProperty("--fill", (((t - ticket.min) / (ticket.max - ticket.min)) * 100).toFixed(1) + "%");
      const cliMin = v / 2.5, cliMax = v / 1.5;          /* CPC 2,50 e 1,50 */
      const convMin = cliMin * 0.03, convMax = cliMax * 0.06;
      const vendMin = convMin * 0.2, vendMax = convMax * 0.35;
      corre({ cliMin, cliMax, convMin, convMax, vendMin, vendMax,
              retMin: vendMin * t, retMax: vendMax * t });
      if (cta) {
        const msg = "Olá, Zyva! Usei a calculadora do site: invisto R$ " + v +
          " por mês e uma venda vale R$ " + t + " para mim. Deu " +
          Math.max(Math.round(vendMin), 1) + "–" + Math.round(vendMax) +
          " vendas estimadas. Quero o número exato do meu caso.";
        cta.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
        cta.setAttribute("data-wa-msg", msg);
      }
    };
    verba.addEventListener("input", calcula);
    ticket.addEventListener("input", calcula);
    calcula();

    /* O quiz do herói alimenta a calculadora: quem já contou a
       verba não recomeça do padrão — "sem achismo" vale dentro do
       próprio site. A resposta nunca atropela quem mexeu no slider. */
    let mexeu = false;
    verba.addEventListener("input", () => { mexeu = true; }, { once: true });
    const VERBA_QUIZ = { zero: 500, ate500: 500, ate2k: 1500, acima: 3000 };
    const fonte = raiz.querySelector("[data-calc-fonte]");
    const aplicaVerba = (chave) => {
      const v = VERBA_QUIZ[chave];
      if (!v || mexeu || Number(verba.value) === v) return;
      verba.value = String(v);
      if (fonte) fonte.hidden = false;
      calcula();
    };
    try {
      const guardado = sessionStorage.getItem("zyva_diag");
      if (guardado) aplicaVerba(((JSON.parse(guardado) || {}).resp || {}).verba);
    } catch (e) {}
    document.addEventListener("zyva:diag", (e) => {
      const d = (e && e.detail) || {};
      if (d.resp && d.resp.verba) aplicaVerba(d.resp.verba);
    });

    /* primeiro ajuste = interesse (evento GA, uma vez por página) */
    let usou = false;
    const marca = () => {
      if (usou) return;
      usou = true;
      try { window.zt && window.zt("calc_uso", {}); } catch (e) {}
    };
    verba.addEventListener("input", marca);
    ticket.addEventListener("input", marca);

    /* clique no CTA = lead-sinal com os valores da simulação */
    if (cta) cta.addEventListener("click", () => {
      try { window.zCap && window.zCap.send("calc", { verba: verba.value, ticket: ticket.value }); } catch (e) {}
    });
  });

  /* ==========================================================
     FASE 3 · O CELULAR DO CONTATO SEGUE O PONTEIRO
     Inclinação sutil com mola (lerp) em torno do repouso que o
     CSS já define via --ry/--rx. Só ponteiro fino; nunca no
     toque nem com movimento reduzido.
     ========================================================== */
  safe("phone-tilt", () => {
    if (!FINE || REDUCED) return;
    const cena = document.querySelector(".phone-scene");
    const phone = cena && cena.querySelector(".phone");
    if (!phone) return;
    const BASE_RY = -9, BASE_RX = 3, AMP = 7;
    let tRy = BASE_RY, tRx = BASE_RX, cRy = BASE_RY, cRx = BASE_RX, raf = null;
    const anima = () => {
      cRy += (tRy - cRy) * 0.08;
      cRx += (tRx - cRx) * 0.08;
      phone.style.setProperty("--ry", cRy.toFixed(2) + "deg");
      phone.style.setProperty("--rx", cRx.toFixed(2) + "deg");
      if (Math.abs(cRy - tRy) + Math.abs(cRx - tRx) > 0.05) raf = requestAnimationFrame(anima);
      else raf = null;
    };
    const acorda = () => { if (!raf) raf = requestAnimationFrame(anima); };
    cena.addEventListener("pointermove", (e) => {
      const r = cena.getBoundingClientRect();
      tRy = BASE_RY + ((e.clientX - r.left) / r.width - 0.5) * AMP * 2;
      tRx = BASE_RX - ((e.clientY - r.top) / r.height - 0.5) * AMP;
      acorda();
    });
    cena.addEventListener("pointerleave", () => { tRy = BASE_RY; tRx = BASE_RX; acorda(); });
  });

  /* ==========================================================
     FASE 3 · BOTÕES MAGNÉTICOS
     O CTA principal "atrai" o cursor alguns pixels e volta com
     mola (retorno no CSS, classe .mag). Só ponteiro fino.
     ========================================================== */
  safe("magnetic", () => {
    if (!FINE || REDUCED) return;
    /* Só o CTA primário: no rodapé cinematográfico seria acessório
       sobre acessório (a skill de design manda tirar um). */
    document.querySelectorAll(".btn-primary").forEach((el) => {
      el.classList.add("mag");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.classList.add("mag-live");
        /* 8/6px: efeito assumido (5/4 era imperceptível — ou o
           acessório se nota, ou não paga o pointermove que custa) */
        el.style.setProperty("--mag-x", (((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 8).toFixed(1) + "px");
        el.style.setProperty("--mag-y", (((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 6).toFixed(1) + "px");
      });
      el.addEventListener("pointerleave", () => {
        el.classList.remove("mag-live");
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
      });
    });
  });

  /* ==========================================================
     COMPARADOR ANTES/DEPOIS (Cases) — simulação honesta
     O range invisível move o divisor (--cmp); as abas trocam o
     cenário; ao entrar na tela, o divisor desliza do "antes"
     para o meio UMA vez (nunca com movimento reduzido).
     ========================================================== */
  safe("comparador", () => {
    const raiz = document.querySelector("[data-cmp]");
    if (!raiz) return;
    const area = raiz.querySelector(".cmp-area");
    const range = raiz.querySelector("[data-cmp-range]");
    if (!area || !range) return;

    const CENARIOS = {
      clinica: { av: "12", au: "agendamentos/mês", as: "invisível no Google",
                 dv: "40–60", du: "agendamentos/mês", ds: "Top 3 nas buscas da cidade" },
      loja:    { av: "R$ 800", au: "por mês em vendas no site", as: "anúncio no escuro",
                 dv: "R$ 6–12 mil", du: "por mês em vendas no site", ds: "cada real rastreado" },
      servico: { av: "3", au: "orçamentos/mês", as: "WhatsApp no vácuo",
                 dv: "25–40", du: "orçamentos/mês", ds: "resposta em minutos" }
    };
    const campos = {};
    ["av", "au", "as", "dv", "du", "ds"].forEach((k) => {
      campos[k] = raiz.querySelector("[data-cmp-" + k + "]");
    });

    const aplica = () => {
      const v = Number(range.value);
      area.style.setProperty("--cmp", v + "%");
      range.setAttribute("aria-valuetext",
        v <= 35 ? "mostrando principalmente o depois" :
        v >= 65 ? "mostrando principalmente o antes" :
        "metade antes, metade depois");
    };
    range.addEventListener("input", aplica);
    aplica();

    raiz.querySelectorAll("[data-cmp-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = CENARIOS[btn.getAttribute("data-cmp-tab")];
        if (!c) return;
        raiz.querySelectorAll("[data-cmp-tab]").forEach((o) =>
          o.setAttribute("aria-pressed", String(o === btn)));
        for (const k in campos) { if (campos[k]) campos[k].textContent = c[k]; }
        try { window.zt && window.zt("cmp_segmento", { seg: btn.getAttribute("data-cmp-tab") }); } catch (e) {}
      });
    });

    /* provocação única: nasce mostrando a dor (82%) e desliza ao meio */
    if (!REDUCED && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        range.value = "82";
        aplica();
        const ini = performance.now();
        const anda = (agora) => {
          const t = Math.min((agora - ini) / 900, 1);
          range.value = String(82 - 32 * (1 - Math.pow(1 - t, 3)));
          aplica();
          if (t < 1) requestAnimationFrame(anda);
        };
        requestAnimationFrame(anda);
      }, { threshold: 0.5 });
      io.observe(area);
    }
  });

  /* ==========================================================
     CONTINUIDADE · morph card → artigo (View Transitions MPA)
     O h1 do artigo já tem view-transition-name: post-title no
     CSS. Aqui, o título do card CLICADO recebe o mesmo nome um
     instante antes de a navegação começar — o navegador casa os
     dois e o título "viaja" do card para o topo do artigo.
     Navegadores sem a API ignoram sem efeito colateral.
     ========================================================== */
  safe("vt-morph", () => {
    document.querySelectorAll(".post-card").forEach((card) => {
      const titulo = card.querySelector("h3");
      if (!titulo) return;
      card.querySelectorAll("a[href]").forEach((a) => {
        a.addEventListener("click", () => {
          titulo.style.viewTransitionName = "post-title";
        });
      });
    });
  });

  /* Dispara a fila: a primeira fatia roda já, o resto entre quadros. */
  roda();

})();
