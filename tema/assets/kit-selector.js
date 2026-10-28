/**
 * Beacon Labs · <kit-selector> (kit-selector.js)
 *
 * Grade de cartões de kit (snippets/kit-card.liquid, um rádio por variante da opção "Kit"),
 * dentro de <kit-selector data-section-id="...">.
 *
 * Ao marcar um rádio:
 * 1. Mostra, dentro do mesmo <section data-main-product>, a parte da página escrita pelo Liquid
 *    para a variante ativa ([data-variant-slot="ID"]) e esconde as das outras variantes, no
 *    padrão da barra fixa (auditoria de arquitetura, 28/09/2026: as contas saíram do JS):
 *    - [data-kit-summary] (dentro do próprio elemento): "R$ X,XX por pote" (kits de 2+ potes);
 *    - [data-payment-line]: parcelamento e Pix (a linha some quando a variante ativa não tem
 *      nenhum dos dois);
 *    - [data-cashback-amount]: valor do cashback.
 *    Todas as contas (parcela e preço por pote para cima; Pix e cashback para baixo, em
 *    centavos) ficam só no Liquid: snippets/produto-payment-line.liquid,
 *    snippets/produto-kit-selector.liquid e o bloco "cashback" de sections/main-product.liquid.
 * 2. Classe kit-card--selected nos cartões (estilo de reserva para navegador sem :has()).
 * 3. Grava a variante na URL (?variant=, com history.replaceState), para o link manter o kit.
 * 4. Publica 'variant:change' (detail: { variant, sectionId, productId }), lido por
 *    <product-form> (input oculto, texto, disabled e aria-disabled do botão de compra: o botão
 *    tem um dono só), por <media-gallery> (foto da variante e selo de % OFF) e por <sticky-atc>.
 *
 * Os dados das variantes (id, title, kit, units, price, compareAtPrice, available,
 * featuredMediaId) vêm de #ProductData-<sectionId> (script type="application/json" escrito por
 * sections/main-product.liquid). Nenhum texto nem número fica fixo aqui.
 *
 * Segurança: nenhum HTML é montado aqui; só atributos hidden e classes mudam.
 */

import { readJSON, publish, EVENTS } from '@theme/global';

class KitSelector extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId || '';
    this.productData = readJSON(`ProductData-${this.sectionId}`) || {};
    this.variants = Array.isArray(this.productData.variants) ? this.productData.variants : [];
    this.main = this.closest('[data-main-product]');

    this.onChange = (event) => {
      const input = event.target;
      if (!input || input.type !== 'radio' || !this.contains(input)) return;
      this.selectVariant(input.value);
    };
    this.addEventListener('change', this.onChange);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
  }

  findVariant(variantId) {
    const id = Number.parseInt(variantId, 10);
    return this.variants.find((entry) => entry.id === id) || null;
  }

  selectVariant(variantId) {
    const variant = this.findVariant(variantId);
    if (!variant) return;

    this.updateCards(variant);
    this.updateSlots(variant);
    this.updateUrl(variant);

    publish(EVENTS.variantChange, {
      variant,
      sectionId: this.sectionId,
      productId: this.productData.productId,
    });
  }

  /**
   * Grava a variante escolhida em ?variant= (a página já abre nela: snippets/produto-initial-
   * variant.liquid lê product.selected_variant). Assim recarregar, compartilhar o link ou voltar
   * à página mantém o kit. replaceState, e não pushState: trocar de kit não cria uma entrada no
   * histórico. Só o seletor da seção principal ([data-main-product]) mexe na URL.
   */
  updateUrl(variant) {
    if (!this.main) return;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', String(variant.id));
    window.history.replaceState(window.history.state, '', url.toString());
  }

  /** Classe kit-card--selected (reserva de estilo para navegador sem :has(), ver component-kit-card.css). */
  updateCards(variant) {
    this.querySelectorAll('[data-kit-card]').forEach((card) => {
      const input = card.querySelector('input[type="radio"]');
      card.classList.toggle('kit-card--selected', !!input && input.value === String(variant.id));
    });
  }

  /** Mostra só as partes ([data-variant-slot]) da variante ativa; a linha de pagamento vazia some. */
  updateSlots(variant) {
    const root = this.main || this;
    const id = String(variant.id);
    root.querySelectorAll('[data-variant-slot]').forEach((slot) => {
      slot.hidden = slot.dataset.variantSlot !== id;
    });
    root.querySelectorAll('[data-payment-line]').forEach((line) => {
      line.hidden = !Array.from(line.querySelectorAll('[data-variant-slot]')).some((slot) => slot.dataset.variantSlot === id);
    });
  }
}

if (!customElements.get('kit-selector')) {
  customElements.define('kit-selector', KitSelector);
}
