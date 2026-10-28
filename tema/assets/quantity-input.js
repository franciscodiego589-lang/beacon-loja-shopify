/**
 * Beacon Labs · <quantity-input> (quantity-input.js)
 *
 * Estrutura (snippets/cart-drawer.liquid e página de produto):
 *   <quantity-input> [data-quantity-step="-1"] <input class="quantity-input__field"> [data-quantity-step="1"]
 * - Os botões somam ou subtraem o step do campo, respeitando min e max.
 * - Ao mudar, dispara 'change' (com bubbles) no campo: quem ouve (cart-items, formulário de
 *   produto) decide o que fazer.
 * - Botão no limite recebe aria-disabled="true" (continua focável, sem efeito).
 */

class QuantityInput extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input');
    if (!this.input) return;
    this.buttons = Array.from(this.querySelectorAll('[data-quantity-step]'));
    this.onClick = (event) => {
      const button = event.target.closest('[data-quantity-step]');
      if (!button || !this.contains(button)) return;
      event.preventDefault();
      if (button.getAttribute('aria-disabled') === 'true') return;
      this.step(Number.parseInt(button.dataset.quantityStep, 10) || 0);
    };
    this.onInputChange = () => this.updateButtons();
    // Enter no campo só confirma a quantidade (o 'change' sai no blur). Sem isto, o envio implícito do
    // formulário do carrinho levava a pessoa ao checkout sem ela ter pedido (06/10/2026).
    this.onKeydown = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.input.blur();
    };
    this.addEventListener('click', this.onClick);
    this.input.addEventListener('keydown', this.onKeydown);
    this.input.addEventListener('change', this.onInputChange);
    this.input.addEventListener('input', this.onInputChange);
    this.updateButtons();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.input?.removeEventListener('keydown', this.onKeydown);
    this.input?.removeEventListener('change', this.onInputChange);
    this.input?.removeEventListener('input', this.onInputChange);
  }

  get min() {
    const value = Number.parseInt(this.input.min, 10);
    return Number.isFinite(value) ? value : 0;
  }

  get max() {
    const value = Number.parseInt(this.input.max, 10);
    return Number.isFinite(value) ? value : Infinity;
  }

  get stepSize() {
    const value = Number.parseInt(this.input.step, 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  get value() {
    const value = Number.parseInt(this.input.value, 10);
    return Number.isFinite(value) ? value : this.min;
  }

  step(direction) {
    const previous = this.value;
    const next = Math.min(this.max, Math.max(this.min, previous + direction * this.stepSize));
    if (next === previous) return;
    this.input.value = String(next);
    this.updateButtons();
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  updateButtons() {
    const value = this.value;
    this.buttons.forEach((button) => {
      const direction = Number.parseInt(button.dataset.quantityStep, 10) || 0;
      const atLimit = direction < 0 ? value <= this.min : value >= this.max;
      if (atLimit) {
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.removeAttribute('aria-disabled');
      }
    });
  }
}

if (!customElements.get('quantity-input')) {
  customElements.define('quantity-input', QuantityInput);
}
