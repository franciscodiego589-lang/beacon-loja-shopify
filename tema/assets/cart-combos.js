/**
 * Beacon Labs · cart-combos.js
 *
 * Botão "Adicionar o combo" dos cards de snippets/cart-combos.liquid: põe no carrinho, de uma vez,
 * os potes avulsos que faltam (ids em data-combo-adicionar, separados por vírgula). A adição publica
 * 'cart:updated' com as seções (cart.api.js), e a gaveta e a página do carrinho se redesenham.
 */
import { add } from '@theme/cart-api';
import { getString } from '@theme/global';

document.addEventListener('click', async (event) => {
  const botao = event.target.closest('[data-combo-adicionar]');
  if (!botao || botao.getAttribute('aria-busy') === 'true') return;
  const ids = botao.dataset.comboAdicionar.split(',').map((id) => Number(id)).filter(Boolean);
  if (ids.length === 0) return;
  const erro = botao.parentElement.querySelector('.cart-combo__erro');
  botao.setAttribute('aria-busy', 'true');
  if (erro) erro.hidden = true;
  try {
    await add(ids.map((id) => ({ id, quantity: 1 })), { source: 'combo' });
  } catch (falha) {
    botao.removeAttribute('aria-busy');
    if (erro) {
      erro.textContent = (falha && falha.message) || getString('addError') || '';
      erro.hidden = false;
    }
  }
});
