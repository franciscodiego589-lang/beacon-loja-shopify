/**
 * Beacon Labs · cart-troca-kit.js
 *
 * Troca uma linha do carrinho pela variante de kit maior (snippets/cart-troca-kit.liquid).
 * Clique em [data-troca-kit]: tira a linha atual (sem publicar nem pedir seções) e adiciona o kit
 * na mesma quantidade; a adição publica 'cart:updated' com as seções, e a gaveta e a página do
 * carrinho se redesenham sozinhas (cart.api.js). Se a adição falhar, a variante anterior volta.
 * Sem JavaScript, o link abre o produto já na variante do kit.
 */
import { add, change } from '@theme/cart-api';
import { getString } from '@theme/global';

document.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-troca-kit]');
  if (!link) return;
  event.preventDefault();
  if (link.getAttribute('aria-busy') === 'true') return;

  const { key, variante, varianteAtual, qtd } = link.dataset;
  const quantidade = Number.parseInt(qtd, 10) || 1;
  const erro = link.parentElement.querySelector('.cart-troca-kit__erro');
  link.setAttribute('aria-busy', 'true');
  if (erro) erro.hidden = true;

  try {
    await change(key, 0, { publish: false, sections: [] });
    try {
      await add([{ id: Number(variante), quantity: quantidade }], { source: 'troca-kit' });
    } catch (falha) {
      await add([{ id: Number(varianteAtual), quantity: quantidade }], { source: 'troca-kit' });
      throw falha;
    }
  } catch (falha) {
    link.removeAttribute('aria-busy');
    if (erro) {
      erro.textContent = (falha && falha.message) || getString('updateError') || '';
      erro.hidden = false;
    }
  }
});
