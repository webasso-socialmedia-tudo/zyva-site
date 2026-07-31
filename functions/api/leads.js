/* ================================================================
   Zyva — /api/leads  (exportação para o DS — protegida por chave)

   Uso (só quem tem a chave LEADS_KEY, definida no painel):
     /api/leads?k=SUA_CHAVE            → JSON (leads completos)
     /api/leads?k=SUA_CHAVE&f=csv      → CSV (abre no Excel/Planilhas)
     /api/leads?k=SUA_CHAVE&tipo=quiz  → rascunhos parciais do quiz

   Sem chave certa: 404 — o endpoint nem confirma que existe.
   ================================================================ */

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const k = u.searchParams.get("k") || "";
  if (!env.LEADS || !env.LEADS_KEY || k !== env.LEADS_KEY) {
    return new Response("Não encontrado", { status: 404 });
  }

  const prefixo = u.searchParams.get("tipo") === "quiz" ? "quiz:" : "lead:";
  const lista = await env.LEADS.list({ prefix: prefixo, limit: 1000 });
  const itens = [];
  for (const key of lista.keys) {
    const v = await env.LEADS.get(key.name);
    if (v) { try { itens.push(JSON.parse(v)); } catch (e) {} }
  }
  itens.sort((a, b) => (a.ts < b.ts ? 1 : -1)); /* mais novo primeiro */

  if (u.searchParams.get("f") === "csv") {
    const col = ["ts","tipo","nome","whatsapp","email","empresa","servico","negocio","trava","verba","mensagem","url","utm_source","utm_medium","utm_campaign","disp","consent_versao"];
    const esc = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""').replace(/\r?\n/g, " ") + '"';
    const linhas = itens.map((r) => {
      const dd = r.dados || {}, o = r.origem || {}, utm = o.utm || {}, c = r.consent || {}, rr = (dd.resp || {});
      return [r.ts, r.tipo, dd.nome, dd.whatsapp, dd.email, dd.empresa, dd.servico,
              rr.negocio || dd.negocio, rr.trava || dd.trava, rr.verba || dd.verba,
              dd.mensagem || dd.extra, o.url, utm.utm_source, utm.utm_medium, utm.utm_campaign,
              o.disp, c.versao].map(esc).join(",");
    });
    return new Response("﻿" + col.join(",") + "\n" + linhas.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="zyva-leads.csv"'
      }
    });
  }

  return new Response(JSON.stringify({ total: itens.length, leads: itens }, null, 1), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
