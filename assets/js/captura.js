/* ================================================================
   Zyva — captura.js v2 · o carteiro dos leads

   Missão: nenhum dado de lead existe só dentro de um link wa.me.
   Tudo passa por aqui: valida → grava no servidor → confirma →
   só então o WhatsApp.

   Se o servidor falhar (ou ainda não estiver configurado), o lead
   entra numa fila local (localStorage) e é reenviado sozinho na
   próxima visita. Perder lead por falha técnica: proibido.

   v2: TODO clique rumo ao wa.me (links [data-wa], chat simulado,
   CTA do quiz) vira sinal "wa-clique" no servidor — o listener vive
   no main.js (síncrono, sem janela de perda) e chama zCap.send;
   aqui o wa-clique é tratado como sinal efêmero (sem fila).

   É carregado pelo main.js; expõe window.zCap.
   ================================================================ */
(() => {
  "use strict";

  const API = "/api/lead";
  const FILA = "zyva_fila";
  const t0 = Date.now();
  const zt = (ev, d) => { try { window.zt && window.zt(ev, d); } catch (e) {} };
  const uuid = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "z" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* ---------- sessão: id do quiz + UTM de primeira interação ---------- */
  let sid;
  try {
    sid = sessionStorage.getItem("zyva_sid") ||
      (sessionStorage.setItem("zyva_sid", uuid()), sessionStorage.getItem("zyva_sid"));
  } catch (e) { sid = uuid(); }

  let utm = null;
  try {
    utm = JSON.parse(sessionStorage.getItem("zyva_utm") || "null");
    if (!utm) {
      const q = new URLSearchParams(location.search);
      const pega = {};
      ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"]
        .forEach((k) => { if (q.get(k)) pega[k] = q.get(k).slice(0, 120); });
      if (Object.keys(pega).length) {
        utm = pega;
        sessionStorage.setItem("zyva_utm", JSON.stringify(utm));
      }
    }
  } catch (e) {}

  const meta = () => ({
    url: location.pathname,
    ref: (document.referrer || "").slice(0, 300),
    utm: utm,
    disp: (navigator.userAgentData && navigator.userAgentData.mobile != null
            ? (navigator.userAgentData.mobile ? "mobile" : "desktop")
            : (matchMedia("(pointer:coarse)").matches ? "mobile" : "desktop"))
          + " " + screen.width + "x" + screen.height,
    el: Date.now() - t0
  });

  /* ---------- fila local: o seguro contra falha ---------- */
  const filaLe = () => { try { return JSON.parse(localStorage.getItem(FILA) || "[]"); } catch (e) { return []; } };
  const filaGrava = (f) => { try { localStorage.setItem(FILA, JSON.stringify(f.slice(-40))); } catch (e) {} };
  const filaPoe = (item) => { const f = filaLe(); f.push(item); filaGrava(f); };
  const filaTira = (cid) => filaGrava(filaLe().filter((x) => x.cid !== cid));

  /* ---------- transporte ---------- */
  const posta = async (payload) => {
    const ctl = new AbortController();
    const tempo = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,            /* sobrevive à navegação para o WhatsApp */
        signal: ctl.signal
      });
      clearTimeout(tempo);
      if (!r.ok) return false;
      const d = await r.json().catch(() => ({}));
      return d.ok === true;
    } catch (e) {
      clearTimeout(tempo);
      return false;
    }
  };

  /* Grava um lead. Otimista: entra na fila ANTES do envio; sai da
     fila só com o "ok" do servidor. Se a página navegar no meio,
     o dado sobrevive nos dois lados (keepalive + fila). */
  const send = async (tipo, dados, extra) => {
    const cid = uuid();
    const payload = Object.assign(
      { tipo, dados: dados || {}, cid, sid },
      meta(),
      extra || {}
    );
    /* Sinais de comportamento (resposta parcial do quiz, clique no
       WhatsApp) não entram na fila de reenvio: reenviar um clique de
       ontem viraria dado falso. Lead com dados de contato entra. */
    const efemero = tipo === "quiz-parcial" || tipo === "wa-clique";
    if (!efemero) filaPoe({ cid, payload });
    const ok = await posta(payload);
    if (ok) { filaTira(cid); zt("captura_ok", { tipo }); }
    else if (!efemero) zt("captura_fila", { tipo });
    return ok;
  };

  /* Reenvio da fila: alguns segundos depois do load, sem atrapalhar. */
  const drena = async () => {
    const f = filaLe();
    for (const item of f) {
      item.payload.reenvio = true;
      const ok = await posta(item.payload);
      if (ok) { filaTira(item.cid); zt("captura_reenvio_ok", { tipo: item.payload.tipo }); }
    }
  };
  if (filaLe().length) setTimeout(drena, 4000);

  /* (o clique de WhatsApp é observado pelo main.js — sincronamente,
     sem janela de perda — que chama zCap.send("wa-clique", ...)) */

  /* ---------- quiz do herói: cada resposta é um sinal ---------- */
  document.addEventListener("zyva:diag", (e) => {
    const d = e.detail || {};
    send(d.fim ? "quiz" : "quiz-parcial",
         { resp: d.resp || {}, frentes: (d.frentes || []).join(",") });
  });

  /* ---------- formulários de e-mail (newsletter / avise-me) ---------- */
  document.addEventListener("submit", (ev) => {
    const form = ev.target.closest("form[data-capture]");
    if (!form) return;
    ev.preventDefault();
    const email = (form.querySelector('[name="email"]') || {}).value || "";
    const hp = (form.querySelector('[name="site"]') || {}).value || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      const inp = form.querySelector('[name="email"]');
      if (inp) { inp.setAttribute("aria-invalid", "true"); inp.focus(); }
      return;
    }
    send(form.getAttribute("data-capture"),
         { email: email.trim(), extra: form.getAttribute("data-extra") || "" },
         { site: hp });
    zt("captura_email", { onde: form.getAttribute("data-capture"), pagina: location.pathname });
    const exito = document.createElement("p");
    exito.className = "cap-exito";
    exito.setAttribute("role", "status");
    exito.innerHTML = "<strong>Pronto, você está na lista!</strong> Sem spam — e sai quando quiser.";
    form.replaceWith(exito);
  }, true);

  window.zCap = { send, meta, sid };
})();
