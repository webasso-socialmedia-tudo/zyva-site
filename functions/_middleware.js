/* ================================================================
   Zyva — middleware de todas as rotas

   O site é servido em dois endereços: o oficial (agenciazyva.com.br)
   e o técnico da Cloudflare (zyva-site.pages.dev). Conteúdo idêntico
   em dois endereços faz o Google dividir a força entre eles.

   O `<link rel="canonical">` de cada página já aponta para o oficial,
   o que resolve a maior parte. Aqui fechamos a porta de vez: qualquer
   host que não seja o domínio oficial responde com X-Robots-Tag:
   noindex, então o endereço técnico simplesmente não entra no índice.

   O domínio oficial não é tocado — segue indexável como sempre.
   ================================================================ */

const OFICIAIS = ["agenciazyva.com.br", "www.agenciazyva.com.br"];

export async function onRequest(context) {
  const resposta = await context.next();

  let host = "";
  try { host = new URL(context.request.url).hostname.toLowerCase(); } catch (e) {}

  if (host && OFICIAIS.indexOf(host) === -1) {
    /* Resposta imutável precisa ser reconstruída para receber cabeçalho. */
    const nova = new Response(resposta.body, resposta);
    nova.headers.set("X-Robots-Tag", "noindex, nofollow");
    return nova;
  }
  return resposta;
}
