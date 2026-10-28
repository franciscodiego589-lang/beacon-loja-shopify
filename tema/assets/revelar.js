/*
  Textos e imagens que aparecem ao rolar (06/10/2026; estilos em assets/component-revelar.css).
  Só age dentro do conteúdo principal (#MainContent), fora da primeira seção (capa), e só em peça que
  ainda está abaixo da tela ao carregar. Cada seção anima as suas peças em sequência (70 ms entre uma e
  outra, no máximo 6 passos). Cartão de produto anima inteiro; o que está dentro dele não anima sozinho.
*/
const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TEXTO = 'h1, h2, h3, h4, p, li, blockquote, .button, .v3-promo, .product-card, .dp-card, .faixa-promos__imagem, details, table';
const IMAGEM = 'img, picture, video';
const FORA = '.product-card *, .v3-promo *, .faixa-promos__imagem *, header, footer, dialog, [hidden], cart-drawer, .drawer, .popup-cupom, .sticky-atc, .vitrine-topo, .announcement-bar, .rv-nao, details *';

function iniciar() {
  if (movimentoReduzido || !('IntersectionObserver' in window)) return;
  const main = document.getElementById('MainContent');
  if (!main) return;

  const secoes = [...main.querySelectorAll('.shopify-section')];
  const primeira = secoes[0];
  const alturaTela = window.innerHeight;

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const el = entrada.target;
        el.classList.add('rv--visivel');
        observador.unobserve(el);
        // Terminada a entrada, a peça volta aos estilos próprios (transições de hover do botão etc.).
        setTimeout(() => {
          el.classList.remove('rv', 'rv--imagem', 'rv--visivel');
          el.style.removeProperty('--rv-atraso');
        }, 1600);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  for (const secao of secoes) {
    if (secao === primeira) continue;
    // Peça dentro de prateleira que rola para o lado: anima a prateleira inteira, não cada cartão
    // (o cartão fora da tela na horizontal nunca entraria na vista ao rolar a página).
    const rolagemLateral = (el) => {
      for (let p = el.parentElement; p && p !== secao; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return p;
      }
      return null;
    };
    const candidatas = new Set();
    for (const el of secao.querySelectorAll(`${TEXTO}, ${IMAGEM}`)) candidatas.add(rolagemLateral(el) || el);
    const pecas = [...candidatas].filter((el) => {
      if (el.parentElement && rolagemLateral(el.parentElement)) return false;
      if (el.closest(FORA)) return false;
      const ehRolagem = ['auto', 'scroll'].includes(getComputedStyle(el).overflowX);
      if (!ehRolagem && el.parentElement && el.parentElement.closest(TEXTO + ', ' + IMAGEM)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 12) return false;
      return r.top > alturaTela * 0.92;
    });

    let passo = 0;
    let ultimoTopo = -1;
    for (const el of pecas) {
      const topo = Math.round(el.getBoundingClientRect().top);
      if (topo !== ultimoTopo) {
        passo = Math.min(passo + 1, 6);
        ultimoTopo = topo;
      }
      el.style.setProperty('--rv-atraso', `${(passo - 1) * 70}ms`);
      el.classList.add('rv');
      if (el.matches(IMAGEM)) el.classList.add('rv--imagem');
      observador.observe(el);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar, { once: true });
} else {
  iniciar();
}
