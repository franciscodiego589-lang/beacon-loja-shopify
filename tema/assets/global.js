/**
 * Beacon Labs · global.js (fundação)
 *
 * Utilitários compartilhados, importados pelos componentes via importmap:
 *   import { subscribe, publish, formatMoney } from '@theme/global';
 *
 * Exporta:
 * - getConfig(), getString(chave, variáveis), interpolate()
 * - keepTogether(texto), buyLabel(variante, textos): texto do botão de compra
 * - floorDivide(valor, divisor), isLocalPath(caminho), SECTION_ID_PATTERN
 * - EVENTS, publish(nome, detail), subscribe(nome, callback) -> função para cancelar
 * - debounce(fn, espera)
 * - fetchConfig(tipo, { method, body })
 * - formatMoney(centavos, formato)
 * - getFocusableElements(), trapFocus(contêiner, elemento), removeTrapFocus(elemento), onKeyUpEscape(evento)
 * - captureItemFocus(elemento, linhas), itemFocusTarget(retrato, linhas): foco nas linhas do carrinho
 * - openModal(dialog, { opener, focusTarget }), closeModal(dialog)
 * - lockScroll(), unlockScroll()
 * - announce(mensagem): escreve na região viva #ThemeLiveRegion
 * - parseHTML(html), getSectionElement(doc, id): só para HTML vindo da Section Rendering API
 * - bindSwipe(elemento, aoDeslizar): gesto de deslizar na horizontal, devolve a função que desliga
 * - createIcon(nome, tamanho, classe): ícones truck, check-circle, play e pause, com os
 *   mesmos traçados de snippets/icon.liquid
 * - MEDIA, matches(consulta), prefersReducedMotion()
 *
 * Sem efeito ao carregar: só funções e constantes. O redesenho do contador da sacola, das
 * barras de frete grátis e da barra de anúncio a cada 'cart:updated' fica em
 * assets/cart-chrome.js (carregado pelo layout), desde a auditoria de arquitetura de 28/09/2026.
 *
 * Segurança: nenhum texto de usuário entra por innerHTML. Textos vão por textContent;
 * HTML só entra quando vem da Section Rendering API da Shopify (parseHTML).
 */

/* ---------- Configuração ---------- */

const DEFAULT_CONFIG = {
  routes: {
    root: '/',
    cart: '/cart',
    cartAdd: '/cart/add',
    cartChange: '/cart/change',
    cartUpdate: '/cart/update',
    search: '/search',
    predictiveSearch: '/search/suggest',
    productRecommendations: '/recommendations/products',
    allProducts: '/collections/all',
  },
  cartType: 'drawer',
  freeShippingThreshold: 0,
  moneyFormat: '{{amount_with_comma_separator}}',
  currency: '',
  locale: 'pt-BR',
  predictiveSearch: false,
  strings: {},
};

let cachedConfig = null;

/** Lê um <script type="application/json"> pelo id (ou elemento) e devolve o objeto, ou null. */
export function readJSON(idOrElement) {
  const element = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
  if (!element) return null;
  try {
    return JSON.parse(element.textContent || 'null');
  } catch (error) {
    console.error('[Beacon Labs] JSON inválido em', element.id || element, error);
    return null;
  }
}

/** Configuração do tema (#ThemeConfig em layout/theme.liquid), com valores reserva. */
export function getConfig() {
  if (cachedConfig) return cachedConfig;
  const data = readJSON('ThemeConfig') || {};
  cachedConfig = {
    ...DEFAULT_CONFIG,
    ...data,
    routes: { ...DEFAULT_CONFIG.routes, ...(data.routes || {}) },
    strings: { ...DEFAULT_CONFIG.strings, ...(data.strings || {}) },
  };
  return cachedConfig;
}

/** Troca {chave} pelos valores. Os valores viram texto; o resultado deve ir para textContent. */
export function interpolate(template, variables = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
  );
}

/** Texto traduzido vindo de ThemeConfig.strings, com {marcadores} trocados. */
export function getString(key, variables = {}) {
  const value = getConfig().strings[key];
  if (typeof value !== 'string') return '';
  return interpolate(value, variables);
}

/** Divisão inteira para baixo (igual a divided_by do Liquid com inteiros); divisor inválido dá 0. */
export function floorDivide(value, divisor) {
  if (!(divisor > 0)) return 0;
  return Math.floor(value / divisor);
}

/** Id de seção aceito pela Section Rendering API (letras, números, _ e -). */
export const SECTION_ID_PATTERN = /^[\w-]+$/;

/**
 * Caminho do próprio site: começa com "/" e não com "//" (nunca um endereço externo) e não tem
 * "\" nem caractere de controle (U+0000 a U+001F) nem DEL (U+007F) em lugar nenhum (spec 4.4, S5).
 * O navegador lê "/\exemplo.com" como "//exemplo.com" e apaga TAB e quebra de linha da URL, então
 * "/\t/exemplo.com" também vira "//exemplo.com" (endereço externo).
 */
export function isLocalPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[\u0000-\u001f\u007f\\]/.test(path);
}

/** Espaço sem quebra: em botões, "R$ 239,70" e "3 potes" não se partem no fim da linha. */
export function keepTogether(text) {
  return String(text ?? '').replace(/ /g, '\u00a0');
}

/**
 * Texto do botão de compra de uma variante, a mesma regra de snippets/produto-buy-label.liquid:
 * esgotada: strings.soldOut; com kit: strings.addKit ({kit}, {price}); sem kit: strings.add
 * ({price}). Kit e preço com espaço sem quebra. variant: { kit, price, available } do
 * ProductData (snippets/produto-variant-json.liquid).
 */
export function buyLabel(variant, strings = {}) {
  if (!variant) return '';
  if (variant.available === false) return strings.soldOut || '';
  const price = keepTogether(formatMoney(variant.price));
  if (variant.kit) return interpolate(strings.addKit, { kit: keepTogether(variant.kit), price });
  return interpolate(strings.add, { price });
}

/* ---------- Eventos ---------- */

/**
 * Eventos do tema (contrato entre componentes). Nenhum componente publica evento fora desta lista.
 * - cartUpdated: detail { cart, sections, source } (cart.api.js, depois de toda mudança).
 * - cartOpen: detail { opener } (abre a gaveta do carrinho).
 * - variantChange: detail { variant, sectionId, productId } (kit-selector.js).
 * - carouselChange: detail { index } (carousel-slider.js, disparado no próprio <carousel-slider>
 *   com bubbles, a cada troca de slide no modo "fade").
 * - stickyAtcChange: detail { visible, height } (sticky-atc.js, quando a barra fixa aparece,
 *   some ou muda de altura; height em px, 0 com a barra escondida). Lido por liquid-glass.js
 *   para remedir o botão de atendimento, que sobe junto com a barra (--chat-offset).
 */
export const EVENTS = Object.freeze({
  cartUpdated: 'cart:updated',
  cartOpen: 'cart:open',
  variantChange: 'variant:change',
  carouselChange: 'carousel:change',
  stickyAtcChange: 'sticky-atc:change',
});

/** Dispara um CustomEvent no document. */
export function publish(eventName, detail = {}) {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Escuta um evento no document (inclui eventos com bubbles: true disparados em elementos).
 * O callback recebe o evento (use event.detail). Devolve a função que cancela a escuta.
 */
export function subscribe(eventName, callback) {
  const handler = (event) => callback(event);
  document.addEventListener(eventName, handler);
  return () => document.removeEventListener(eventName, handler);
}

/* ---------- Tempo ---------- */

export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/* ---------- Requisições ---------- */

/**
 * Opções padrão de fetch para as APIs Ajax da Shopify.
 * - body objeto: enviado como JSON
 * - body FormData: enviado como multipart (o navegador define o Content-Type)
 */
export function fetchConfig(type = 'json', { method = 'POST', body, signal } = {}) {
  const headers = { Accept: type === 'json' ? 'application/json' : type === 'html' ? 'text/html' : `application/${type}` };
  const init = { method, headers, credentials: 'same-origin' };
  if (signal) init.signal = signal;
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return init;
}

/* ---------- Dinheiro ---------- */

function groupThousands(integerString, separator) {
  return integerString.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function formatCents(cents, precision, thousands, decimal) {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  let result;
  if (precision === 0) {
    // Arredondamento da Shopify: centavos a partir de 50 sobem.
    result = groupThousands(String(Math.round(absolute / 100)), thousands);
  } else {
    const integer = Math.floor(absolute / 100);
    const fraction = String(absolute % 100).padStart(2, '0');
    result = `${groupThousands(String(integer), thousands)}${decimal}${fraction}`;
  }
  return negative ? `-${result}` : result;
}

const MONEY_PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/;
let decodedFormatCache = { raw: null, decoded: '' };

function decodeFormat(format) {
  if (decodedFormatCache.raw === format) return decodedFormatCache.decoded;
  // O formato vem do admin (shop.money_format) e pode ter entidades ou tags.
  // DOMParser cria um documento inerte; só o textContent é lido.
  const decoded = new DOMParser().parseFromString(String(format), 'text/html').body.textContent || '';
  decodedFormatCache = { raw: format, decoded };
  return decoded;
}

/**
 * Formata centavos no formato de dinheiro da loja (shop.money_format).
 * Marcadores aceitos (help.shopify.com, "Currency formatting", consultado em 27/09/2026):
 * amount, amount_no_decimals, amount_with_comma_separator, amount_no_decimals_with_comma_separator,
 * amount_with_apostrophe_separator, amount_no_decimals_with_space_separator,
 * amount_with_space_separator, amount_with_period_and_space_separator.
 */
export function formatMoney(cents, format = getConfig().moneyFormat) {
  const value = typeof cents === 'string' ? Number.parseInt(cents.replace(/[^\d-]/g, ''), 10) : Math.round(Number(cents));
  if (!Number.isFinite(value)) return '';
  const template = decodeFormat(format || '{{amount}}');
  const match = template.match(MONEY_PLACEHOLDER);
  const placeholder = match ? match[1] : 'amount';
  let amount;
  switch (placeholder) {
    case 'amount_no_decimals':
      amount = formatCents(value, 0, ',', '.');
      break;
    case 'amount_with_comma_separator':
      amount = formatCents(value, 2, '.', ',');
      break;
    case 'amount_no_decimals_with_comma_separator':
      amount = formatCents(value, 0, '.', ',');
      break;
    case 'amount_with_apostrophe_separator':
      amount = formatCents(value, 2, "'", '.');
      break;
    case 'amount_no_decimals_with_space_separator':
      amount = formatCents(value, 0, ' ', '');
      break;
    case 'amount_with_space_separator':
      amount = formatCents(value, 2, ' ', ',');
      break;
    case 'amount_with_period_and_space_separator':
      amount = formatCents(value, 2, ' ', '.');
      break;
    case 'amount':
    default:
      amount = formatCents(value, 2, ',', '.');
  }
  return match ? template.replace(MONEY_PLACEHOLDER, amount) : amount;
}

/* ---------- Mídia ---------- */

export const MEDIA = Object.freeze({
  tablet: '(min-width: 750px)',
  desktop: '(min-width: 990px)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
});

export function matches(query) {
  return window.matchMedia(query).matches;
}

export function prefersReducedMotion() {
  return matches(MEDIA.reducedMotion);
}

/* ---------- Foco ---------- */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Elementos focáveis e visíveis dentro do contêiner, na ordem do documento. */
export function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest('[inert]') && element.getClientRects().length > 0
  );
}

let activeTrap = null;

/**
 * Prende o foco no contêiner (para painéis que não são <dialog> modal).
 * Para <dialog> aberto com showModal(), o navegador já prende o foco: use openModal().
 */
export function trapFocus(container, elementToFocus = container) {
  if (!container) return;
  removeTrapFocus();

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (event) => {
    if (container.contains(event.target)) return;
    const [first] = getFocusableElements(container);
    (first || container).focus();
  };

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusIn);
  activeTrap = { container, onKeydown, onFocusIn };

  if (elementToFocus) {
    if (elementToFocus === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }
    elementToFocus.focus({ preventScroll: true });
  }
}

export function removeTrapFocus(elementToFocus = null) {
  if (activeTrap) {
    document.removeEventListener('keydown', activeTrap.onKeydown);
    document.removeEventListener('focusin', activeTrap.onFocusIn);
    activeTrap = null;
  }
  if (elementToFocus && typeof elementToFocus.focus === 'function') {
    elementToFocus.focus({ preventScroll: true });
  }
}

/** Esc dentro de um <details> aberto: fecha e devolve o foco ao <summary>. */
export function onKeyUpEscape(event) {
  if (event.key !== 'Escape') return;
  const openDetails = event.target instanceof Element ? event.target.closest('details[open]') : null;
  if (!openDetails) return;
  const summary = openDetails.querySelector(':scope > summary');
  openDetails.open = false;
  if (summary) summary.focus();
}

/* ---------- Gesto de deslizar ---------- */

const SWIPE_THRESHOLD = 40;

/**
 * Deslizar o dedo na horizontal sobre o elemento: onSwipe(1) quando o dedo vai para a esquerda
 * (próximo) e onSwipe(-1) quando vai para a direita (anterior). Só conta toque de um dedo, com
 * pelo menos 40 px na horizontal e mais horizontal que vertical. Ouvintes passivos (não
 * bloqueiam a rolagem). Devolve a função que desliga os ouvintes (para o disconnectedCallback).
 * Antes o mesmo gesto estava copiado em carousel-slider.js e media-gallery.js.
 */
export function bindSwipe(element, onSwipe) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const options = { passive: true };
  const onStart = (event) => {
    if (event.touches.length !== 1) {
      tracking = false;
      return;
    }
    tracking = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  };
  const onEnd = (event) => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    onSwipe(deltaX < 0 ? 1 : -1);
  };
  element.addEventListener('touchstart', onStart, options);
  element.addEventListener('touchend', onEnd, options);
  return () => {
    element.removeEventListener('touchstart', onStart, options);
    element.removeEventListener('touchend', onEnd, options);
  };
}

/* ---------- Foco nas linhas do carrinho (gaveta e página /cart) ---------- */

// Controles de uma linha (li[data-cart-item], marcação de snippets/cart-drawer.liquid e
// sections/main-cart-items.liquid, comportamento em cart-items.js). Antes esta lista e o
// critério de vizinho estavam copiados em cart-drawer.js e cart-page.js.
const CART_ITEM_CONTROLS = ['[data-quantity-step="1"]', '[data-quantity-step="-1"]', '.quantity-input__field', '[data-cart-remove]', '.cart-item__title'];

/**
 * Retrato do foco antes de trocar o HTML da lista: a chave da linha (data-key, não muda quando
 * outra linha sai), o tipo de controle e a posição. items: linhas atuais. Fora de uma linha: null.
 */
export function captureItemFocus(element, items) {
  const item = element instanceof Element ? element.closest('[data-cart-item]') : null;
  if (!item) return null;
  return {
    key: item.dataset.key || '',
    control: CART_ITEM_CONTROLS.find((selector) => element.matches(selector)) || '[data-cart-remove]',
    index: items.indexOf(item),
  };
}

/**
 * Para onde o foco volta depois da troca: o mesmo controle da mesma linha; se a linha saiu, o
 * remover da linha que ficou no lugar dela (ou da anterior). items: linhas novas. Sem alvo: null.
 */
export function itemFocusTarget(snapshot, items) {
  if (!snapshot) return null;
  const same = snapshot.key ? items.find((item) => item.dataset.key === snapshot.key) : null;
  if (same) return same.querySelector(snapshot.control) || same.querySelector('[data-cart-remove]');
  if (items.length === 0) return null;
  const neighbour = items[Math.min(Math.max(snapshot.index, 0), items.length - 1)];
  return neighbour.querySelector('[data-cart-remove]');
}

/* ---------- Rolagem ---------- */

let scrollLocks = 0;

export function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-width', `${Math.max(0, scrollbar)}px`);
    document.documentElement.classList.add('scroll-locked');
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }
}

export function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.paddingRight = '';
  }
}

/* ---------- Modais (<dialog>) ---------- */

const modalState = new WeakMap();

function setExpanded(element, value) {
  if (element && element.hasAttribute && element.hasAttribute('aria-expanded')) {
    element.setAttribute('aria-expanded', value ? 'true' : 'false');
  }
}

function onModalClose(event) {
  const dialog = event.currentTarget;
  const state = modalState.get(dialog);
  dialog.removeAttribute('data-closing');
  if (!state) return;
  modalState.delete(dialog);
  unlockScroll();
  setExpanded(state.opener, false);
  const target = state.returnFocus !== false && state.opener && state.opener.isConnected ? state.opener : null;
  if (target) target.focus({ preventScroll: true });
}

function onModalPointerDown(event) {
  const dialog = event.currentTarget;
  dialog.__pointerStartedOnBackdrop = event.target === dialog;
}

function onModalClick(event) {
  const dialog = event.currentTarget;
  // O <dialog> não tem padding: um clique cujo alvo é o próprio dialog foi no fundo (::backdrop).
  if (event.target === dialog && dialog.__pointerStartedOnBackdrop) closeModal(dialog);
  dialog.__pointerStartedOnBackdrop = false;
}

/**
 * Abre um <dialog> como modal: foco preso, Esc fecha, fundo inerte (nativos do showModal),
 * rolagem travada, aria-expanded="true" em quem abriu. Ao fechar, o foco volta para quem abriu.
 */
export function openModal(dialog, { opener = document.activeElement, focusTarget = null, returnFocus = true } = {}) {
  if (!dialog || typeof dialog.showModal !== 'function') return;
  if (dialog.open) {
    if (focusTarget) focusTarget.focus();
    return;
  }
  if (!dialog.dataset.modalBound) {
    dialog.addEventListener('close', onModalClose);
    dialog.addEventListener('pointerdown', onModalPointerDown);
    dialog.addEventListener('click', onModalClick);
    dialog.dataset.modalBound = 'true';
  }
  const openerElement = opener instanceof HTMLElement && opener !== document.body ? opener : null;
  modalState.set(dialog, { opener: openerElement, returnFocus });
  dialog.removeAttribute('data-closing');
  dialog.showModal();
  lockScroll();
  setExpanded(openerElement, true);
  if (focusTarget) focusTarget.focus();
}

/** Fecha o modal, com animação de saída quando o CSS define uma para [data-closing]. */
export function closeModal(dialog) {
  if (!dialog || !dialog.open || dialog.hasAttribute('data-closing')) return;
  if (prefersReducedMotion()) {
    dialog.close();
    return;
  }
  dialog.setAttribute('data-closing', '');
  const animationName = window.getComputedStyle(dialog).animationName;
  if (!animationName || animationName === 'none') {
    dialog.close();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.removeEventListener('animationend', onEnd);
    if (dialog.open) dialog.close();
    dialog.removeAttribute('data-closing');
  };
  const onEnd = (event) => {
    if (event.target === dialog) finish();
  };
  dialog.addEventListener('animationend', onEnd);
  setTimeout(finish, 400);
}

/* ---------- Região viva ---------- */

let announceTimer = null;

/** Lê a mensagem para leitores de tela pela região viva do layout. */
export function announce(message) {
  const region = document.getElementById('ThemeLiveRegion');
  if (!region || !message) return;
  region.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    region.textContent = String(message);
  }, 100);
}

/* ---------- HTML da Section Rendering API ---------- */

/** Transforma o HTML de uma resposta da Section Rendering API num documento inerte. */
export function parseHTML(html) {
  return new DOMParser().parseFromString(String(html ?? ''), 'text/html');
}

/** Wrapper #shopify-section-ID de um documento, ou o <body> quando não houver wrapper. */
export function getSectionElement(doc, sectionId) {
  if (!doc) return null;
  return (sectionId && doc.getElementById(`shopify-section-${sectionId}`)) || doc.body;
}

/* ---------- Ícones (mesmos traçados de snippets/icon.liquid) ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  truck: { shapes: [['path', { d: 'M3 6h11v10H3z' }], ['path', { d: 'M14 10h4l3 3v3h-7' }], ['circle', { cx: 7, cy: 18, r: 2 }], ['circle', { cx: 17, cy: 18, r: 2 }]] },
  'check-circle': { shapes: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'm8 12 3 3 5-6' }]] },
  play: { fill: 'currentColor', shapes: [['path', { d: 'M8 5v14l11-7z' }]] },
  pause: { shapes: [['path', { d: 'M9 5v14M15 5v14' }]] },
};

export function createIcon(name, size = 24, extraClass = '') {
  const icon = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon icon--${name}${extraClass ? ` ${extraClass}` : ''}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', icon && icon.fill ? icon.fill : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (icon) {
    icon.shapes.forEach(([tag, attributes]) => {
      const shape = document.createElementNS(SVG_NS, tag);
      Object.entries(attributes).forEach(([attribute, value]) => shape.setAttribute(attribute, String(value)));
      svg.appendChild(shape);
    });
  }
  return svg;
}
