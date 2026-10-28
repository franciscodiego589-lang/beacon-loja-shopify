/**
 * Beacon Labs · <cart-drawer> (cart-drawer.js)
 *
 * Gaveta do carrinho (snippets/cart-drawer.liquid e sections/cart-drawer.liquid).
 * - Abre: clique em [data-cart-drawer-open] (link da sacola no cabeçalho; o href /cart fica
 *   como reserva sem JS) e evento 'cart:open' (detail.opener opcional).
 * - Fecha: [data-cart-drawer-close], Esc e clique no fundo (openModal/closeModal do global.js,
 *   com <dialog> modal: foco preso, fundo inerte e volta do foco a quem abriu).
 * - 'cart:updated': troca #CartDrawerContent e o contador do título pelo HTML da seção
 *   'cart-drawer' (Section Rendering API). Usa detail.sections['cart-drawer'] quando vier junto
 *   (o cart.api.js já pede a gaveta em toda mudança: pageSections). Quando não vier: com a
 *   gaveta fechada, só marca o conteúdo como velho e pede a seção ao abrir; com a gaveta
 *   aberta, pede na hora (cart.api.js, renderSections) e cancela o pedido anterior ainda em
 *   curso (AbortController); resposta de pedido antigo também é descartada (renderToken).
 * - Sugestões: [data-cart-recommendations] carrega a seção 'cart-drawer-recommendations' pelo
 *   recommendations.api.js, quando a gaveta abre, e guarda o HTML por produto.
 * - Foco depois da troca do HTML: volta ao mesmo controle do mesmo item (chave data-key: botão
 *   +, botão -, campo de quantidade ou remover). Se o item saiu, vai para o remover do item que
 *   ficou no lugar; com o carrinho vazio, para "Continuar comprando".
 * Segurança: só entra HTML vindo da Section Rendering API; nada de texto de usuário em HTML.
 */

import { getConfig, subscribe, EVENTS, openModal, closeModal, parseHTML, captureItemFocus, itemFocusTarget } from '@theme/global';
import { renderSections } from '@theme/cart-api';
import { getRecommendationsNode } from '@theme/recommendations-api';

const SECTION_ID = 'cart-drawer';

class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    if (!this.dialog) return;
    this.recommendationsCache = new Map();
    this.renderToken = 0;

    this.onDocumentClick = (event) => {
      const opener = event.target.closest('[data-cart-drawer-open]');
      if (!opener || getConfig().cartType !== 'drawer') return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
      event.preventDefault();
      this.open(opener);
    };
    this.onClick = (event) => {
      if (event.target.closest('[data-cart-drawer-close]')) {
        event.preventDefault();
        closeModal(this.dialog);
      }
    };
    this.onCancel = (event) => {
      event.preventDefault();
      closeModal(this.dialog);
    };

    document.addEventListener('click', this.onDocumentClick);
    this.addEventListener('click', this.onClick);
    this.dialog.addEventListener('cancel', this.onCancel);
    this.unsubscribeOpen = subscribe(EVENTS.cartOpen, (event) => this.open((event.detail && event.detail.opener) || null));
    this.unsubscribeUpdated = subscribe(EVENTS.cartUpdated, (event) => this.refresh(event.detail || {}));
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onDocumentClick);
    this.removeEventListener('click', this.onClick);
    this.dialog?.removeEventListener('cancel', this.onCancel);
    if (this.unsubscribeOpen) this.unsubscribeOpen();
    if (this.unsubscribeUpdated) this.unsubscribeUpdated();
    if (this.abortController) this.abortController.abort();
  }

  open(opener) {
    if (!this.dialog) return;
    // Quem abriu dentro de outro modal (ex.: botão Adicionar na busca, que fecha em seguida)
    // não pode receber o foco de volta: nesse caso o foco volta para a sacola do cabeçalho.
    const insideOtherDialog = opener instanceof HTMLElement && opener.closest('dialog') && !this.dialog.contains(opener);
    const trigger = opener instanceof HTMLElement && !insideOtherDialog ? opener : document.getElementById('HeaderCart');
    openModal(this.dialog, { opener: trigger });
    // Conteúdo marcado como velho enquanto a gaveta estava fechada: pede a seção agora.
    if (this.stale) this.fetchAndRender(++this.renderToken, null);
    this.loadRecommendations();
  }

  async refresh(detail) {
    const token = ++this.renderToken;
    const html = detail.sections && detail.sections[SECTION_ID];
    if (html) {
      if (this.abortController) this.abortController.abort();
      this.stale = false;
      this.render(html, detail.cart);
      return;
    }
    // Sem a seção na resposta e com a gaveta fechada: nenhum pedido agora, só ao abrir.
    if (!this.dialog.open) {
      this.stale = true;
      return;
    }
    await this.fetchAndRender(token, detail.cart);
  }

  /** Pede a seção 'cart-drawer' (cancelando o pedido anterior) e troca o conteúdo. */
  async fetchAndRender(token, cart) {
    if (this.abortController) this.abortController.abort();
    const controller = new AbortController();
    this.abortController = controller;
    let html = '';
    try {
      const sections = await renderSections([SECTION_ID], { signal: controller.signal });
      html = sections[SECTION_ID];
    } catch (error) {
      return;
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
    if (!html || token !== this.renderToken) return;
    this.stale = false;
    this.render(html, cart);
  }

  render(html, cart) {
    const doc = parseHTML(html);
    const nextContent = doc.getElementById('CartDrawerContent');
    const currentContent = this.querySelector('#CartDrawerContent');
    if (!nextContent || !currentContent) return;

    const active = document.activeElement;
    const focus = active && active !== document.body && currentContent.contains(active) ? this.describeFocus(active) : null;

    currentContent.replaceChildren(...Array.from(nextContent.childNodes, (node) => document.importNode(node, true)));

    const nextCount = doc.querySelector('[data-cart-drawer-count]');
    const currentCount = this.querySelector('[data-cart-drawer-count]');
    if (nextCount && currentCount) currentCount.textContent = nextCount.textContent;

    const nextDrawer = doc.querySelector('cart-drawer');
    const empty = nextDrawer ? nextDrawer.classList.contains('cart-drawer--empty') : !!(cart && cart.item_count === 0);
    this.classList.toggle('cart-drawer--empty', empty);

    this.restoreFocus(focus);
    if (this.dialog.open) this.loadRecommendations();
  }

  /**
   * Guarda onde estava o foco antes da troca do HTML. Dentro de um item, o que vale é a chave
   * do item (data-key, não muda quando outra linha sai) e o tipo de controle; o id do campo
   * (CartDrawerQuantity-N) segue a posição da linha e apontaria para outro produto.
   */
  describeFocus(element) {
    // Dentro de uma linha: retrato comum da gaveta e da página (global.js, captureItemFocus).
    return captureItemFocus(element, this.drawerItems()) || { id: element.id || '' };
  }

  drawerItems() {
    return Array.from(this.querySelectorAll('#CartDrawerContent [data-cart-item]'));
  }

  restoreFocus(focus) {
    if (!this.dialog.open) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected && this.dialog.contains(active)) return;
    let target = null;
    if (focus && focus.key !== undefined) {
      // Mesmo controle da mesma linha; se a linha saiu, o remover da que ficou no lugar.
      target = itemFocusTarget(focus, this.drawerItems());
    } else if (focus && focus.id) {
      target = this.querySelector(`#${CSS.escape(focus.id)}`);
    }
    if (!target) target = this.querySelector('.cart-drawer__continue') || this.querySelector('[data-cart-drawer-close]');
    if (target) target.focus({ preventScroll: true });
  }

  async loadRecommendations() {
    const container = this.querySelector('[data-cart-recommendations]');
    if (!container) return;
    const productId = container.dataset.productId;
    if (!productId) return;
    // A seção de sugestões tira os produtos que já estão no carrinho; por isso o HTML guardado
    // vale para o produto de referência E para a lista de produtos do carrinho naquele momento.
    const cartProducts = (container.dataset.cartProducts || '').split(',').filter(Boolean);
    const cacheKey = `${productId}|${cartProducts.join(',')}`;
    if (container.dataset.loadedFor === cacheKey) return;
    container.dataset.loadedFor = cacheKey;

    // O nó guardado é a marcação importada; cada inserção usa uma cópia dele.
    let loaded = this.recommendationsCache.get(cacheKey);
    if (loaded === undefined) {
      const limit = Number.parseInt(container.dataset.limit, 10) || 3;
      loaded = await getRecommendationsNode(productId, '[data-cart-recommendations-loaded]', {
        sectionId: container.dataset.sectionId || 'cart-drawer-recommendations',
        // Pede a mais o que pode sair por já estar no carrinho (a API aceita até 10).
        limit: Math.min(10, limit + cartProducts.length),
        intent: container.dataset.intent || 'related',
        url: container.dataset.url,
      });
      this.recommendationsCache.set(cacheKey, loaded);
    }
    if (!container.isConnected) return;

    if (loaded) {
      container.replaceChildren(loaded.cloneNode(true));
    } else {
      container.replaceChildren();
    }
  }
}

if (!customElements.get('cart-drawer')) {
  customElements.define('cart-drawer', CartDrawer);
}
