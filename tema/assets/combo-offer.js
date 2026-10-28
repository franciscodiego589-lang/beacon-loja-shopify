/**
 * Beacon Labs · <combo-offer> (combo-offer.js)
 *
 * Oferta "Compre junto" (sections/main-product.liquid, bloco "combo_oferta"). A lista
 * ([data-combo-list]) começa com o produto da página (snippets/produto-combo-item.liquid,
 * is_current) e os produtos do metafield beacon.combo; sem beacon.combo e com
 * data-use-complementary="true", busca produtos complementares pela Product Recommendations
 * API (recommendations.api.js), na seção técnica indicada em data-recommendations-section
 * (sections/product-combo-recommendations.liquid). Sem nenhum resultado, o bloco continua
 * escondido (hidden): nada é inventado.
 *
 * Cada item é uma caixa de seleção; itens com mais de uma variante têm um <select>
 * ([data-combo-variant]) cujas <option> trazem data-price/data-compare-at-price/data-available.
 * Ao marcar/desmarcar ou trocar a variante, o botão final soma os itens marcados
 * (strings "addOne"/"addMany"/"selectOne" de [data-combo-config], nunca texto fixo) e a nota
 * de frete grátis aparece quando a soma dos itens marcados atinge data-threshold (centavos;
 * 0 desativa). "Adicionar" chama cart.api.js add() com um item por linha marcada, numa
 * única requisição; com carrinho em gaveta publica 'cart:open', com carrinho em página vai
 * para o carrinho. O Liquid já escreve o texto inicial do botão com a soma dos itens marcados.
 *
 * Segurança: HTML só entra por [data-combo-recommendations-loaded], vindo da própria Section
 * Rendering API da Shopify (parseHTML). Nenhum texto de usuário vira HTML.
 */

import { readJSON, formatMoney, interpolate, keepTogether, floorDivide } from '@theme/global';
import { add, runAddToCart } from '@theme/cart-api';
import { getRecommendationsNode } from '@theme/recommendations-api';

class ComboOffer extends HTMLElement {
  connectedCallback() {
    this.strings = readJSON(this.querySelector('[data-combo-config]'))?.strings || {};
    this.list = this.querySelector('[data-combo-list]');
    this.submitButton = this.querySelector('[data-combo-submit]');
    this.errorElement = this.querySelector('[data-combo-error]');

    this.onChange = (event) => {
      const checkbox = event.target.closest('[data-combo-check]');
      if (checkbox && this.contains(checkbox)) {
        this.updateSummary();
        return;
      }
      const select = event.target.closest('[data-combo-variant]');
      if (select && this.contains(select)) this.onSelectChange(select);
    };
    this.addEventListener('change', this.onChange);

    this.onClick = (event) => {
      if (event.target.closest('[data-combo-submit]')) this.onSubmit();
    };
    this.addEventListener('click', this.onClick);

    if (this.hasAttribute('hidden') && this.dataset.useComplementary === 'true') {
      this.loadComplementary();
    } else {
      this.updateSummary();
    }
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('click', this.onClick);
  }

  getItems() {
    return Array.from(this.querySelectorAll('[data-combo-item]'));
  }

  onSelectChange(select) {
    const li = select.closest('[data-combo-item]');
    const option = select.selectedOptions && select.selectedOptions[0];
    if (!li || !option) return;
    this.applyVariant(li, {
      variantId: option.value,
      price: Number.parseInt(option.dataset.price, 10) || 0,
      compareAtPrice: Number.parseInt(option.dataset.compareAtPrice, 10) || 0,
      available: option.dataset.available === 'true',
    });
    this.updateSummary();
  }

  applyVariant(li, variant) {
    li.dataset.variantId = String(variant.variantId);
    li.dataset.price = String(variant.price);
    li.dataset.compareAtPrice = String(variant.compareAtPrice);
    li.dataset.available = String(variant.available);

    const checkbox = li.querySelector('[data-combo-check]');
    if (checkbox) {
      checkbox.disabled = !variant.available;
      if (!variant.available) checkbox.checked = false;
    }

    const onSale = variant.compareAtPrice > variant.price;

    const discountBadge = li.querySelector('[data-combo-discount]');
    if (discountBadge) {
      if (onSale && this.strings.discount) {
        const percent = floorDivide((variant.compareAtPrice - variant.price) * 100, variant.compareAtPrice);
        discountBadge.textContent = interpolate(this.strings.discount, { percent });
      }
      discountBadge.hidden = !onSale;
    }

    const compareWrap = li.querySelector('[data-combo-compare-wrap]');
    if (compareWrap) compareWrap.hidden = !onSale;

    // "Preço promocional" (só para leitor de tela) acompanha o preço riscado.
    const saleLabel = li.querySelector('[data-combo-sale-label]');
    if (saleLabel) saleLabel.hidden = !onSale;

    const compareEl = li.querySelector('[data-combo-compare]');
    if (compareEl) compareEl.textContent = formatMoney(variant.compareAtPrice);

    const priceEl = li.querySelector('[data-combo-price]');
    if (priceEl) priceEl.textContent = formatMoney(variant.price);
  }

  updateSummary() {
    let total = 0;
    let count = 0;
    this.getItems().forEach((li) => {
      const checkbox = li.querySelector('[data-combo-check]');
      if (checkbox && checkbox.checked && !checkbox.disabled) {
        count += 1;
        total += Number.parseInt(li.dataset.price, 10) || 0;
      }
    });

    const label = this.querySelector('[data-combo-submit-label]');
    if (label) {
      if (count === 0) {
        label.textContent = this.strings.selectOne || '';
      } else if (count === 1) {
        label.textContent = interpolate(this.strings.addOne, { total: keepTogether(formatMoney(total)) });
      } else {
        label.textContent = interpolate(this.strings.addMany, { quantidade: count, total: keepTogether(formatMoney(total)) });
      }
    }
    if (this.submitButton) this.submitButton.disabled = count === 0;

    const shipping = this.querySelector('[data-combo-shipping]');
    if (shipping) {
      const threshold = Number.parseInt(this.dataset.threshold, 10) || 0;
      shipping.hidden = !(threshold > 0 && total >= threshold);
    }
  }

  async loadComplementary() {
    const sectionId = this.dataset.recommendationsSection;
    const productId = this.dataset.productId;
    if (!sectionId || !productId || !this.list) {
      this.updateSummary();
      return;
    }

    const loaded = await getRecommendationsNode(productId, '[data-combo-recommendations-loaded]', {
      sectionId,
      limit: Number.parseInt(this.dataset.maxItems, 10) || 2,
      intent: 'complementary',
    });
    if (!loaded || loaded.children.length === 0) {
      // Nada encontrado: o bloco continua escondido, sem inventar item.
      return;
    }

    Array.from(loaded.children).forEach((child) => {
      this.list.appendChild(child);
    });

    this.removeAttribute('hidden');
    this.updateSummary();
  }

  async onSubmit() {
    if (!this.submitButton || this.submitButton.disabled || this.submitButton.classList.contains('is-loading')) return;

    const items = [];
    this.getItems().forEach((li) => {
      const checkbox = li.querySelector('[data-combo-check]');
      if (!checkbox || !checkbox.checked || checkbox.disabled) return;
      const variantId = Number.parseInt(li.dataset.variantId, 10);
      if (variantId > 0) items.push({ id: variantId, quantity: 1 });
    });
    if (items.length === 0) return;

    this.hideError();
    // Fluxo comum (cart.api.js): estado do botão (aria-disabled, não disabled, para não perder o
    // foco do teclado), anúncios, 'cart:open' ou ida ao carrinho em página, erro. As seções do
    // carrinho presentes na página vêm junto (pageSections).
    await runAddToCart({
      button: this.submitButton,
      request: () => add(items, { source: 'combo-offer' }),
      messages: { added: this.strings.added, error: this.strings && this.strings.error },
      onError: (message) => this.showError(message),
      onSettled: () => this.updateSummary(),
    });
  }

  showError(message) {
    if (!this.errorElement) return;
    this.errorElement.textContent = message || '';
    this.errorElement.hidden = false;
  }

  hideError() {
    if (!this.errorElement) return;
    this.errorElement.textContent = '';
    this.errorElement.hidden = true;
  }
}

if (!customElements.get('combo-offer')) {
  customElements.define('combo-offer', ComboOffer);
}
