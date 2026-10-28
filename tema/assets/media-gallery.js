/**
 * Beacon Labs · <media-gallery> (media-gallery.js)
 *
 * Galeria da página de produto (sections/main-product.liquid, bloco "galeria").
 * Estrutura: [data-gallery-list] > [data-gallery-item] (uma por mídia, sempre no DOM;
 * a ativa recebe a classe is-active) + [data-gallery-thumbs] > [data-gallery-thumb-item]
 * (mesma ordem; a miniatura da mídia ativa fica com hidden, porque ela já aparece grande —
 * a grade de miniaturas mostra só "as demais mídias", como no contrato).
 *
 * Comportamento:
 * - Clique numa miniatura ([data-gallery-thumb]): mostra aquela mídia em destaque. A grade de
 *   2 colunas aparece em todas as larguras (maquete Produto-Mobile: foto principal + grade 2 × 2),
 *   então teclado e leitor de tela trocam de mídia no celular também. Se a miniatura estava com
 *   o foco, o foco vai para a mídia em destaque (a miniatura escolhida some da grade).
 * - Arrastar o dedo no palco (celular): troca para a mídia seguinte/anterior (sem voltar do
 *   fim ao início). O contador ([data-gallery-counter]) acompanha e é lido pela região viva
 *   do próprio contador (aria-live no Liquid).
 * - Vídeo e modelo 3D ficam num <template> (data-deferred-media-template) e só entram na
 *   página quando o botão de reproduzir é clicado (data-deferred-media-trigger).
 * - Zoom: abre [data-gallery-dialog] com openModal (foco preso, Esc fecha) e rola a lista de
 *   zoom até a mídia ativa; fecha com [data-gallery-dialog-close].
 * - Modelo 3D "Ver em 3D" (AR): inicializa a biblioteca Shopify-XR exatamente como a
 *   documentação oficial descreve (Shopify.loadFeatures + ShopifyXR.addModels/setupXRElements
 *   a partir do JSON em [data-gallery-models]); a própria biblioteca escaneia o botão
 *   [data-shopify-xr] e cuida do clique — este arquivo só a inicializa.
 * - 'variant:change' (mesmo data-section-id): troca para a mídia de destaque da variante
 *   (featuredMediaId) quando existir, e atualiza o selo de % OFF (a variante pode ter preço
 *   comparativo diferente por kit).
 *
 * Textos ({current}/{total}/{percent}) vêm de [data-gallery-strings], nunca fixos aqui.
 * Segurança: nenhum HTML é montado a partir de texto; o conteúdo adiado vem só do próprio
 * <template> escrito pelo Liquid (mídia da Shopify), nunca de texto de usuário.
 */

import { readJSON, subscribe, EVENTS, openModal, closeModal, interpolate, bindSwipe } from '@theme/global';

class MediaGallery extends HTMLElement {
  connectedCallback() {
    // Todo ouvinte ligado aqui é desligado no disconnectedCallback (padrão on()/cleanup de
    // carousel-slider.js): cliques, zoom, fechar, deslizar e o evento da AR.
    this.cleanup = [];
    this.sectionId = this.dataset.sectionId || '';
    this.items = Array.from(this.querySelectorAll('[data-gallery-item]'));
    this.thumbItems = Array.from(this.querySelectorAll('[data-gallery-thumb-item]'));
    this.strings = readJSON(this.querySelector('[data-gallery-strings]')) || {};
    this.activeIndex = Number.parseInt(this.dataset.activeIndex, 10) || 0;

    this.list = this.querySelector('[data-gallery-list]');
    this.counter = this.querySelector('[data-gallery-counter]');
    this.chip = this.querySelector('[data-gallery-chip]');
    this.discount = this.querySelector('[data-gallery-discount]');
    this.discountValue = this.querySelector('[data-gallery-discount-value]');
    this.dialog = this.querySelector('[data-gallery-dialog]');
    this.zoomButton = this.querySelector('[data-gallery-zoom]');
    this.zoomItems = Array.from(this.querySelectorAll('[data-zoom-media-id]'));

    this.onThumbClick = (event) => {
      const thumb = event.target.closest('[data-gallery-thumb]');
      if (!thumb || !this.contains(thumb)) return;
      const index = this.items.findIndex((item) => item.dataset.mediaId === thumb.dataset.mediaId);
      if (index < 0) return;
      // A miniatura escolhida some da grade (a mídia passa a aparecer grande). Se ela estava
      // com o foco, o foco iria para o <body>: leva o foco para a mídia em destaque.
      const hadFocus = document.activeElement === thumb;
      this.goTo(index);
      if (hadFocus && this.items[index]) this.items[index].focus({ preventScroll: true });
    };
    this.on(this, 'click', this.onThumbClick);

    this.onDeferredClick = (event) => {
      const trigger = event.target.closest('[data-deferred-media-trigger]');
      if (!trigger || !this.contains(trigger)) return;
      this.loadDeferred(trigger.closest('[data-deferred-media]'));
    };
    this.on(this, 'click', this.onDeferredClick);

    if (this.zoomButton && this.dialog) {
      this.onZoomOpen = () => {
        openModal(this.dialog, { opener: this.zoomButton });
        this.scrollZoomTo(this.activeIndex);
      };
      this.on(this.zoomButton, 'click', this.onZoomOpen);
      this.dialog.querySelectorAll('[data-gallery-dialog-close]').forEach((button) => {
        this.on(button, 'click', () => closeModal(this.dialog));
      });
    }

    // Gesto comum (global.js): deslizar na foto troca a mídia.
    if (this.list) this.cleanup.push(bindSwipe(this.list, (direction) => this.goTo(this.activeIndex + direction)));

    const models = readJSON(this.querySelector('[data-gallery-models]'));
    if (Array.isArray(models) && models.length > 0) this.setupXR(models);

    this.unsubscribeVariant = subscribe(EVENTS.variantChange, (event) => this.onVariantChange(event));

    this.render();
  }

  disconnectedCallback() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    if (this.unsubscribeVariant) this.unsubscribeVariant();
  }

  /** addEventListener com remoção automática no disconnectedCallback. */
  on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  goTo(index) {
    const count = this.items.length;
    if (count === 0) return;
    this.activeIndex = Math.min(Math.max(index, 0), count - 1);
    this.render();
  }

  render() {
    // tabindex -1 em todas: a mídia em destaque recebe foco só por script (depois de escolher uma
    // miniatura), sem virar uma parada de Tab sem ação.
    this.items.forEach((item, position) => {
      const active = position === this.activeIndex;
      item.classList.toggle('is-active', active);
      item.tabIndex = -1;
    });

    this.thumbItems.forEach((thumbItem, position) => {
      thumbItem.hidden = position === this.activeIndex;
    });

    if (this.counter && this.strings.counter) {
      this.counter.textContent = interpolate(this.strings.counter, {
        current: this.activeIndex + 1,
        total: this.items.length,
      });
    }

    if (this.chip) this.chip.hidden = this.activeIndex !== 0;

    if (this.dialog && this.dialog.open) this.scrollZoomTo(this.activeIndex);
  }

  scrollZoomTo(index) {
    const item = this.items[index];
    const target = item && this.zoomItems.find((zoom) => zoom.dataset.zoomMediaId === item.dataset.mediaId);
    if (target) target.scrollIntoView({ block: 'nearest' });
  }

  loadDeferred(container) {
    if (!container || container.dataset.loaded === 'true') return;
    const template = container.querySelector('[data-deferred-media-template]');
    if (!template) return;
    container.dataset.loaded = 'true';
    container.replaceChildren(document.importNode(template.content, true));
  }

  /** Inicialização da AR, exatamente como shopify.dev/docs/storefronts/themes/product-merchandising/media/support-media (consultado em 27/09/2026). */
  setupXR(models) {
    const init = () => {
      if (!window.ShopifyXR) {
        this.on(document, 'shopify_xr_initialized', init, { once: true });
        return;
      }
      window.ShopifyXR.addModels(models);
      window.ShopifyXR.setupXRElements();
    };
    if (window.Shopify && typeof window.Shopify.loadFeatures === 'function') {
      window.Shopify.loadFeatures([{ name: 'shopify-xr', version: '1.0', onLoad: init }]);
    }
  }

  onVariantChange(event) {
    const detail = (event && event.detail) || {};
    if (!detail.sectionId || detail.sectionId !== this.sectionId) return;
    const variant = detail.variant;
    if (!variant) return;

    if (variant.featuredMediaId) {
      const index = this.items.findIndex((item) => item.dataset.mediaId === String(variant.featuredMediaId));
      if (index >= 0) this.goTo(index);
    }

    if (this.discount) {
      const price = Number(variant.price) || 0;
      const compare = Number(variant.compareAtPrice) || 0;
      const onSale = compare > price;
      if (onSale && this.discountValue && this.strings.discount) {
        const percent = Math.floor(((compare - price) * 100) / compare);
        this.discountValue.textContent = interpolate(this.strings.discount, { percent });
      }
      this.discount.hidden = !onSale;
    }
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}
