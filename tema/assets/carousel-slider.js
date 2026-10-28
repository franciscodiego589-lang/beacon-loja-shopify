/**
 * Beacon Labs · carousel-slider.js (<carousel-slider>)
 *
 * Um único elemento para os carrosséis do tema, com dois modos (atributo data-mode):
 *
 * 1. "fade" (padrão): um slide visível por vez; os outros ficam com o atributo hidden.
 *    Usado pela barra de anúncio (sections/announcement-bar.liquid) e pelo banner principal
 *    (sections/hero-slideshow.liquid).
 *    - data-autoplay="true": troca sozinho a cada data-interval segundos (padrão 5, mínimo 3).
 *      Não começa sozinho quando o visitante pede menos movimento (prefers-reduced-motion):
 *      nesse caso começa pausado e o botão de pausa oferece "retomar".
 *      Pausa com o ponteiro do mouse em cima, com o foco do teclado dentro, fora da tela ou
 *      escondido (hidden), com a aba escondida, no editor de tema (bloco selecionado) e pelo
 *      botão de pausa.
 *    - data-loop: dá a volta do último ao primeiro, a não ser que data-loop="false".
 *    - Controles: [data-carousel-prev], [data-carousel-next], [data-carousel-dot="índice"]
 *      (recebe aria-current="true" no slide ativo) e [data-carousel-pause]
 *      (com data-label-pause e data-label-play: rótulo e ícone trocam conforme o estado;
 *      se o botão vier com aria-pressed, ele também é atualizado, "true" quando pausado; o
 *      banner e a barra de anúncio usam o padrão APG, só com o rótulo trocado, sem aria-pressed).
 *    - Enquanto troca sozinho, o trilho fica com aria-live="off"; parado, aria-live="polite".
 *    - Deslizar o dedo no trilho troca o slide.
 *    - A imagem do próximo slide é pré-carregada (loading lazy vira eager).
 *    - Evento 'carousel:change' (EVENTS.carouselChange de global.js; bubbles, detail.index) a
 *      cada troca de slide.
 *
 * 2. "scroll": trilho com rolagem horizontal e scroll-snap (o CSS fica na seção e em
 *    home-carousel.css). Usado pelos carrosséis de produtos, depoimentos e vídeos.
 *    - [data-carousel-prev] e [data-carousel-next] rolam uma página de cards inteiros.
 *    - Nas pontas, a seta recebe aria-disabled="true" (continua focável).
 *    - Sem nada para rolar, setas e indicador ficam com hidden.
 *    - [data-carousel-progress]: indicador decorativo de páginas (aria-hidden no Liquid),
 *      montado aqui com <span class="carousel-slider__dot">; a página atual recebe .is-active.
 *
 * Estrutura mínima:
 *   <carousel-slider data-mode="fade|scroll" ...>
 *     <div data-carousel-track> <div data-carousel-slide>…</div> … </div>
 *   </carousel-slider>
 *
 * Editor de tema: shopify:block:select mostra o slide do bloco (e pausa no modo fade);
 * shopify:block:deselect retoma.
 *
 * Segurança: nenhum HTML é montado a partir de texto; só elementos criados com
 * createElement, atributos e ícones de global.js.
 */

import { createIcon, prefersReducedMotion, MEDIA, EVENTS, bindSwipe } from '@theme/global';

const EDGE_TOLERANCE = 2;

/** Elementos do seletor que pertencem a este carrossel (e não a um carrossel aninhado). */
function ownElements(host, selector) {
  return Array.from(host.querySelectorAll(selector)).filter((element) => element.closest('carousel-slider') === host);
}

function setDisabled(button, disabled) {
  if (disabled) {
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.removeAttribute('aria-disabled');
  }
}

function wrapIndex(value, count) {
  return ((value % count) + count) % count;
}

export class CarouselSlider extends HTMLElement {
  constructor() {
    super();
    this.index = 0;
    this.timer = null;
    this.frame = 0;
    this.cleanup = [];
    this.pauseReasons = new Set();
  }

  connectedCallback() {
    this.track = ownElements(this, '[data-carousel-track]')[0] || null;
    if (!this.track) return;

    this.mode = this.dataset.mode === 'scroll' ? 'scroll' : 'fade';
    this.prevButtons = ownElements(this, '[data-carousel-prev]');
    this.nextButtons = ownElements(this, '[data-carousel-next]');

    this.on(this, 'click', (event) => this.onClick(event));
    this.on(this, 'shopify:block:select', (event) => this.onBlockSelect(event));
    this.on(this, 'shopify:block:deselect', () => this.onBlockDeselect());

    if (this.mode === 'scroll') {
      this.initScroll();
    } else {
      this.initFade();
    }
  }

  disconnectedCallback() {
    this.stopTimer();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }

  /** addEventListener com remoção automática no disconnectedCallback. */
  on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  getSlides() {
    return Array.from(this.track.querySelectorAll('[data-carousel-slide]')).filter(
      (slide) => slide.closest('carousel-slider') === this
    );
  }

  onClick(event) {
    const control =
      event.target instanceof Element
        ? event.target.closest('[data-carousel-prev], [data-carousel-next], [data-carousel-dot], [data-carousel-pause]')
        : null;
    if (!control || control.closest('carousel-slider') !== this) return;
    if (control.getAttribute('aria-disabled') === 'true') return;

    if (control.hasAttribute('data-carousel-prev')) {
      this.step(-1);
    } else if (control.hasAttribute('data-carousel-next')) {
      this.step(1);
    } else if (control.hasAttribute('data-carousel-dot')) {
      const target = Number.parseInt(control.dataset.carouselDot, 10);
      if (Number.isInteger(target)) this.goTo(target);
    } else if (control.hasAttribute('data-carousel-pause')) {
      this.toggleUserPause();
    }
  }

  step(direction) {
    if (this.mode === 'scroll') {
      this.scrollByPage(direction);
    } else {
      this.goTo(this.index + direction);
    }
  }

  /* ---------- Modo fade ---------- */

  initFade() {
    const slides = this.getSlides();
    const visible = slides.findIndex((slide) => !slide.hidden);
    this.index = visible >= 0 ? visible : 0;
    this.loop = this.dataset.loop !== 'false';
    this.autoplay = this.dataset.autoplay === 'true' && slides.length > 1;

    const seconds = Number.parseFloat(this.dataset.interval);
    this.interval = (Number.isFinite(seconds) && seconds > 0 ? Math.max(3, seconds) : 5) * 1000;

    this.pauseButtons = ownElements(this, '[data-carousel-pause]');

    this.renderFade();

    if (slides.length > 1) {
      this.bindSwipe();
      this.preload(this.index + 1);
    }

    if (this.autoplay) {
      if (prefersReducedMotion()) this.pauseReasons.add('user');
      this.bindAutoplayPauses();
      this.updatePauseButtons();
    }
    this.schedule();
  }

  goTo(target) {
    if (this.mode === 'scroll') return;
    const slides = this.getSlides();
    const count = slides.length;
    if (count === 0) return;

    const next = this.loop ? wrapIndex(target, count) : Math.min(Math.max(target, 0), count - 1);
    const changed = next !== this.index;
    this.index = next;
    this.renderFade();
    this.preload(next + 1);
    this.schedule();
    if (changed) {
      this.dispatchEvent(new CustomEvent(EVENTS.carouselChange, { bubbles: true, detail: { index: next } }));
    }
  }

  renderFade() {
    const slides = this.getSlides();
    const count = slides.length;
    if (count === 0) return;
    if (this.index > count - 1) this.index = count - 1;

    slides.forEach((slide, position) => {
      slide.hidden = position !== this.index;
    });

    ownElements(this, '[data-carousel-dot]').forEach((dot) => {
      if (Number.parseInt(dot.dataset.carouselDot, 10) === this.index) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });

    const atStart = !this.loop && this.index === 0;
    const atEnd = !this.loop && this.index === count - 1;
    this.prevButtons.forEach((button) => setDisabled(button, atStart));
    this.nextButtons.forEach((button) => setDisabled(button, atEnd));
  }

  /** Troca loading="lazy" por "eager" nas imagens do slide indicado, para ele já estar pronto. */
  preload(position) {
    const slides = this.getSlides();
    if (slides.length < 2) return;
    const slide = slides[wrapIndex(position, slides.length)];
    slide.querySelectorAll('img[loading="lazy"]').forEach((image) => {
      image.loading = 'eager';
    });
  }

  bindSwipe() {
    // Gesto comum (global.js); a função devolvida desliga os ouvintes no disconnectedCallback.
    this.cleanup.push(bindSwipe(this.track, (direction) => this.goTo(this.index + direction)));
  }

  bindAutoplayPauses() {
    this.on(this, 'pointerenter', (event) => {
      if (event.pointerType === 'mouse') this.setPause('hover', true);
    });
    this.on(this, 'pointerleave', (event) => {
      if (event.pointerType === 'mouse') this.setPause('hover', false);
    });
    this.on(this, 'focusin', () => this.setPause('focus', true));
    this.on(this, 'focusout', (event) => {
      if (!(event.relatedTarget instanceof Node) || !this.contains(event.relatedTarget)) {
        this.setPause('focus', false);
      }
    });
    this.on(document, 'visibilitychange', () => this.setPause('tab', document.hidden));

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => this.setPause('offscreen', !entry.isIntersecting));
      });
      observer.observe(this);
      this.cleanup.push(() => observer.disconnect());
    }

    const motionQuery = window.matchMedia(MEDIA.reducedMotion);
    const onMotionChange = () => {
      if (!motionQuery.matches) return;
      this.pauseReasons.add('user');
      this.updatePauseButtons();
      this.schedule();
    };
    if (typeof motionQuery.addEventListener === 'function') {
      this.on(motionQuery, 'change', onMotionChange);
    }
  }

  setPause(reason, active) {
    const had = this.pauseReasons.has(reason);
    if (active === had) return;
    if (active) {
      this.pauseReasons.add(reason);
    } else {
      this.pauseReasons.delete(reason);
    }
    this.schedule();
  }

  toggleUserPause() {
    if (this.pauseReasons.has('user')) {
      // Retomar é um pedido explícito: vale mesmo com o foco ou o ponteiro no botão.
      this.pauseReasons.delete('user');
      this.pauseReasons.delete('focus');
      this.pauseReasons.delete('hover');
    } else {
      this.pauseReasons.add('user');
    }
    this.updatePauseButtons();
    this.schedule();
  }

  updatePauseButtons() {
    const paused = this.pauseReasons.has('user');
    (this.pauseButtons || []).forEach((button) => {
      const label = paused ? button.dataset.labelPlay : button.dataset.labelPause;
      if (label) button.setAttribute('aria-label', label);
      if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', paused ? 'true' : 'false');
      button.dataset.state = paused ? 'paused' : 'playing';

      const currentIcon = button.querySelector('svg');
      const size = currentIcon ? Number.parseInt(currentIcon.getAttribute('width'), 10) || 16 : 16;
      const extraClass = currentIcon
        ? Array.from(currentIcon.classList)
            .filter((name) => name !== 'icon' && !name.startsWith('icon--'))
            .join(' ')
        : '';
      const icon = createIcon(paused ? 'play' : 'pause', size, extraClass);
      if (currentIcon) {
        currentIcon.replaceWith(icon);
      } else {
        button.appendChild(icon);
      }
    });
  }

  isRunning() {
    return Boolean(this.autoplay) && this.pauseReasons.size === 0;
  }

  schedule() {
    this.stopTimer();
    if (this.mode !== 'fade') return;
    const running = this.isRunning();
    this.track.setAttribute('aria-live', running ? 'off' : 'polite');
    if (!running) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      // Escondido (ex.: barra de anúncio mostrando o frete grátis): espera sem trocar.
      if (this.hidden || this.closest('[hidden]') || document.hidden) {
        this.schedule();
        return;
      }
      const count = this.getSlides().length;
      if (count < 2) return;
      // A troca automática sempre dá a volta, mesmo sem data-loop.
      this.goTo(wrapIndex(this.index + 1, count));
    }, this.interval);
  }

  stopTimer() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /* ---------- Modo scroll ---------- */

  initScroll() {
    this.progress = ownElements(this, '[data-carousel-progress]')[0] || null;
    this.on(this.track, 'scroll', () => this.requestUpdate(), { passive: true });

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => this.requestUpdate());
      observer.observe(this.track);
      this.cleanup.push(() => observer.disconnect());
    } else {
      this.on(window, 'resize', () => this.requestUpdate());
    }

    this.updateScroll();
  }

  requestUpdate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.updateScroll();
    });
  }

  /** Largura de uma página: quantos cards inteiros cabem na área visível × (card + espaço). */
  getPageWidth() {
    const styles = window.getComputedStyle(this.track);
    const paddingStart = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingEnd = Number.parseFloat(styles.paddingRight) || 0;
    const visible = Math.max(0, this.track.clientWidth - paddingStart - paddingEnd);
    const slides = this.getSlides();
    if (slides.length === 0 || visible === 0) return this.track.clientWidth || 1;

    const gap = Number.parseFloat(styles.columnGap) || 0;
    const slideWidth = slides[0].getBoundingClientRect().width;
    if (!slideWidth) return visible || 1;

    const stepWidth = slideWidth + gap;
    const perPage = Math.max(1, Math.floor((visible + gap) / stepWidth));
    return perPage * stepWidth;
  }

  scrollByPage(direction) {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    this.track.scrollBy({ left: direction * this.getPageWidth(), behavior });
  }

  updateScroll() {
    const { scrollLeft, scrollWidth, clientWidth } = this.track;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    const scrollable = maxScroll > EDGE_TOLERANCE;
    const atStart = scrollLeft <= EDGE_TOLERANCE;
    const atEnd = scrollLeft >= maxScroll - EDGE_TOLERANCE;

    this.toggleAttribute('data-scrollable', scrollable);
    this.prevButtons.forEach((button) => {
      button.hidden = !scrollable;
      setDisabled(button, atStart);
    });
    this.nextButtons.forEach((button) => {
      button.hidden = !scrollable;
      setDisabled(button, atEnd);
    });

    if (!this.progress) return;

    const pageWidth = this.getPageWidth();
    const pages = scrollable ? Math.ceil(maxScroll / pageWidth - 0.01) + 1 : 1;
    this.progress.hidden = pages < 2;
    if (pages < 2) return;

    if (this.progress.childElementCount !== pages) {
      const dots = Array.from({ length: pages }, () => {
        const dot = document.createElement('span');
        dot.className = 'carousel-slider__dot';
        return dot;
      });
      this.progress.replaceChildren(...dots);
    }

    const current = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(scrollLeft / pageWidth));
    Array.from(this.progress.children).forEach((dot, position) => {
      dot.classList.toggle('is-active', position === current);
    });
  }

  /* ---------- Editor de tema ---------- */

  onBlockSelect(event) {
    const slide = event.target instanceof Element ? event.target.closest('[data-carousel-slide]') : null;
    if (!slide || slide.closest('carousel-slider') !== this) return;
    const position = this.getSlides().indexOf(slide);
    if (position < 0) return;

    if (this.mode === 'scroll') {
      const styles = window.getComputedStyle(this.track);
      const paddingStart = Number.parseFloat(styles.paddingLeft) || 0;
      const offset = slide.getBoundingClientRect().left - this.track.getBoundingClientRect().left - paddingStart;
      this.track.scrollBy({ left: offset, behavior: 'auto' });
      return;
    }

    this.pauseReasons.add('editor');
    this.goTo(position);
  }

  onBlockDeselect() {
    if (this.mode !== 'fade') return;
    this.pauseReasons.delete('editor');
    this.schedule();
  }
}

if (!customElements.get('carousel-slider')) {
  customElements.define('carousel-slider', CarouselSlider);
}
