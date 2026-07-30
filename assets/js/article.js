/* ============================================================
   ZYVA — JS de ARTIGO
   Uma coisa só: a barra de progresso de leitura.
   ============================================================ */
(() => {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const art = document.querySelector(".article");
  if (!art) return;

  const bar = document.createElement("div");
  bar.className = "read-bar";
  bar.innerHTML = "<i></i>";
  document.body.appendChild(bar);
  const fill = bar.firstElementChild;

  let ticking = false;
  const paint = () => {
    ticking = false;
    const r = art.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : (r.top <= 0 ? 1 : 0);
    fill.style.transform = "scaleX(" + p.toFixed(4) + ")";
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paint);
  };

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  paint();
})();
