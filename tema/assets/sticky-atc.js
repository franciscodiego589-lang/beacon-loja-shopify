/**
 * Beacon Labs · <sticky-atc> (sticky-atc.js)
 *
 * Barra fixa de compra (sections/sticky-atc.liquid). Some por padrão (o Liquid já entrega o
 * elemento com o atributo hidden); um IntersectionObserver observa o botão principal de
 * compra ([data-main-product-submit], dentro de [data-main-product]) e só mostra a barra
 * depois que esse botão passa por cima da tela (boundingClientRect.top < 0 e não está
 * intersectando) — não ao carregar a página, quando o botão ainda não foi alcançado. A barra
 * some de novo quando o botão volta a aparecer.
 *
 * Enquanto a barra está visível, define --chat-offset em :root com a altura dela: o botão de
 * atendimento do rodapé (section-footer.css, bottom: calc(16px + var(--chat-offset))) sobe e
 * não fica escondido atrás da barra. Também define --sticky-atc-space (mesma altura), que vira
 * padding no fim do <body>: o fim do rodapé não fica atrás da barra, e põe no <html> a classe
 * .lg-has-sticky-atc (scroll-padding-bottom e folga, liquid-glass.css e section-sticky-atc.css).
 * Ao sumir, remove as três. A cada mudança publica 'sticky-atc:change' (EVENTS.stickyAtcChange,
 * detail { visible, height }), o contrato lido por liquid-glass.js (antes ele observava o
 * atributo style do <html> com MutationObserver).
 *
 * A barra também fica escondida enquanto o bloco "Compre junto" (<combo-offer>) está na tela
 * (redesenho v3, emenda U4; um segundo IntersectionObserver): o combo tem o próprio botão de
 * adicionar, e duas barras de compra juntas confundem. A margem de baixo do observador desconta a
 * altura da barra: um combo que só encosta na base da janela, por trás da barra, não conta como
 * "na tela". Escondida, a barra tem o atributo hidden (display: none), então sai da tabulação.
 *
 * Sem o botão principal na página (seção "Compra fixa" usada sozinha, fora da página de
 * produto no editor), o componente não faz nada: nunca aparece uma barra "solta".
 *
 * Acompanha a troca de kit: escuta 'variant:change' e só reage quando o detail.sectionId é o
 * da seção principal (encontrada pelo próprio DOM, nunca fixo aqui), atualizando o texto do
 * botão (buyLabel de global.js, mesmas strings da seção principal), o preço (o Liquid escreve um
 * snippets/price.liquid por variante em [data-sticky-atc-price="ID"]; aqui só se mostra o da
 * variante ativa) e a variante enviada ao adicionar.
 *
 * O próprio botão desta barra chama cart.api.js add() (não depende de <product-form>, porque
 * esta seção não sabe, em Liquid, qual é o id da seção principal), pelo fluxo comum
 * runAddToCart(). Carrinho em gaveta: publica 'cart:open'. Carrinho em página: vai para o
 * carrinho, como o formulário principal (a Shopify leva a /cart depois de /cart/add).
 * Segurança: nenhum HTML monta a partir de texto; tudo por textContent.
 */

import { readJSON, subscribe, publish, EVENTS, buyLabel } from '@theme/global';
import { add, runAddToCart } from '@theme/cart-api';

const CHAT_OFFSET = '--chat-offset';
const PAGE_SPACE = '--sticky-atc-space';
// Altura aproximada da barra flutuante (96 px no computador, 84 no celular, mais o recuo).
const COMBO_MARGIN = 96;

class StickyAtc extends HTMLElement {
  connectedCallback() {
    this.mainProduct = document.querySelector('[data-main-product]');
    this.anchor = this.mainProduct ? this.mainProduct.querySelector('[data-main-product-submit]') : null;
    this.submitButton = this.querySelector('[data-sticky-atc-submit]');
    if (!this.anchor || !this.submitButton) return;

    this.mainSectionId = this.mainProduct.dataset.sectionId || '';
    this.strings = readJSON(this.querySelector('[data-sticky-atc-strings]')) || {};
    this.variantId = this.dataset.variantId || '';
    this.available = !this.submitButton.disabled;
    this.errorElement = this.querySelector('[data-sticky-atc-error]');
    this.labelElement = this.querySelector('[data-sticky-atc-label]');

    this.onClick = () => this.onSubmit();
    this.submitButton.addEventListener('click', this.onClick);

    // A barra aparece quando o botão principal já passou por cima da tela e o "Compre junto" não
    // está à vista; qualquer um dos dois observadores reavalia as duas condições.
    this.buttonPassed = false;
    this.comboOnScreen = false;

    this.observer = new IntersectionObserver(
      ([entry]) => {
        this.buttonPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        this.refreshVisibility();
      },
      { threshold: 0 }
    );
    this.observer.observe(this.anchor);

    // Um observador só avisa quando o botão entra ou sai da tela. Num salto que passa por cima dele
    // sem nunca o mostrar (tecla End, âncora sem rolagem suave, botão abaixo da dobra no celular), o
    // estado "fora da tela" não muda e nada avisa. A leitura por rolagem, uma por quadro, cobre isso.
    this.onScroll = () => {
      if (this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        const passed = this.anchor.getBoundingClientRect().bottom < 0;
        if (passed !== this.buttonPassed) {
          this.buttonPassed = passed;
          this.refreshVisibility();
        }
      });
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });

    // O "Compre junto" fica depois da seção do produto; sem ele na página (ou escondido, à espera
    // das recomendações), nada muda. Se ele chegar depois, o observador o encontra no mesmo seletor.
    const combo = document.querySelector('combo-offer');
    if (combo) {
      this.comboObserver = new IntersectionObserver(
        ([entry]) => {
          this.comboOnScreen = entry.isIntersecting;
          this.refreshVisibility();
        },
        { threshold: 0, rootMargin: `0px 0px -${COMBO_MARGIN}px 0px` }
      );
      this.comboObserver.observe(combo);
    }

    this.unsubscribeVariant = subscribe(EVENTS.variantChange, (event) => {
      const detail = event.detail || {};
      if (!detail.variant || detail.sectionId !== this.mainSectionId) return;
      this.applyVariant(detail.variant);
    });
  }

  disconnectedCallback() {
    if (this.observer) this.observer.disconnect();
    if (this.comboObserver) this.comboObserver.disconnect();
    if (this.onScroll) window.removeEventListener('scroll', this.onScroll);
    if (this.scrollFrame) {
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = 0;
    }
    if (this.submitButton) this.submitButton.removeEventListener('click', this.onClick);
    if (this.unsubscribeVariant) this.unsubscribeVariant();
    if (this.syncFrame) {
      cancelAnimationFrame(this.syncFrame);
      this.syncFrame = 0;
    }
    const root = document.documentElement;
    root.style.removeProperty(CHAT_OFFSET);
    root.style.removeProperty(PAGE_SPACE);
    root.classList.remove('lg-has-sticky-atc');
    publish(EVENTS.stickyAtcChange, { visible: false, height: 0 });
  }

  /** Mostra a barra só com o botão principal já acima da tela e o "Compre junto" fora dela. */
  refreshVisibility() {
    this.setVisible(this.buttonPassed && !this.comboOnScreen);
  }

  setVisible(visible) {
    this.hidden = !visible;
    this.syncChatOffset();
  }

  /**
   * Agenda a medição da barra para o próximo quadro. Várias chamadas seguidas (visibilidade,
   * variante, erro) viram uma só leitura de offsetHeight, depois de todas as escritas do
   * mesmo quadro, em vez de uma leitura de layout a cada chamada.
   */
  syncChatOffset() {
    if (this.syncFrame) return;
    this.syncFrame = requestAnimationFrame(() => {
      this.syncFrame = 0;
      this.applyChatOffset();
    });
  }

  /**
   * Altura atual da barra em --chat-offset (botão de atendimento) e em --sticky-atc-space
   * (folga no fim do <body>, section-sticky-atc.css), classe .lg-has-sticky-atc no <html> e
   * evento 'sticky-atc:change'; com a barra escondida, remove as variáveis e a classe.
   */
  applyChatOffset() {
    const root = document.documentElement;
    const visible = !this.hidden;
    const height = visible ? Math.round(this.offsetHeight) : 0;
    if (visible) {
      root.style.setProperty(CHAT_OFFSET, `${height}px`);
      root.style.setProperty(PAGE_SPACE, `${height}px`);
    } else {
      root.style.removeProperty(CHAT_OFFSET);
      root.style.removeProperty(PAGE_SPACE);
    }
    root.classList.toggle('lg-has-sticky-atc', visible);
    publish(EVENTS.stickyAtcChange, { visible, height });
  }

  applyVariant(variant) {
    this.variantId = String(variant.id);
    this.available = variant.available !== false;

    this.submitButton.disabled = !this.available;
    this.hideError();

    // Mesma regra do botão principal (buyLabel em global.js, snippets/produto-buy-label.liquid).
    if (this.labelElement) this.labelElement.textContent = buyLabel(variant, this.strings);

    this.updatePrice(variant);
  }

  /** Mostra o preço (escrito pelo Liquid) da variante ativa e esconde os demais. */
  updatePrice(variant) {
    const slots = Array.from(this.querySelectorAll('[data-sticky-atc-price]'));
    const id = String(variant.id);
    if (!slots.some((slot) => slot.dataset.stickyAtcPrice === id)) return;
    slots.forEach((slot) => {
      slot.hidden = slot.dataset.stickyAtcPrice !== id;
    });
    this.syncChatOffset();
  }

  async onSubmit() {
    if (!this.available || !this.variantId || this.submitButton.classList.contains('is-loading')) return;
    this.hideError();
    // Fluxo comum (cart.api.js): estado do botão, anúncios, 'cart:open' ou ida ao carrinho, erro.
    // As seções do carrinho presentes na página vêm junto (cart.api.js, pageSections).
    await runAddToCart({
      button: this.submitButton,
      request: () => add([{ id: Number.parseInt(this.variantId, 10), quantity: 1 }], { source: 'sticky-atc' }),
      messages: { error: this.strings && this.strings.addError },
      onError: (message) => this.showError(message),
      onSettled: () => {
        // Variante que ficou indisponível durante o pedido: o botão continua marcado como tal.
        if (!this.available) this.submitButton.setAttribute('aria-disabled', 'true');
      },
    });
  }

  showError(message) {
    if (!this.errorElement) return;
    this.errorElement.textContent = message || '';
    this.errorElement.hidden = false;
    this.syncChatOffset();
  }

  hideError() {
    if (!this.errorElement || this.errorElement.hidden) return;
    this.errorElement.textContent = '';
    this.errorElement.hidden = true;
    this.syncChatOffset();
  }
}

if (!customElements.get('sticky-atc')) {
  customElements.define('sticky-atc', StickyAtc);
}
