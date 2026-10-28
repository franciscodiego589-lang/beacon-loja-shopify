/**
 * Beacon Labs · <cart-items> (cart-items.js)
 *
 * Lista de itens do carrinho (gaveta e, se a área do carrinho quiser, a página /cart).
 * Estrutura (snippets/cart-drawer.liquid):
 *   <cart-items data-cart-items>
 *     li.cart-item[data-line][data-key][data-cart-item]
 *       <quantity-input> input.quantity-input__field[data-line][data-key]
 *       button[data-cart-remove="LINHA"]
 *       p[data-cart-item-error][hidden]
 * Comportamento:
 * - Mudança de quantidade (botões ou digitação, com espera de 400 ms) e remoção vão para o
 *   cart.api.js (change), identificando a linha pela chave do item (data-key), que não muda
 *   quando outra linha é removida. O cart.api.js pede junto as seções do carrinho presentes
 *   na página (pageSections: a gaveta e, na /cart, as seções da página) e publica
 *   'cart:updated'; quem redesenha é o dono de cada vista (cart-drawer.js na gaveta,
 *   cart-page.js na página /cart).
 * - Enquanto atualiza, a linha recebe aria-busy="true" e a classe is-loading.
 * - Erro: texto na própria linha, por textContent, e a quantidade volta ao valor anterior.
 * - Se a Shopify limitar a quantidade (estoque), a linha mostra o aviso de erro de atualização
 *   (procurado pela chave depois do redesenho).
 * - Campo apagado ou com texto volta ao último valor aceito: só o 0 digitado ou o botão de
 *   remover tiram o item.
 * - Nenhum clique se perde com a rede lenta: pedido feito com a linha ocupada entra na fila e
 *   sai quando a anterior termina; edição ainda na espera quando a lista é redesenhada passa
 *   para a linha nova (mesma chave), a não ser que a linha nova já tenha recebido uma edição
 *   mais recente (ela vence).
 */

import { debounce, getString, announce } from '@theme/global';
import { change } from '@theme/cart-api';

const FIELD_SELECTOR = '.quantity-input__field, [name="updates[]"]';

class CartItems extends HTMLElement {
  connectedCallback() {
    this.pending = new Map();
    this.queued = new Map();
    this.dirty = new Map();
    // Contêiner que não é trocado no redesenho: a gaveta ou o wrapper da seção da página.
    this.host = this.closest('cart-drawer, .shopify-section') || document;
    this.onChange = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches(FIELD_SELECTOR)) return;
      this.scheduleUpdate(input);
    };
    this.onClick = (event) => {
      const button = event.target.closest('[data-cart-remove]');
      if (!button || !this.contains(button)) return;
      event.preventDefault();
      const item = button.closest('[data-cart-item]');
      this.updateLine(item, 0);
    };
    this.addEventListener('change', this.onChange);
    this.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('click', this.onClick);
    this.pending.forEach((fn) => fn.cancel && fn.cancel());
    // Edições que ainda esperavam os 400 ms: passam para a linha nova com a mesma chave.
    const carried = Array.from(this.dirty, ([key, input]) => [key, String(input.value).trim()]);
    this.dirty.clear();
    const host = this.host;
    if (carried.length === 0 || !host) return;
    setTimeout(() => {
      carried.forEach(([key, value]) => {
        if (!/^\d+$/.test(value)) return;
        const item = host.querySelector(`[data-cart-item][data-key="${CSS.escape(key)}"]`);
        const field = item ? item.querySelector(FIELD_SELECTOR) : null;
        if (!field || field.defaultValue === value) return;
        // Edição feita na linha nova depois do redesenho (ex.: o 0 digitado, com a máquina
        // lenta) é mais recente que a repassada: ela vence e a antiga é descartada.
        const owner = field.closest('cart-items');
        if (owner && owner.dirty instanceof Map && owner.dirty.has(key)) return;
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, 0);
  }

  scheduleUpdate(input) {
    const item = input.closest('[data-cart-item]');
    if (!item) return;
    const key = item.dataset.key || item.dataset.line;
    if (item.dataset.key) this.dirty.set(item.dataset.key, input);
    if (!this.pending.has(key)) {
      this.pending.set(
        key,
        debounce((target) => {
          const targetItem = target.closest('[data-cart-item]');
          if (targetItem && targetItem.dataset.key) this.dirty.delete(targetItem.dataset.key);
          const raw = String(target.value).trim();
          // Campo apagado ou com texto não é "0": volta ao último valor aceito, sem remover a linha.
          // Só o 0 digitado (ou o botão de remover) tira o item.
          if (!/^\d+$/.test(raw)) {
            target.value = target.defaultValue;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          this.updateLine(target.closest('[data-cart-item]'), Number.parseInt(raw, 10));
        }, 400)
      );
    }
    this.pending.get(key)(input);
  }

  async updateLine(item, quantity) {
    if (!item) return;
    if (item.getAttribute('aria-busy') === 'true') {
      // A linha ainda está atualizando: guarda o pedido mais recente e manda quando terminar.
      if (item.dataset.key) this.queued.set(item.dataset.key, quantity);
      return;
    }
    const key = item.dataset.key;
    const line = item.dataset.line;
    const input = item.querySelector(FIELD_SELECTOR);
    const previous = input ? input.defaultValue : '';
    // A resposta redesenha a lista (gaveta ou página) antes de change() terminar: o item novo é
    // procurado pela chave dentro do contêiner que não é trocado (a gaveta ou o wrapper da seção).
    const host = this.host || document;

    this.clearError(item);
    item.setAttribute('aria-busy', 'true');
    item.classList.add('is-loading');

    try {
      const { cart } = await change(key || line, quantity, { source: 'cart-items' });
      if (cart && typeof cart.item_count === 'number') {
        announce(getString(cart.item_count === 1 ? 'cartLabelOne' : 'cartLabelOther', { count: cart.item_count }));
      }
      // A Shopify pode limitar a quantidade ao estoque: avisa quando o valor pedido não foi aceito.
      if (quantity > 0 && cart && Array.isArray(cart.items)) {
        const updated = cart.items.find((cartItem) => cartItem.key === key);
        if (updated && updated.quantity !== quantity) {
          const target = item.isConnected ? item : key ? host.querySelector(`[data-cart-item][data-key="${CSS.escape(key)}"]`) : null;
          if (target) {
            const targetInput = target.querySelector(FIELD_SELECTOR);
            if (targetInput) targetInput.value = String(updated.quantity);
            this.showError(target, getString('updateError'));
          }
        }
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (input && item.isConnected) input.value = previous;
      this.showError(item, getString('updateError'));
    } finally {
      if (item.isConnected) {
        item.removeAttribute('aria-busy');
        item.classList.remove('is-loading');
      }
      if (key && this.queued.has(key)) {
        const next = this.queued.get(key);
        this.queued.delete(key);
        const target = item.isConnected ? item : host.querySelector(`[data-cart-item][data-key="${CSS.escape(key)}"]`);
        const owner = target ? target.closest('cart-items') : null;
        if (target && owner && typeof owner.updateLine === 'function') {
          const targetInput = target.querySelector(FIELD_SELECTOR);
          if (targetInput) targetInput.value = String(next);
          owner.updateLine(target, next);
        }
      }
    }
  }

  showError(item, message) {
    const error = item.querySelector('[data-cart-item-error]');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  clearError(item) {
    const error = item.querySelector('[data-cart-item-error]');
    if (!error) return;
    error.textContent = '';
    error.hidden = true;
  }
}

if (!customElements.get('cart-items')) {
  customElements.define('cart-items', CartItems);
}
