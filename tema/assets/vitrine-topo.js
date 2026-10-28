/**
 * Beacon Labs · vitrine-topo.js (<vitrine-carrossel>)
 *
 * Carrossel de banners do topo da home (sections/vitrine-topo.liquid), redesenho v3, 02/10/2026.
 * Comportamento da maquete docs/superpowers/redesign-v3/capa/carrossel-3-banners.html:
 * - rolagem com encaixe (scroll-snap, no CSS); setas e pontos rolam o trilho até o banner;
 * - nenhuma troca automática: quem lê controla;
 * - a altura do trilho segue o banner da vez (no celular a capa com texto é mais alta que as outras);
 * - nas pontas, a seta recebe aria-disabled="true" (continua focável), como nos outros carrosséis;
 * - sem JS, o Liquid entrega setas e pontos com hidden e o trilho segue rolável por toque.
 *
 * Editor de tema: shopify:block:select leva o trilho ao banner do bloco.
 *
 * Segurança: nenhum HTML é montado a partir de texto; só atributos e estilo de elementos que já existem.
 */

class VitrineCarrossel extends HTMLElement {
  connectedCallback() {
    this.trilho = this.querySelector('[data-vitrine-trilho]');
    if (!this.trilho) return;
    this.slides = [...this.trilho.children];
    this.pontos = [...this.querySelectorAll('[data-vitrine-ponto]')];
    this.anterior = this.querySelector('[data-vitrine-anterior]');
    this.proximo = this.querySelector('[data-vitrine-proximo]');
    this.quadro = 0;
    this.controle = new AbortController();
    const opcoes = { signal: this.controle.signal };

    if (this.slides.length > 1) {
      this.querySelectorAll('[data-vitrine-controle]').forEach((e) => e.removeAttribute('hidden'));
    }

    if (this.anterior) this.anterior.addEventListener('click', () => this.vai(this.atual() - 1), opcoes);
    if (this.proximo) this.proximo.addEventListener('click', () => this.vai(this.atual() + 1), opcoes);
    this.pontos.forEach((ponto, i) => ponto.addEventListener('click', () => this.vai(i), opcoes));

    this.trilho.addEventListener('scroll', () => this.agenda(), { ...opcoes, passive: true });
    window.addEventListener('resize', () => this.agenda(), opcoes);
    window.addEventListener('load', () => this.agenda(), opcoes);
    this.addEventListener('shopify:block:select', (evento) => this.aoSelecionarBloco(evento), opcoes);

    // O texto da capa quebra de outro jeito quando a largura muda: observar os banners mantém a altura certa.
    if ('ResizeObserver' in window) {
      this.observador = new ResizeObserver(() => this.agenda());
      this.slides.forEach((slide) => this.observador.observe(slide));
    }
    this.atualiza();
  }

  disconnectedCallback() {
    if (this.controle) this.controle.abort();
    if (this.observador) this.observador.disconnect();
    if (this.quadro) cancelAnimationFrame(this.quadro);
    this.quadro = 0;
  }

  atual() {
    const largura = this.trilho.clientWidth || 1;
    return Math.max(0, Math.min(this.slides.length - 1, Math.round(this.trilho.scrollLeft / largura)));
  }

  vai(indice) {
    const destino = Math.max(0, Math.min(this.slides.length - 1, indice));
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.trilho.scrollTo({ left: destino * this.trilho.clientWidth, behavior: reduzido ? 'auto' : 'smooth' });
  }

  agenda() {
    if (this.quadro) return;
    this.quadro = requestAnimationFrame(() => {
      this.quadro = 0;
      this.atualiza();
    });
  }

  atualiza() {
    const i = this.atual();
    this.pontos.forEach((ponto, k) => {
      if (k === i) ponto.setAttribute('aria-current', 'true');
      else ponto.removeAttribute('aria-current');
    });
    if (this.anterior) this.anterior.setAttribute('aria-disabled', i === 0 ? 'true' : 'false');
    if (this.proximo) this.proximo.setAttribute('aria-disabled', i === this.slides.length - 1 ? 'true' : 'false');
    const altura = this.slides[i].offsetHeight;
    if (altura > 0) this.trilho.style.height = altura + 'px';
  }

  aoSelecionarBloco(evento) {
    const indice = this.slides.findIndex((slide) => slide === evento.target || slide.contains(evento.target));
    if (indice >= 0) this.vai(indice);
  }
}

if (!customElements.get('vitrine-carrossel')) {
  customElements.define('vitrine-carrossel', VitrineCarrossel);
}
