/* ============================================================
   NB3D — o notebook como OBJETO REAL (WebGL / Three.js r170)
   ------------------------------------------------------------
   Carregado sob demanda pelo módulo "notebook" do zyva-motion,
   somente quando: WebGL2 existe, sem prefers-reduced-motion e a
   cena está perto da viewport. O rig CSS continua no DOM como
   fallback integral: se QUALQUER coisa falhar aqui, a classe
   nb3d-on não entra e ninguém percebe a diferença.

   Realismo sem asset externo: carcaça de alumínio grafite em
   RoundedBox (PBR metal/roughness + reflexo de ambiente), 78
   teclas instanciadas, tela de vidro com reflexo, display vivo
   desenhado em CanvasTexture (os capítulos do Relatório Vivo),
   sombra de contato macia e o brilho da tela banhando o teclado.
   Tone mapping ACES = resposta de filme, não de ilustração.

   Orçamento: render SÓ quando algo muda (scroll / animação da
   tela); DPR limitado; fora da viewport o loop para de vez.
   ============================================================ */

import {
  ACESFilmicToneMapping, CanvasTexture, Color, CylinderGeometry,
  Group, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PMREMGenerator,
  PerspectiveCamera, PlaneGeometry, PointLight, SRGBColorSpace,
  Scene, WebGLRenderer,
} from "../vendor/three/three.module.min.js";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";

/* ---------- paleta da casa ---------- */
const VIOLETA = "#6C4CF1";
const VIOLETA_CLARO = "#8B72F5";
const CIANO = "#22D3EE";
const VERDE = "#34D399";

/* ============================================================
   O DISPLAY VIVO — o relatório desenhado em 2D e usado como
   textura emissiva da tela. Cada "passo" do scroll acende um
   capítulo, com transição animada (~700ms). Fora de transição
   o quadro é estático: zero upload de textura por frame.
   ============================================================ */
function criaDisplay() {
  const W = 768, H = 484;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");

  let passo = 0;          /* capítulo alvo (0..3) */
  let iniTroca = 0;       /* quando o capítulo mudou (ms de performance.now) */
  let wake = 0;           /* 0 = tela apagada, 1 = acesa */

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* barra horizontal com cantos redondos */
  function barra(x, y, w, h, cor, r) {
    cx.fillStyle = cor;
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(x, y, Math.max(w, h), h, r || h / 2);
    else cx.rect(x, y, Math.max(w, h), h);
    cx.fill();
  }

  function desenha(agora) {
    const t = easeOut(Math.min((agora - iniTroca) / 700, 1)); /* progresso da troca */

    /* fundo do sistema */
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#10142c");
    g.addColorStop(1, "#0b0e1f");
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);

    /* barra de janela */
    cx.fillStyle = "rgba(255,255,255,0.05)";
    cx.fillRect(0, 0, W, 44);
    for (let i = 0; i < 3; i++) {
      cx.fillStyle = ["#FF5F57", "#FEBC2E", "#28C840"][i];
      cx.beginPath(); cx.arc(28 + i * 26, 22, 6.5, 0, 7); cx.fill();
    }
    cx.fillStyle = "rgba(255,255,255,0.55)";
    cx.font = "600 17px 'Space Grotesk', system-ui, sans-serif";
    cx.fillText("Relatório Vivo · agosto (exemplo)", 110, 28);
    /* pulso "ao vivo" no canto: a tela respira mesmo parada */
    const pulso = 0.45 + 0.55 * Math.abs(Math.sin(agora / 900));
    cx.fillStyle = `rgba(52,211,153,${pulso.toFixed(2)})`;
    cx.beginPath(); cx.arc(W - 34, 22, 5, 0, 7); cx.fill();

    if (passo === 0) {
      /* capítulo 0: o relatório CHEGOU */
      cx.globalAlpha = t;
      cx.fillStyle = "rgba(255,255,255,0.06)";
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(184, 150, 400, 180, 18); cx.fill(); }
      cx.fillStyle = "#fff";
      cx.font = "700 30px 'Space Grotesk', system-ui, sans-serif";
      cx.textAlign = "center";
      cx.fillText("Seu relatório chegou.", W / 2, 232);
      cx.font = "400 18px Inter, system-ui, sans-serif";
      cx.fillStyle = "rgba(255,255,255,0.6)";
      cx.fillText("Em português claro, como todo mês.", W / 2, 268);
      cx.textAlign = "left";
      cx.globalAlpha = 1;
      return;
    }

    /* capítulos 1+: painel de origens (esquerda) */
    const tBar = passo === 1 ? t : 1;
    cx.fillStyle = "rgba(255,255,255,0.72)";
    cx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
    cx.fillText("De onde vieram os clientes", 36, 92);
    const origens = [
      ["Google", 0.46, VIOLETA_CLARO],
      ["Instagram", 0.33, CIANO],
      ["Indicação", 0.21, "#A78BFA"],
    ];
    origens.forEach((o, i) => {
      const y = 118 + i * 46;
      cx.fillStyle = "rgba(255,255,255,0.55)";
      cx.font = "500 15px Inter, system-ui, sans-serif";
      cx.fillText(o[0], 36, y + 14);
      cx.fillStyle = "rgba(255,255,255,0.08)";
      barra(140, y, 250, 18, "rgba(255,255,255,0.08)", 9);
      barra(140, y, 250 * o[1] * tBar, 18, o[2], 9);
      cx.fillStyle = "rgba(255,255,255,0.8)";
      cx.font = "600 14px Inter, system-ui, sans-serif";
      cx.fillText(Math.round(o[1] * 100 * tBar) + "%", 402, y + 14);
    });

    /* capítulo 2+: retorno (direita) — número grande + linha */
    if (passo >= 2) {
      const tRet = passo === 2 ? t : 1;
      cx.globalAlpha = tRet;
      cx.fillStyle = "rgba(34,211,238,0.09)";
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(478, 66, 258, 132, 16); cx.fill(); }
      cx.fillStyle = "rgba(255,255,255,0.55)";
      cx.font = "500 14px Inter, system-ui, sans-serif";
      cx.fillText("Retorno rastreado", 502, 100);
      cx.fillStyle = CIANO;
      cx.font = "700 44px 'Space Grotesk', system-ui, sans-serif";
      cx.fillText("R$ " + (4.8 * tRet).toFixed(1).replace(".", ",") + " mil", 500, 152);
      cx.fillStyle = "rgba(255,255,255,0.45)";
      cx.font = "400 13px Inter, system-ui, sans-serif";
      cx.fillText("de R$ 1,2 mil investidos", 502, 180);
      cx.globalAlpha = 1;

      /* gráfico de linha: contatos por semana, desenhado ponta a ponta */
      cx.fillStyle = "rgba(255,255,255,0.72)";
      cx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
      cx.fillText("Contatos por semana", 36, 306);
      const pts = [[60, 430], [170, 414], [280, 422], [390, 386], [500, 372], [610, 344], [716, 316]];
      const nSeg = (pts.length - 1) * tRet;
      cx.strokeStyle = CIANO;
      cx.lineWidth = 3.5;
      cx.lineJoin = "round";
      cx.lineCap = "round";
      cx.shadowColor = "rgba(34,211,238,0.55)";
      cx.shadowBlur = 12;
      cx.beginPath();
      cx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const f = MathUtils.clamp(nSeg - (i - 1), 0, 1);
        if (f <= 0) break;
        const a = pts[i - 1], b = pts[i];
        cx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
      }
      cx.stroke();
      cx.shadowBlur = 0;
      pts.forEach((p, i) => {
        if (i <= nSeg) {
          cx.fillStyle = "#0b0e1f";
          cx.beginPath(); cx.arc(p[0], p[1], 6, 0, 7); cx.fill();
          cx.strokeStyle = CIANO; cx.lineWidth = 2.5;
          cx.beginPath(); cx.arc(p[0], p[1], 6, 0, 7); cx.stroke();
        }
      });
    }

    /* capítulo 3: o plano do próximo mês */
    if (passo >= 3) {
      cx.globalAlpha = t;
      cx.fillStyle = "rgba(52,211,153,0.10)";
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(478, 224, 258, 118, 16); cx.fill(); }
      cx.fillStyle = VERDE;
      cx.font = "600 15px 'Space Grotesk', system-ui, sans-serif";
      cx.fillText("Plano do próximo mês", 502, 256);
      cx.fillStyle = "rgba(255,255,255,0.72)";
      cx.font = "400 14px Inter, system-ui, sans-serif";
      cx.fillText("✓ Dobrar o anúncio que converte", 502, 288);
      cx.fillText("✓ Novo texto para o WhatsApp", 502, 314);
      cx.globalAlpha = 1;
    }
  }

  return {
    canvas: cv,
    /* redesenha se estiver em transição ou para o pulso ao vivo;
       devolve true se a textura precisa subir para a GPU */
    tick(agora) {
      if (wake <= 0.02) return false;
      const emTransicao = agora - iniTroca < 760;
      /* fora de transição, o pulso "ao vivo" atualiza ~5x/s — barato */
      if (!emTransicao && agora % 200 > 34) return false;
      desenha(agora);
      return true;
    },
    setPasso(p) { if (p !== passo) { passo = p; iniTroca = performance.now(); } },
    setWake(w) { wake = w; },
  };
}

/* ---------- texturas 2D auxiliares ---------- */

/* sombra de contato: mancha radial macia (barata e convincente) */
function texSombra() {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 160;
  const cx = cv.getContext("2d");
  const g = cx.createRadialGradient(128, 80, 8, 128, 80, 120);
  g.addColorStop(0, "rgba(0,0,0,0.62)");
  g.addColorStop(0.55, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = g;
  cx.scale(1, 0.62);
  cx.fillRect(0, 0, 256, 258);
  return new CanvasTexture(cv);
}

/* o Z da marca na tampa — o ÚNICO gradiente permitido fora do logo */
function texLogoZ() {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const cx = cv.getContext("2d");
  const g = cx.createLinearGradient(40, 40, 216, 216);
  g.addColorStop(0, VIOLETA);
  g.addColorStop(1, CIANO);
  cx.fillStyle = g;
  const P = [[40,40],[216,40],[216,80],[152,124],[184,124],[120,176],[216,176],[216,216],[40,216],[40,176],[104,132],[72,132],[136,80],[40,80]];
  cx.beginPath();
  cx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) cx.lineTo(P[i][0], P[i][1]);
  cx.closePath();
  cx.fill();
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ============================================================
   A CENA
   ============================================================ */
export function montar(stage) {
  /* montagem idempotente: nunca dois notebooks no mesmo palco */
  stage.querySelectorAll(".nb3d-canvas").forEach((c) => c.remove());

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  const memoria = navigator.deviceMemory || 8;
  const DPR = Math.min(window.devicePixelRatio || 1, memoria <= 4 ? 1.5 : 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.className = "nb3d-canvas";
  stage.appendChild(renderer.domElement);

  const scene = new Scene();
  /* luz de estúdio por ambiente: é ela que faz o alumínio existir */
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  pmrem.dispose();

  /* fov curto + câmera longe = olhar de "foto de produto", sem a
     distorção de perspectiva que faz a base parecer um trambolho */
  const camera = new PerspectiveCamera(27, 1, 1, 320);

  /* ---------- materiais ---------- */
  const alu = new MeshStandardMaterial({
    color: 0x252a3a, metalness: 0.88, roughness: 0.34, envMapIntensity: 0.95,
  });
  const aluEscuro = new MeshStandardMaterial({
    color: 0x191d2b, metalness: 0.8, roughness: 0.42, envMapIntensity: 0.8,
  });
  const plastico = new MeshStandardMaterial({
    color: 0x1c2130, metalness: 0.25, roughness: 0.5, envMapIntensity: 0.7,
  });

  const laptop = new Group();
  scene.add(laptop);

  /* ---------- base (corpo + teclado + trackpad + pés) ---------- */
  const base = new Group();
  laptop.add(base);

  const corpo = new Mesh(new RoundedBoxGeometry(30, 1.5, 20.4, 4, 0.7), alu);
  corpo.position.y = 1.1;
  base.add(corpo);

  /* poço do teclado (rebaixo escuro) */
  const poco = new Mesh(new RoundedBoxGeometry(26.6, 0.3, 10.6, 2, 0.35), aluEscuro);
  poco.position.set(0, 1.83, -3.4);
  base.add(poco);

  /* 78 teclas instanciadas — a densidade de detalhe que faz "objeto" */
  const teclaGeo = new RoundedBoxGeometry(1.62, 0.34, 1.44, 1, 0.16);
  const LINHAS = 5, COLS = 14;
  const teclas = new InstancedMesh(teclaGeo, plastico, LINHAS * COLS + 8);
  const m4 = new Matrix4();
  let idx = 0;
  for (let l = 0; l < LINHAS; l++) {
    for (let c = 0; c < COLS; c++) {
      m4.makeTranslation(-11.7 + c * 1.8, 2.02, -7.55 + l * 1.62);
      teclas.setMatrixAt(idx++, m4);
    }
  }
  /* barra de espaço + teclas largas da última fileira (centrada) */
  const larguras = [2.6, 1.8, 8.6, 1.8, 1.4, 1.4];
  const somaFileira = larguras.reduce((a, b) => a + b, 0) + 0.24 * (larguras.length - 1);
  let x = -somaFileira / 2;
  for (let i = 0; i < larguras.length; i++) {
    m4.makeScale(larguras[i] / 1.62, 1, 1);
    m4.setPosition(x + larguras[i] / 2, 2.02, 0.62);
    teclas.setMatrixAt(idx++, m4);
    x += larguras[i] + 0.24;
  }
  teclas.count = idx;
  base.add(teclas);

  /* trackpad: vidro fosco discreto — sutil, não um espelho */
  const track = new Mesh(new RoundedBoxGeometry(9.4, 0.1, 6.0, 1, 0.05), new MeshStandardMaterial({
    color: 0x202534, metalness: 0.5, roughness: 0.45, envMapIntensity: 0.65,
  }));
  track.position.set(0, 1.88, 5.6);
  base.add(track);

  /* pés de borracha */
  const peGeo = new CylinderGeometry(0.5, 0.5, 0.3, 16);
  [[-13, -8.6], [13, -8.6], [-13, 8.6], [13, 8.6]].forEach((p) => {
    const pe = new Mesh(peGeo, plastico);
    pe.position.set(p[0], 0.2, p[1]);
    base.add(pe);
  });

  /* ---------- tampa (dobradiça no fundo) ---------- */
  const tampa = new Group();
  tampa.position.set(0, 1.85, -9.9);   /* linha da dobradiça */
  laptop.add(tampa);

  const dobradica = new Mesh(new CylinderGeometry(0.55, 0.55, 27, 20), aluEscuro);
  dobradica.rotation.z = Math.PI / 2;
  tampa.add(dobradica);

  const casca = new Mesh(new RoundedBoxGeometry(30, 0.9, 20, 4, 0.6), alu);
  casca.position.set(0, 0, 9.7);
  tampa.add(casca);

  /* GEOMETRIA DAS FACES (conferida contra as capturas):
     fechada (rot 0), a face local +y aponta para CIMA — é onde mora
     o Z da marca (foto 1 do storyboard). Aberta (rot ≈ -88°), a face
     local -y vira para o espectador — é onde mora a TELA. */

  /* logo Z na face EXTERNA da tampa (visível fechado, de cima) */
  const logo = new Mesh(
    new PlaneGeometry(4.6, 4.6),
    new MeshStandardMaterial({ map: texLogoZ(), transparent: true, metalness: 0.55, roughness: 0.35 })
  );
  logo.position.set(0, 0.48, 9.7);
  logo.rotation.x = -Math.PI / 2;
  tampa.add(logo);

  /* moldura da tela (face interna, -y) */
  const moldura = new Mesh(new RoundedBoxGeometry(28.6, 0.22, 18.6, 2, 0.4), new MeshStandardMaterial({
    color: 0x05070f, metalness: 0.3, roughness: 0.16, envMapIntensity: 1.2,
  }));
  moldura.position.set(0, -0.5, 9.7);
  tampa.add(moldura);

  /* o display vivo */
  const display = criaDisplay();
  const texTela = new CanvasTexture(display.canvas);
  texTela.colorSpace = SRGBColorSpace;
  texTela.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const matTela = new MeshBasicMaterial({ map: texTela, toneMapped: false });
  matTela.color = new Color(0x000000); /* tela apagada até o wake */
  const tela = new Mesh(new PlaneGeometry(27.2, 17), matTela);
  tela.position.set(0, -0.63, 9.75);
  tela.rotation.x = Math.PI / 2;
  tampa.add(tela);

  /* lâmina de vidro por cima do display: clearcoat de verdade — a
     camada envernizada reflete o estúdio como um painel laminado */
  const vidro = new Mesh(new PlaneGeometry(28.2, 18.2), new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.22,
    clearcoat: 1.0, clearcoatRoughness: 0.06,
    transparent: true, opacity: 0.07, envMapIntensity: 1.9,
  }));
  vidro.position.set(0, -0.7, 9.75);
  vidro.rotation.x = Math.PI / 2;
  tampa.add(vidro);

  /* webcam: o ponto que diz "isto é um aparelho de verdade" */
  const cam1 = new Mesh(new CylinderGeometry(0.22, 0.22, 0.06, 14), new MeshStandardMaterial({
    color: 0x0a0d16, metalness: 0.2, roughness: 0.25, envMapIntensity: 1.4,
  }));
  cam1.position.set(0, -0.64, 18.55);
  tampa.add(cam1);
  const cam2 = new Mesh(new CylinderGeometry(0.09, 0.09, 0.07, 12), new MeshStandardMaterial({
    color: 0x1a2f4a, metalness: 0.1, roughness: 0.1, envMapIntensity: 2.2,
  }));
  cam2.position.set(0, -0.66, 18.55);
  tampa.add(cam2);

  /* ---------- sombra de contato em dois níveis ----------
     a mancha larga assenta o objeto; o núcleo escuro rente aos pés
     é o que o olho lê como "peso de verdade" */
  const sombra = new Mesh(new PlaneGeometry(46, 30), new MeshBasicMaterial({
    map: texSombra(), transparent: true, depthWrite: false,
  }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.02;
  scene.add(sombra);
  const sombraNucleo = new Mesh(new PlaneGeometry(33, 22.5), new MeshBasicMaterial({
    map: texSombra(), transparent: true, depthWrite: false, opacity: 0.75,
  }));
  sombraNucleo.rotation.x = -Math.PI / 2;
  sombraNucleo.position.y = 0.04;
  scene.add(sombraNucleo);

  /* ---------- o brilho da tela banha o teclado ---------- */
  const luzTela = new PointLight(0xa8dcec, 0, 30, 1.6);
  luzTela.position.set(0, 7.5, -3.5);
  scene.add(luzTela);

  /* ============================================================
     ESTADO + RENDER SOB DEMANDA
     ============================================================ */
  let precisa = true;       /* algo mudou desde o último frame? */
  let visivel = true;
  let vivo = true;
  let raf = 0;
  const alvo = { cam: -90, open: -90, wake: 0, passo: 0 };
  const atual = { cam: -90, open: -90, wake: 0 };

  function aplica(agora) {
    /* amortecimento: o objeto tem massa — nada "teleporta" */
    let quieto = true;
    for (const k of ["cam", "open", "wake"]) {
      const d = alvo[k] - atual[k];
      if (Math.abs(d) > 0.018) { atual[k] += d * 0.16; quieto = false; }
      else atual[k] = alvo[k];
    }

    /* tampa: CSS -90 (fechada) → +10 (aberta). O fator 0.88 deixa a
       tela um dedo mais de frente no repouso final (menos reclinada). */
    tampa.rotation.x = MathUtils.degToRad(-(atual.open + 90) * 0.88);

    /* câmera: -90 (a pino) → -18 (frontal); piso de 24° e teto de 86°
       (o teto evita o gimbal degenerado de olhar a pino com up +y).
       ENQUADRAMENTO ADAPTATIVO: a distância nasce da esfera que
       envolve o notebook contra o campo de visão REAL do palco —
       em qualquer proporção de tela, o objeto cabe com margem. */
    const elev = MathUtils.degToRad(MathUtils.clamp(-atual.cam, 24, 86));
    const fovV = MathUtils.degToRad(camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const meioMenor = Math.min(fovV, fovH) / 2;
    const dist = (21 * 1.1) / Math.sin(meioMenor);
    const tAbre = MathUtils.clamp((atual.open + 90) / 100, 0, 1);
    camera.position.set(1.2, Math.sin(elev) * dist, Math.cos(elev) * dist + 2);
    camera.lookAt(0, 2.2 + tAbre * 4.4, -0.5);

    /* tela acorda: cor do display + luz sobre o teclado + sombra */
    const w = MathUtils.clamp(atual.wake, 0, 1);
    matTela.color.setScalar(w);
    display.setWake(w);
    luzTela.intensity = w * 58;
    sombra.material.opacity = 0.5 + 0.28 * Math.cos(elev);

    if (display.tick(agora)) texTela.needsUpdate = true;

    return quieto;
  }

  function loop(agora) {
    if (!vivo) return;
    raf = 0;
    if (!visivel) return;
    const quieto = aplica(agora);
    renderer.render(scene, camera);
    const telaAtiva = atual.wake > 0.02;      /* pulso ao vivo do display */
    if (!quieto || telaAtiva || precisa) {
      precisa = false;
      raf = requestAnimationFrame(loop);
    }
  }
  function acorda() { if (vivo && visivel && !raf) raf = requestAnimationFrame(loop); }

  function dimensiona() {
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    precisa = true;
    acorda();
  }
  const ro = new ResizeObserver(dimensiona);
  ro.observe(stage);
  dimensiona();

  return {
    progresso({ cam, open, wake, passo }, salta) {
      alvo.cam = cam; alvo.open = open; alvo.wake = wake;
      if (salta) { atual.cam = cam; atual.open = open; atual.wake = wake; }
      display.setPasso(passo);
      precisa = true;
      acorda();
    },
    visivel(v) { visivel = v; if (v) { precisa = true; acorda(); } },
    destruir() {
      vivo = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
