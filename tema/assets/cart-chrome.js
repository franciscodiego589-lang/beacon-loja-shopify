/**
 * Beacon Labs · cart-chrome.js (cromo do carrinho)
 *
 * Carregado por layout/theme.liquid em todas as páginas. Escuta 'cart:updated' (publicado pelo
 * cart.api.js depois de toda mudança) e atualiza o que mostra o carrinho fora das vistas dele
 * (gaveta e página /cart, que se redesenham sozinhas):
 * - o contador da sacola ([data-cart-count]) e o rótulo do link do carrinho (#HeaderCart e
 *   [data-cart-label]);
 * - todas as barras de frete grátis ([data-free-shipping-bar], snippets/free-shipping-bar.liquid),
 *   com a mesma conta do Liquid;
 * - a troca mensagens/progresso da barra de anúncio ([data-announcement-bar],
 *   sections/announcement-bar.liquid).
 *
 * Auditoria de arquitetura (28/09/2026): antes este código ficava no fim de global.js e rodava
 * como efeito colateral de qualquer import dos utilitários, com uma guarda em window para não
 * assinar o evento duas vezes. Como módulo próprio, carregado uma vez pelo layout, a guarda
 * deixou de ser necessária e global.js ficou só com funções.
 *
 * Segurança: textos por textContent e nós de texto; ícones de createIcon (global.js).
 */

import { getString, formatMoney, createIcon, subscribe, EVENTS } from '@theme/global';

/** Atualiza uma barra de frete grátis com o total do carrinho (centavos). */
function updateFreeShippingBar(bar, cart) {
  if (!bar || !cart) return;
  const threshold = Number.parseInt(bar.dataset.threshold, 10);
  if (!(threshold > 0)) return;
  const total = Math.max(0, Number.parseInt(cart.total_price, 10) || 0);
  const remaining = Math.max(0, threshold - total);
  // Mesma conta do Liquid: divisão inteira, limitada a 100.
  const percent = Math.min(100, Math.floor((total * 100) / threshold));

  bar.dataset.total = String(total);
  bar.classList.toggle('free-shipping-bar--done', remaining === 0);

  const text = bar.querySelector('[data-free-shipping-text]');
  if (text) {
    const message =
      remaining === 0
        ? getString('freeShippingUnlocked')
        : getString('freeShippingRemaining', { amount: formatMoney(remaining) });
    if (message) {
      text.replaceChildren(
        createIcon(remaining === 0 ? 'check-circle' : 'truck', 16, 'free-shipping-bar__icon'),
        document.createTextNode(` ${message}`)
      );
    }
  }

  const track = bar.querySelector('[data-free-shipping-track]');
  if (track) track.setAttribute('aria-valuenow', String(percent));
  const fill = bar.querySelector('[data-free-shipping-fill]');
  // Progresso em --fs-progress (0 a 100): o CSS move o preenchimento por transform.
  if (fill) fill.style.setProperty('--fs-progress', String(percent));
}

/** Barra de anúncio com frete grátis: mensagens com o carrinho vazio, progresso com itens. */
function updateAnnouncementBars(itemCount) {
  document.querySelectorAll('[data-announcement-bar]').forEach((bar) => {
    if (bar.dataset.showFreeShipping !== 'true') return;
    const messages = bar.querySelector('[data-announcement-messages]');
    const freeShipping = bar.querySelector('[data-free-shipping-bar]');
    if (!messages || !freeShipping) return;
    const showProgress = itemCount > 0;
    messages.hidden = showProgress;
    freeShipping.hidden = !showProgress;
  });
}

function updateCartChrome(cart) {
  if (!cart || typeof cart.item_count !== 'number') return;
  const count = cart.item_count;

  document.querySelectorAll('[data-cart-count]').forEach((element) => {
    element.textContent = String(count);
    element.hidden = count === 0;
  });

  const label = getString(count === 1 ? 'cartLabelOne' : 'cartLabelOther', { count });
  if (label) {
    document.querySelectorAll('#HeaderCart, [data-cart-label]').forEach((element) => {
      element.setAttribute('aria-label', label);
    });
  }

  document.querySelectorAll('[data-free-shipping-bar]').forEach((bar) => updateFreeShippingBar(bar, cart));
  updateAnnouncementBars(count);
}

subscribe(EVENTS.cartUpdated, (event) => updateCartChrome(event.detail && event.detail.cart));
