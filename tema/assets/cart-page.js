/**
 * Beacon Labs · cart-page.js (página /cart, área busca-carrinho)
 *
 * A página do carrinho (templates/cart.json) não tem <cart-drawer> em volta das seções, então
 * nada troca o HTML de main-cart-items, main-cart-footer e cart-empty depois de uma mudança
 * feita por <cart-items> (fundação, assets/cart-items.js: passo a passo de quantidade e o
 * botão de remover). Este arquivo fecha esse gancho: [data-cart-page-section="{{ section.id }}"],
 * presente nas três seções.
 *
 * Ids das seções: numa página com template JSON, cada seção tem id dinâmico
 * (ex.: template--123__cart-items). A Section Rendering API só devolve a seção configurada
 * quando recebe esse id; pela chave do template ("cart-items") ela devolve null, e pelo nome
 * do arquivo ela renderiza a seção estática com os ajustes padrão (shopify.dev, "Use the
 * Section Rendering API for dynamic updates" e "Section Rendering API", consultados em
 * 27/09/2026). Por isso os ids são lidos do próprio HTML, nunca escritos à mão.
 *
 * Como funciona:
 * - Toda mudança feita por assets/cart.api.js (add, addFormData, change) já pede, pela Section
 *   Rendering API embutida, as seções do carrinho presentes na página (pageSections: a gaveta,
 *   quando existe, e os ids de todos os [data-cart-page-section]). Vale para a lista da página,
 *   para a gaveta aberta na própria /cart e para o "Adicionar" da busca e das sugestões.
 * - No evento 'cart:updated', pega detail.sections (já veio na resposta; sem repetir pedido) e
 *   troca cada [data-cart-page-section="ID"] pelo nó equivalente do HTML novo. Como o nó
 *   trocado é a seção inteira, o atributo hidden (calculado no Liquid a partir de
 *   cart.item_count) vem certo: item_count 0 esconde itens e resumo e mostra o carrinho vazio;
 *   caso contrário é o oposto.
 * - Se o evento traz detail.cart mas nenhuma seção da página (quem publicou pediu outras
 *   seções), pede as seções da página pela Section Rendering API, no contexto da URL do
 *   carrinho (routes.cart: o id dinâmico só existe no template que renderiza aquela URL), e
 *   troca do mesmo jeito. Assim os campos updates[] nunca ficam velhos e o botão "Atualizar
 *   carrinho" não desfaz uma mudança feita em outra vista. Resposta de um pedido antigo, que
 *   chega depois de um evento mais novo, é descartada (contador renderToken).
 * - Foco: volta ao mesmo controle do mesmo item (chave data-key: botão +, botão -, campo ou
 *   remover). Se o item saiu, vai para o remover do item que ficou no lugar; se não sobrou
 *   item, para o título da seção que ficou visível (carrinho vazio).
 * - Nota do pedido ([data-cart-note]): o texto digitado e a caixa aberta são mantidos quando a
 *   seção é trocada, e a nota é gravada no carrinho (cart.api.js, updateNote) 600 ms depois da
 *   última digitação, para valer também quando o cliente finaliza pela gaveta.
 *
 * O contador do carrinho, a barra de frete grátis e a barra de anúncio já são atualizados à
 * parte por assets/cart-chrome.js (carregado pelo layout), em qualquer página.
 *
 * Segurança: só entra HTML vindo do próprio evento 'cart:updated' (resposta da Ajax Cart API/
 * Section Rendering API da Shopify), nunca texto de usuário; o parsing é feito com
 * parseHTML (DOMParser), nunca innerHTML/insertAdjacentHTML. A nota vai como dado (JSON) e o
 * valor digitado volta ao campo por .value.
 */

import { getConfig, subscribe, EVENTS, parseHTML, debounce, captureItemFocus, itemFocusTarget } from '@theme/global';
import { updateNote, renderSections, cartPageSectionIds } from '@theme/cart-api';

const SECTION_ATTRIBUTE = 'data-cart-page-section';
const VISIBLE_HEADING_SELECTOR = '.main-cart-items__title, .cart-empty__title';

const selectorFor = (id) => `[${SECTION_ATTRIBUTE}="${CSS.escape(id)}"]`;

function focusVisibleHeading() {
  const heading = Array.from(document.querySelectorAll(VISIBLE_HEADING_SELECTOR)).find(
    (element) => !element.closest('[hidden]')
  );
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: false });
}

const pageItems = () => Array.from(document.querySelectorAll('.main-cart-items [data-cart-item]'));

/** Retrato do foco (global.js, o mesmo da gaveta); fora de uma linha, null. */
function describeFocus(active) {
  return captureItemFocus(active, pageItems());
}

function restoreFocus(focus) {
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected && !active.closest('[hidden]')) return;
  // Mesmo controle da mesma linha; se a linha saiu, o remover da que ficou no lugar; sem linha
  // visível, o título da seção que ficou visível.
  const target = itemFocusTarget(focus, pageItems().filter((item) => !item.closest('[hidden]')));
  if (target) {
    target.focus({ preventScroll: true });
  } else {
    focusVisibleHeading();
  }
}

function swapSection(id, html) {
  const current = document.querySelector(selectorFor(id));
  if (!current || !html) return false;

  const doc = parseHTML(html);
  const next = doc.querySelector(selectorFor(id));
  if (!next) return false;

  // Nota do pedido: o que o cliente digitou (e a caixa aberta) vale mais que o HTML do servidor.
  const currentNote = current.querySelector('[data-cart-note]');
  const noteValue = currentNote ? currentNote.value : null;
  const noteOpen = currentNote ? !!currentNote.closest('details[open]') : false;

  const imported = document.importNode(next, true);
  current.replaceWith(imported);

  const nextNote = imported.querySelector('[data-cart-note]');
  if (nextNote && noteValue !== null) {
    nextNote.value = noteValue;
    const details = nextNote.closest('details');
    if (details && noteOpen) details.open = true;
  }
  return true;
}

let renderToken = 0;

async function refresh(detail) {
  const token = ++renderToken;
  let sections = (detail && detail.sections) || {};
  let ids = cartPageSectionIds().filter((id) => sections[id]);
  if (ids.length === 0) {
    // Mudança feita por quem não pediu as seções da página: pede agora, no contexto da /cart.
    if (!detail || !detail.cart) return;
    try {
      sections = await renderSections(cartPageSectionIds(), { url: getConfig().routes.cart });
    } catch (error) {
      return;
    }
    if (token !== renderToken) return;
    ids = cartPageSectionIds().filter((id) => sections[id]);
    if (ids.length === 0) return;
  }

  const active = document.activeElement;
  const focusInside = !!(active && active !== document.body && ids.some((id) => document.querySelector(selectorFor(id))?.contains(active)));
  const focus = focusInside ? describeFocus(active) : null;

  ids.forEach((id) => swapSection(id, sections[id]));
  if (focusInside) restoreFocus(focus);
}

/* ---------- Nota do pedido ---------- */

let lastSavedNote = null;
const saveNote = debounce((value) => {
  if (value === lastSavedNote) return;
  lastSavedNote = value;
  // publish: false — a nota não muda itens nem totais; nada precisa ser redesenhado.
  updateNote(value, { publish: false }).catch(() => {
    lastSavedNote = null;
  });
}, 600);

function onNoteInput(event) {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement) || !field.matches('[data-cart-note]')) return;
  saveNote(field.value);
}

if (document.querySelector(`[${SECTION_ATTRIBUTE}]`)) {
  const initialNote = document.querySelector('[data-cart-note]');
  lastSavedNote = initialNote ? initialNote.value : null;
  subscribe(EVENTS.cartUpdated, (event) => refresh(event.detail));
  document.addEventListener('input', onNoteInput);
  document.addEventListener('change', onNoteInput);
}
