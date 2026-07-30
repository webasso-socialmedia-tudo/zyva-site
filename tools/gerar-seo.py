#!/usr/bin/env python3
"""
Gera sitemap.xml e feed.xml lendo o que EXISTE no repositório.

O sitemap era digitado à mão. Com um post por dia útil, a distância entre
o que está publicado e o que o Google conhece só crescia. Agora as duas
coisas saem da mesma fonte: os arquivos.

Uso:  python3 tools/gerar-seo.py
"""
import os, re, glob, html
from datetime import datetime, timezone

BASE = "https://agenciazyva.com.br"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PRIORIDADE = {
    "/": ("1.0", "weekly"),
    "/servicos/": ("0.9", "monthly"),
    "/contato/": ("0.9", "monthly"),
    "/cases/": ("0.8", "monthly"),
    "/blog/": ("0.8", "daily"),
    "/sobre/": ("0.7", "monthly"),
    "/politica-de-privacidade/": ("0.3", "yearly"),
}
IGNORAR = {"404.html", "branding/preview.html"}


def ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def meta(txt, *nomes):
    for n in nomes:
        m = re.search(
            r'<meta[^>]+(?:name|property)=["\']' + re.escape(n) + r'["\'][^>]+content=["\'](.*?)["\']',
            txt, re.S | re.I)
        if m:
            return html.unescape(m.group(1)).strip()
    return ""


def titulo(txt):
    t = meta(txt, "og:title")
    if t:
        return t
    m = re.search(r"<title>(.*?)</title>", txt, re.S | re.I)
    return html.unescape(m.group(1)).strip() if m else ""


def data_do_post(rota, txt):
    m = re.search(r"(\d{4}-\d{2}-\d{2})", rota)
    if m:
        return m.group(1)
    for chave in ('"datePublished"', '"dateModified"'):
        m = re.search(chave + r'\s*:\s*"(\d{4}-\d{2}-\d{2})', txt)
        if m:
            return m.group(1)
    m = re.search(r'<time[^>]+datetime="(\d{4}-\d{2}-\d{2})', txt)
    if m:
        return m.group(1)
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def rotas():
    fora = []
    for caminho in glob.glob(os.path.join(RAIZ, "**", "*.html"), recursive=True):
        rel = os.path.relpath(caminho, RAIZ).replace(os.sep, "/")
        if rel in IGNORAR or rel.startswith("branding/"):
            continue
        txt = ler(caminho)
        if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+noindex', txt, re.I):
            continue
        rota = "/" if rel == "index.html" else "/" + rel[: -len("index.html")] if rel.endswith("/index.html") else "/" + rel
        fora.append((rota, caminho, txt))
    return sorted(fora)


def main():
    todas = rotas()
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ---------- sitemap ----------
    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for rota, caminho, txt in todas:
        if rota.startswith("/blog/") and rota != "/blog/":
            prio, freq = "0.7", "monthly"
            lastmod = data_do_post(rota, txt)
        else:
            prio, freq = PRIORIDADE.get(rota, ("0.5", "monthly"))
            lastmod = hoje
        linhas += ["  <url>",
                   f"    <loc>{BASE}{rota}</loc>",
                   f"    <lastmod>{lastmod}</lastmod>",
                   f"    <changefreq>{freq}</changefreq>",
                   f"    <priority>{prio}</priority>",
                   "  </url>"]
    linhas.append("</urlset>")
    with open(os.path.join(RAIZ, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")

    # ---------- feed RSS ----------
    posts = []
    for rota, caminho, txt in todas:
        if not rota.startswith("/blog/") or rota == "/blog/":
            continue
        posts.append((data_do_post(rota, txt), rota, titulo(txt),
                      meta(txt, "description", "og:description")))
    posts.sort(reverse=True)

    agora = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    rss = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
           "  <channel>",
           "    <title>Blog da Zyva</title>",
           f"    <link>{BASE}/blog/</link>",
           "    <description>Marketing digital sem enrolação para pequenas e médias empresas brasileiras.</description>",
           "    <language>pt-BR</language>",
           f"    <lastBuildDate>{agora}</lastBuildDate>",
           f'    <atom:link href="{BASE}/feed.xml" rel="self" type="application/rss+xml" />']
    for data, rota, tit, desc in posts:
        pub = datetime.strptime(data, "%Y-%m-%d").strftime("%a, %d %b %Y 09:00:00 +0000")
        rss += ["    <item>",
                f"      <title>{html.escape(tit)}</title>",
                f"      <link>{BASE}{rota}</link>",
                f"      <guid isPermaLink=\"true\">{BASE}{rota}</guid>",
                f"      <pubDate>{pub}</pubDate>",
                f"      <description>{html.escape(desc)}</description>",
                "    </item>"]
    rss += ["  </channel>", "</rss>"]
    with open(os.path.join(RAIZ, "feed.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(rss) + "\n")

    print(f"sitemap.xml: {len(todas)} endereços")
    print(f"feed.xml:    {len(posts)} posts")
    for data, rota, tit, _ in posts:
        print(f"  {data}  {rota}")


if __name__ == "__main__":
    main()
