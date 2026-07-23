# Zyva — Site oficial

Site institucional da **Zyva**, agência de marketing digital para pequenas e médias empresas brasileiras.

- Produção (futura): https://agenciazyva.com.br
- Stack: HTML + CSS + JS puros (site estático, sem build)
- Hospedagem alvo: Cloudflare Pages ou Netlify (deploy automático a partir deste repositório)

## Estrutura

```
index.html                     Home
servicos/                      Serviços (8 serviços com âncoras)
cases/                         Cases e portfólio
sobre/                         Sobre a Zyva
blog/                          Blog (listagem + posts)
contato/                       Contato (formulário → WhatsApp)
politica-de-privacidade/       LGPD
assets/css/style.css           Design system
assets/js/main.js              Interações (menu, WhatsApp, animações)
branding/                      Propostas de logo (SVG)
robots.txt · sitemap.xml       SEO
```

## Configurações pendentes

- [ ] **WhatsApp:** trocar `WHATSAPP_NUMBER` em `assets/js/main.js` pelo número real (55 + DDD + número).
- [ ] **Instagram:** confirmar/criar o perfil @agenciazyva (links no rodapé).
- [ ] **E-mail:** criar contato@agenciazyva.com.br quando o domínio estiver ativo.
- [ ] **Analytics:** adicionar Google Analytics 4 + Search Console na publicação.

## Desenvolvimento local

Qualquer servidor estático funciona:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## Deploy

Push na branch `main` → deploy automático (Cloudflare Pages/Netlify). Sem etapa de build: publicar a raiz do repositório.
