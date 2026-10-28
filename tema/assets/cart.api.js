/**
 * Beacon Labs · cart.api.js (serviço de carrinho)
 *
 * Único ponto do tema que fala com a Ajax API do carrinho da Shopify.
 * Importe pelo apelido: import { add, change, get, updateNote } from '@theme/cart-api';
 * runAddToCart() é o fluxo comum dos botões "Adicionar" (formulário de produto, barra fixa e
 * combo): estado do botão, anúncios, gaveta ou carrinho em página e mensagem de erro.
 *
 * Endpoints (shopify.dev/docs/api/ajax/reference/cart, consultado em 27/09/2026):
 * - POST {routes.cart_add_url}.js     -> itens adicionados (+ sections)
 * - POST {routes.cart_change_url}.js  -> carrinho (+ sections)
 * - POST {routes.cart_update_url}.js  -> carrinho (+ sections)
 * - GET  {routes.cart_url}.js         -> carrinho
 * Bundled section rendering: parâmetro "sections" (até 5 ids) e "sections_url" opcional.
 *
 * Toda mudança bem-sucedida publica 'cart:updated' com detail { cart, sections, source }.
 * Os componentes NÃO precisam publicar de novo. Para não publicar, passe { publish: false }.
 * As mudanças entram numa fila e rodam uma de cada vez, na ordem em que foram pedidas.
 *
 * Seções pedidas junto: add(), addFormData() e change() usam pageSections() quando a opção
 * sections não vem. Assim quem publica não precisa saber quais vistas do carrinho existem na
 * página: a gaveta ('cart-drawer', quando há <cart-drawer> no documento) e as seções da página
 * /cart ([data-cart-page-section], ids dinâmicos lidos do HTML). Para não pedir nenhuma, passe
 * { sections: [] }.
 */

import { getConfig, fetchConfig, publish, EVENTS, getString, announce, SECTION_ID_PATTERN, isLocalPath } from '@theme/global';

const MAX_SECTIONS = 5;
const SECTION_DRAWER = 'cart-drawer';

export class CartError extends Error {
  constructor(message, { status = 0, description = '', data = null } = {}) {
    super(message);
    this.name = 'CartError';
    this.status = status;
    this.description = description;
    this.data = data;
  }
}

/* ---------- Fila ---------- */

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/* ---------- Auxiliares ---------- */

function endpoint(routeKey, suffix = '.js') {
  const routes = getConfig().routes;
  return `${routes[routeKey]}${suffix}`;
}

/** Aceita array ou texto separado por vírgula; devolve até 5 ids válidos, sem repetição. */
export function normalizeSections(sections) {
  if (!sections) return [];
  const list = Array.isArray(sections) ? sections : String(sections).split(',');
  const unique = [];
  list.forEach((id) => {
    const value = String(id).trim();
    if (value && SECTION_ID_PATTERN.test(value) && !unique.includes(value)) unique.push(value);
  });
  return unique.slice(0, MAX_SECTIONS);
}

function normalizeSectionsUrl(url) {
  return isLocalPath(url) ? url : null;
}

/** Ids das seções da página /cart ([data-cart-page-section="{{ section.id }}"]), na ordem do documento. */
export function cartPageSectionIds() {
  const ids = Array.from(document.querySelectorAll('[data-cart-page-section]'), (element) =>
    element.getAttribute('data-cart-page-section')
  );
  return normalizeSections(ids);
}

/**
 * Seções do carrinho presentes nesta página, para pedir junto de cada mudança (até 5 ids):
 * 'cart-drawer' quando o carrinho é em gaveta (ajuste cart_type) e existe <cart-drawer> no
 * documento, mais as seções da página /cart.
 */
export function pageSections() {
  const drawer = getConfig().cartType === 'drawer' && document.querySelector('cart-drawer');
  const ids = drawer ? [SECTION_DRAWER] : [];
  return normalizeSections(ids.concat(cartPageSectionIds()));
}

/** Opções com a lista padrão de seções (pageSections) quando quem chamou não passou nenhuma. */
function withPageSections(options) {
  return options.sections === undefined ? { ...options, sections: pageSections() } : options;
}

function normalizeItems(items) {
  const list = Array.isArray(items) ? items : [items];
  return list
    .filter(Boolean)
    .map((item) => {
      const normalized = { ...item };
      normalized.id = Number.parseInt(item.id ?? item.variantId ?? item.variant_id, 10);
      normalized.quantity = Math.max(1, Number.parseInt(item.quantity ?? 1, 10) || 1);
      delete normalized.variantId;
      delete normalized.variant_id;
      if (item.sellingPlan !== undefined) {
        normalized.selling_plan = item.sellingPlan;
        delete normalized.sellingPlan;
      }
      return normalized;
    })
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function errorMessage(data, fallbackKey) {
  if (data && typeof data.description === 'string' && data.description.trim()) return data.description;
  if (data && typeof data.message === 'string' && data.message.trim() && data.message !== 'Cart Error') return data.message;
  return getString(fallbackKey) || 'Cart error';
}

async function request(url, init, fallbackKey = 'updateError') {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new CartError(getString(fallbackKey) || 'Network error', { status: 0 });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    throw new CartError(errorMessage(data, fallbackKey), {
      status: response.status,
      description: data && typeof data.description === 'string' ? data.description : '',
      data,
    });
  }
  return data;
}

function splitSections(data) {
  if (!data || typeof data !== 'object') return { payload: data, sections: {} };
  const { sections, ...payload } = data;
  return { payload, sections: sections && typeof sections === 'object' ? sections : {} };
}

function applySectionOptions(target, options) {
  const sections = normalizeSections(options.sections);
  if (sections.length === 0) return;
  const sectionsUrl = normalizeSectionsUrl(options.sectionsUrl);
  if (target instanceof FormData) {
    target.set('sections', sections.join(','));
    if (sectionsUrl) target.set('sections_url', sectionsUrl);
  } else {
    target.sections = sections.join(',');
    if (sectionsUrl) target.sections_url = sectionsUrl;
  }
}

function notify(options, detail) {
  if (options.publish === false) return;
  publish(EVENTS.cartUpdated, { ...detail, source: options.source || 'cart-api' });
}

/* ---------- Leitura ---------- */

/** GET do carrinho (JSON). */
export function get({ signal } = {}) {
  return request(endpoint('cart'), fetchConfig('json', { method: 'GET', signal }));
}

/**
 * HTML de até 5 seções renderizadas no contexto de uma página (Section Rendering API).
 * Devolve { [id]: html | null }.
 */
export async function renderSections(sectionIds, { url, signal } = {}) {
  const ids = normalizeSections(sectionIds);
  if (ids.length === 0) return {};
  const base = normalizeSectionsUrl(url) || getConfig().routes.root || '/';
  const separator = base.includes('?') ? '&' : '?';
  const data = await request(
    `${base}${separator}sections=${encodeURIComponent(ids.join(','))}`,
    fetchConfig('json', { method: 'GET', signal })
  );
  return data && typeof data === 'object' ? data : {};
}

/* ---------- Mudanças ---------- */

/**
 * Adiciona itens: add([{ id, quantity, properties?, selling_plan? }], { sections, sectionsUrl, source, publish }).
 * Sem sections, pede pageSections().
 * Devolve { items, sections, cart } (cart é o carrinho completo, lido depois da adição).
 */
export function add(items, options = {}) {
  return enqueue(async () => {
    const body = { items: normalizeItems(items) };
    if (body.items.length === 0) throw new CartError(getString('addError') || 'Invalid item', { status: 422 });
    applySectionOptions(body, withPageSections(options));
    const data = await request(endpoint('cartAdd'), fetchConfig('json', { body }), 'addError');
    const { payload, sections } = splitSections(data);
    const cart = await get();
    const result = { items: (payload && payload.items) || [], sections, cart };
    notify(options, result);
    return result;
  });
}

/**
 * Adiciona a partir de um FormData de formulário de produto (id, quantity, properties[...], selling_plan).
 * Mesmas opções e mesmo retorno de add().
 */
export function addFormData(formData, options = {}) {
  return enqueue(async () => {
    const body = new FormData();
    formData.forEach((value, key) => body.append(key, value));
    applySectionOptions(body, withPageSections(options));
    const data = await request(endpoint('cartAdd'), fetchConfig('json', { body }), 'addError');
    const { payload, sections } = splitSections(data);
    const cart = await get();
    const items = payload && Array.isArray(payload.items) ? payload.items : payload ? [payload] : [];
    const result = { items, sections, cart };
    notify(options, result);
    return result;
  });
}

/**
 * Muda a quantidade de uma linha: change(linha, quantidade, opções).
 * - linha: número da linha (1, 2, 3...) ou a chave do item (item.key, texto). A chave é mais segura.
 * - quantidade 0 remove a linha.
 * Sem options.sections, pede pageSections().
 * Devolve { cart, sections }.
 */
export function change(line, quantity, options = {}) {
  return enqueue(async () => {
    const body = { quantity: Math.max(0, Number.parseInt(quantity, 10) || 0) };
    if (typeof line === 'string' && line.includes(':')) {
      body.id = line;
    } else {
      const lineNumber = Number.parseInt(line, 10);
      if (!(lineNumber > 0)) throw new CartError(getString('updateError') || 'Invalid line', { status: 422 });
      body.line = lineNumber;
    }
    if (options.properties && typeof options.properties === 'object') body.properties = options.properties;
    if (options.sellingPlan !== undefined) body.selling_plan = options.sellingPlan;
    applySectionOptions(body, withPageSections(options));
    const data = await request(endpoint('cartChange'), fetchConfig('json', { body }));
    const { payload, sections } = splitSections(data);
    const result = { cart: payload, sections };
    notify(options, result);
    return result;
  });
}

/**
 * Atualização geral: update({ updates, note, attributes, discount }, opções).
 * Devolve { cart, sections }.
 */
export function update(fields = {}, options = {}) {
  return enqueue(async () => {
    const body = {};
    ['updates', 'note', 'attributes', 'discount'].forEach((key) => {
      if (fields[key] !== undefined) body[key] = fields[key];
    });
    applySectionOptions(body, options);
    const data = await request(endpoint('cartUpdate'), fetchConfig('json', { body }));
    const { payload, sections } = splitSections(data);
    const result = { cart: payload, sections };
    notify(options, result);
    return result;
  });
}

/** Grava a nota do carrinho. O texto é enviado como dado; na tela, a nota sai com | escape. */
export function updateNote(note, options = {}) {
  return update({ note: String(note ?? '') }, { source: 'cart-note', ...options });
}

/* ---------- Fluxo comum dos botões "Adicionar" ---------- */

function setButtonBusy(button, busy) {
  button.classList.toggle('is-loading', busy);
  if (busy) {
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-busy', 'true');
  } else {
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-busy');
  }
}

/**
 * Fluxo de "Adicionar" usado por product-form.js, sticky-atc.js e combo-offer.js (antes copiado
 * nos três, com diferenças):
 * 1. marca o botão como ocupado (classe is-loading, aria-disabled e aria-busy; aria-disabled e
 *    não disabled, para o botão não perder o foco do teclado) e anuncia "adicionando";
 * 2. chama request() (add ou addFormData deste arquivo, que já publicam 'cart:updated');
 * 3. deu certo: anuncia "adicionado" e, com carrinho em gaveta, publica 'cart:open' (quem abriu
 *    é o botão); com carrinho em página, vai para o carrinho (como /cart/add faz sem JS);
 * 4. deu erro: onError(mensagem), com messages.error ou o texto padrão addError;
 * 5. no fim, tira o estado ocupado e chama onSettled(), para o componente recolocar o estado
 *    dele (variante indisponível, combo sem item marcado etc.).
 * Opções: { button, request, messages: { added, error }, onError, onSettled }.
 * Devolve true quando o item entrou no carrinho. Botão já ocupado: não faz nada (false).
 */
export async function runAddToCart({ button, request, messages = {}, onError = null, onSettled = null }) {
  if (!button || typeof request !== 'function' || button.classList.contains('is-loading')) return false;
  setButtonBusy(button, true);
  announce(getString('adding'));
  try {
    await request();
    announce(messages.added || getString('added'));
    if (getConfig().cartType === 'drawer') {
      publish(EVENTS.cartOpen, { opener: button });
    } else {
      window.location.assign(getConfig().routes.cart);
    }
    return true;
  } catch (error) {
    if (error && error.name === 'AbortError') return false;
    if (onError) onError(messages.error || getString('addError'));
    return false;
  } finally {
    setButtonBusy(button, false);
    if (onSettled) onSettled();
  }
}
