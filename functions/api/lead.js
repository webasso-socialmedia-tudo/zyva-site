/* ================================================================
   Zyva — /api/lead  (Cloudflare Pages Function)

   Regra inviolável do projeto: nenhum lead existe só dentro de um
   link de WhatsApp. Este endpoint grava TODA captura no servidor
   ANTES de qualquer redirecionamento: formulário de contato, quiz
   (inclusive progresso parcial), newsletter e "avise-me".

   Precisa de um KV namespace vinculado com o nome LEADS
   (guia: GUIA-CLOUDFLARE-5MIN.md, entregue ao DS). Enquanto o
   vínculo não existe, responde 503 {motivo:"nao-configurado"} e o
   site guarda o lead numa fila local que reenvia sozinha depois.

   Anti-spam sem CAPTCHA (CAPTCHA mata conversão):
   - honeypot: campo "site" preenchido = robô → resposta falsa de
     sucesso (não ensinamos o robô a passar);
   - tempo mínimo: menos de 2,5s entre carregar e enviar = robô;
   - limite por IP: 30 envios / 10 min.
   ================================================================ */

const JSONH = { "content-type": "application/json; charset=utf-8" };
const j = (obj, status) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: JSONH });

export async function onRequestPost({ request, env }) {
  let d;
  try {
    d = await request.json();
  } catch (e) {
    return j({ ok: false, motivo: "json" }, 400);
  }

  /* Honeypot e tempo mínimo: sucesso falso, sem pista para o robô.
     Sinais de comportamento (resposta parcial do quiz, clique no
     WhatsApp) ficam isentos do tempo mínimo: um humano decidido
     clica no CTA em menos de 2,5s e o sinal é legítimo. */
  if (d.site) return j({ ok: true });
  const decorrido = Number(d.el) || 0;
  const sinalRapido = d.tipo === "quiz-parcial" || d.tipo === "wa-clique";
  if (!sinalRapido && decorrido > 0 && decorrido < 2500) return j({ ok: true });

  if (!env.LEADS) return j({ ok: false, motivo: "nao-configurado" }, 503);

  /* Limite por IP */
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const rlKey = "rl:" + ip;
  const usado = Number(await env.LEADS.get(rlKey)) || 0;
  if (usado >= 30) return j({ ok: false, motivo: "limite" }, 429);
  await env.LEADS.put(rlKey, String(usado + 1), { expirationTtl: 600 });

  const tipo = String(d.tipo || "lead").slice(0, 24);
  const registro = {
    ts: new Date().toISOString(),
    tipo,
    dados: d.dados || {},
    consent: d.consent || null,           /* {ok, versao, ts} — trilha LGPD */
    origem: {
      url: String(d.url || "").slice(0, 300),
      ref: String(d.ref || "").slice(0, 300),
      utm: d.utm || null,                 /* primeira interação da sessão */
      disp: String(d.disp || "").slice(0, 120)
    },
    ip: ip.slice(0, 64)
  };

  /* Chave estável por envio (cid): reenvio da fila local sobrescreve
     o mesmo registro em vez de duplicar. Quiz parcial usa a sessão
     (sid): cada resposta atualiza o mesmo rascunho. */
  const cid = String(d.cid || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const sid = String(d.sid || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const chave =
    tipo === "quiz-parcial" && sid ? "quiz:" + sid
    : "lead:" + (cid || registro.ts + ":" + Math.random().toString(36).slice(2, 8));

  await env.LEADS.put(chave, JSON.stringify(registro).slice(0, 20000));
  return j({ ok: true });
}
