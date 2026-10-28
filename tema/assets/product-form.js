/**
 * Beacon Labs · <product-form> (product-form.js)
 *
 * Envolve qualquer formulário de produto ({% form 'product' %}): card de produto, sugestões
 * do carrinho, página de produto, barra fixa.
 * Estrutura esperada:
 *   <product-form data-section-id="...">
 *     <form> input[name="id"], input[name="quantity"], [data-product-form-submit],
 *            p[data-product-form-error][hidden][role="alert"]
 * Comportamento:
 * - Carrinho em gaveta: envia pelo cart.api.js (addFormData), que pede junto (bundled section
 *   rendering) as seções do carrinho presentes na página (pageSections: a gaveta e, na /cart,
 *   as seções da página), e publica 'cart:open'. O próprio cart.api.js publica 'cart:updated'
 *   com detail.cart e detail.sections.
 * - Carrinho em página: não intercepta; o formulário vai para /cart/add e a Shopify leva a /cart.
 * - Erro: texto em [data-product-form-error] por textContent.
 * - 'variant:change' (detail.variant): atualiza o input[name="id"] oculto e o botão, que tem um
 *   dono só (este componente): texto ([data-buy-label], pela regra buyLabel de global.js, com os
 *   textos de #ProductData-<sectionId>), disabled e aria-disabled.
 *   Só reage quando o detail traz sectionId igual ao data-section-id, para os cards de produto
 *   da mesma página não trocarem de variante.
 *   Contrato conferido em 27/09/2026: o único publicador é kit-selector.js, com detail
 *   { variant, sectionId, productId }, e o <product-form> de sections/main-product.liquid tem
 *   data-section-id igual ao data-section-id do <kit-selector> (os dois recebem section.id).
 */

import { getConfig, getString, subscribe, EVENTS, readJSON, buyLabel } from '@theme/global';
import { addFormData, runAddToCart } from '@theme/cart-api';

class ProductForm extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    if (!this.form) return;
    this.submitButton = this.form.querySelector('[data-product-form-submit]') || this.form.querySelector('[type="submit"]');
    this.errorElement = this.querySelector('[data-product-form-error]');
    this.unavailable = !!this.submitButton && this.submitButton.getAttribute('aria-disabled') === 'true';

    this.onSubmit = (event) => this.handleSubmit(event);
    this.form.addEventListener('submit', this.onSubmit);
    this.unsubscribeVariant = subscribe(EVENTS.variantChange, (event) => this.onVariantChange(event));
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.onSubmit);
    if (this.unsubscribeVariant) this.unsubscribeVariant();
  }

  async handleSubmit(event) {
    if (getConfig().cartType !== 'drawer') return;
    event.preventDefault();
    if (!this.submitButton || this.submitButton.getAttribute('aria-disabled') === 'true') return;

    this.hideError();
    // Fluxo comum (cart.api.js): estado do botão, anúncios, 'cart:open' e erro.
    await runAddToCart({
      button: this.submitButton,
      request: () => addFormData(new FormData(this.form), { source: 'product-form' }),
      onError: (message) => this.showError(message),
      onSettled: () => this.setUnavailable(this.unavailable),
    });
  }

  onVariantChange(event) {
    const detail = (event && event.detail) || {};
    const variant = detail.variant;
    // Cards de produto não devem reagir à troca de variante da página: só o formulário da
    // seção indicada pelo evento (mesmo data-section-id).
    const sameSection = detail.sectionId && this.dataset.sectionId && String(detail.sectionId) === this.dataset.sectionId;
    if (!sameSection) return;

    const idInput = this.form.querySelector('input[type="hidden"][name="id"]');
    if (variant && idInput) idInput.value = String(variant.id);
    this.hideError();
    const unavailable = !variant || variant.available === false;
    this.setUnavailable(unavailable);
    if (this.submitButton) this.submitButton.disabled = unavailable;
    const label = this.querySelector('[data-buy-label]');
    if (label && variant) label.textContent = buyLabel(variant, this.buyStrings);
  }

  /** Textos do botão (addKit, add, soldOut) do #ProductData da seção, lidos uma vez. */
  get buyStrings() {
    if (!this.cachedBuyStrings) {
      const data = this.dataset.sectionId ? readJSON(`ProductData-${this.dataset.sectionId}`) : null;
      this.cachedBuyStrings = (data && data.strings) || {};
    }
    return this.cachedBuyStrings;
  }

  setUnavailable(unavailable) {
    this.unavailable = unavailable;
    if (!this.submitButton) return;
    if (unavailable) {
      this.submitButton.setAttribute('aria-disabled', 'true');
    } else if (!this.submitButton.classList.contains('is-loading')) {
      this.submitButton.removeAttribute('aria-disabled');
    }
  }

  showError(message) {
    if (!this.errorElement) return;
    this.errorElement.textContent = message || getString('addError');
    this.errorElement.hidden = false;
  }

  hideError() {
    if (!this.errorElement) return;
    this.errorElement.textContent = '';
    this.errorElement.hidden = true;
  }
}

if (!customElements.get('product-form')) {
  customElements.define('product-form', ProductForm);
}
