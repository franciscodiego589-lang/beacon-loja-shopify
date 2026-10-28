/**
 * Beacon Labs · <facet-filters> (facet-filters.js)
 *
 * Filtros, ordenação, "Mostrar" e paginação da grade de produtos
 * (sections/main-collection-product-grid.liquid). Só esta seção usa o elemento.
 *
 * Como funciona:
 * - Cada troca de filtro/ordenação envia o formulário de novo (checkbox e o select de
 *   ordenação, que é externo ao <form> pelo atributo form="..."); o botão "Aplicar preço"
 *   também é um submit comum. O <form> nunca navega: o envio é sempre interceptado e vira
 *   uma busca pela Section Rendering API (search.api.js, renderSection), com o HTML trocado
 *   nas seis regiões (atributo data-facets-region): panel, count, badge, active, results,
 *   drawer-footer. O endereço novo entra no histórico com history.pushState.
 * - A URL é sempre reconstruída do zero a partir dos campos do próprio formulário (nomes
 *   que a Shopify já validou: filter.v.*, filter.p.*, sort_by) — nunca copiada de
 *   location.search. Todo endereço buscado ou gravado no histórico passa por
 *   sanitizeUrl(): só ficam filter.*, sort_by (da lista fechada do <select>) e page.
 * - Filtro de preço: o campo mostra reais e o parâmetro da URL também vai em reais, com
 *   ponto decimal ("5" ou "20.40"): shopify.dev, "Storefront filtering", tabela "Price":
 *   "A single monetary value in the format of the shop's default currency", e o exemplo
 *   oficial de "Support storefront filtering", que envia money_without_currency no campo;
 *   ambos consultados em 27/09/2026. Só filter.min_value/max_value.value (Liquid) vem em
 *   centavos; a seção já divide por 100 para preencher o campo.
 * - A ordenação padrão da coleção (data-default-sort) não entra na URL.
 * - Os links de paginação, de remover filtro e de "Limpar" (atributo data-facets-link) já
 *   trazem o endereço pronto (calculado pela Shopify: url_to_remove, paginate.parts, etc.):
 *   o clique só busca esse endereço (depois de sanitizeUrl), sem recompor nada.
 * - Voltar/avançar do navegador (popstate): a grade é buscada de novo para o endereço
 *   atual, sem gravar outra entrada no histórico.
 * - Foco: depois da troca das regiões, o foco volta ao mesmo campo (pelo id); se o campo
 *   sumiu (ex.: chip removido), vai para o título dos resultados, ou para o botão de fechar
 *   quando a gaveta está aberta. "Ver mais" aberto continua aberto.
 * - Modo gaveta (redesenho v3, atributo data-facets-mode="drawer" no <facet-filters>, o único modo
 *   que a seção usa): os filtros ficam sempre na gaveta, também no computador. O CSS não tem mais
 *   painel lateral em largura nenhuma: o <aside data-facets-home> fica escondido sempre e só guarda
 *   o painel enquanto a gaveta está fechada, e a gaveta nunca é escondida por CSS. Por isso o
 *   componente não ouve a mudança para o modo computador e a gaveta aberta nunca fecha por causa
 *   da largura da janela.
 * - Sem o atributo NÃO volta painel lateral nenhum (o CSS dele saiu): só sobra a escuta de largura
 *   (onDesktopChange), que fecha a gaveta aberta ao passar do modo celular para o computador. Esse
 *   ramo é resto do desenho anterior, não é um modo suportado, e tirar o atributo não devolve o
 *   painel lateral.
 * - "Mostrar" (produtos por página) não é parâmetro de URL: o Liquid não lê a query string
 *   (não existe request.query_string), então a escolha é gravada no atributo do carrinho
 *   "produtos_por_pagina" (cart.api.js) e só depois a seção é buscada de novo.
 * - "Carregar mais produtos" (celular) não troca a região "results" inteira: acrescenta os
 *   <li> novos à grade e troca só o bloco [data-load-more].
 * - No celular e no tablet (e em qualquer largura no modo gaveta), o mesmo painel de filtros
 *   (#FacetsPanel-..., data-facets-panel) se move entre o <aside data-facets-home> e a gaveta
 *   [data-facets-drawer-body] quando ela abre e fecha, em vez de duplicar os campos (dois
 *   <input> com o mesmo id/name quebrariam o rótulo e o envio). Por isso todo evento é ouvido
 *   por delegação, no próprio elemento: continua funcionando depois que uma região é trocada.
 *
 * Segurança: só entra HTML vindo da Section Rendering API (parseHTML). O endereço buscado
 * é sempre local (search.api.js recusa endereço que não comece com "/").
 */

import {
  getString,
  announce,
  debounce,
  openModal,
  closeModal,
  parseHTML,
  getSectionElement,
  getFocusableElements,
  MEDIA,
  prefersReducedMotion,
  readJSON,
  isLocalPath,
} from '@theme/global';
import { renderSection } from '@theme/search-api';
import { update as updateCart } from '@theme/cart-api';

const REGIONS = ['panel', 'count', 'badge', 'active', 'results', 'drawer-footer'];
// filter.p.* e filter.v.* (tag, product_type, vendor, m.namespace.chave, option.nome, price.gte,
// t.shopify.*...). Letras de qualquer idioma, números, ponto, hífen e sublinhado.
const FILTER_PARAM = /^filter\.[pv]\.[\p{L}\p{N}_.-]+$/u;
const MAX_PARAM_VALUE = 200;

function regionOf(root, name) {
  return root.querySelector(`[data-facets-region="${name}"]`);
}

/** Valor de preço digitado (reais) no formato da URL da Shopify: ponto decimal, até 2 casas. */
function normalizePrice(raw) {
  const reais = Number.parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(reais) || reais < 0) return '';
  return String(Math.round(reais * 100) / 100);
}

class FacetFilters extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId || '';
    this.baseUrl = this.dataset.url || window.location.pathname;

    // readJSON: JSON inválido vira {} (com aviso no console) em vez de derrubar o componente.
    this.config = readJSON(this.querySelector('[data-facets-config]')) || {};
    this.perPageOptions = Array.isArray(this.config.perPageOptions) ? this.config.perPageOptions.map(String) : [];
    this.strings = this.config.strings || {};

    // Modo gaveta: filtros na gaveta em qualquer largura (sem painel lateral no computador).
    this.drawerOnly = this.dataset.facetsMode === 'drawer';

    this.dialog = this.querySelector('[data-facets-drawer]');
    this.homeContainer = this.querySelector('[data-facets-home]');
    this.drawerBody = this.querySelector('[data-facets-drawer-body]');
    // A região "results" é substituída inteira a cada busca (o nó fica obsoleto):
    // por isso ela é buscada de novo a cada uso, nunca guardada numa propriedade.
    this.errorElement = this.querySelector('[data-facets-error]');

    this.requestToken = 0;
    this.abortController = null;
    this.currentUrl = this.sanitizeUrl(`${window.location.pathname}${window.location.search}`);

    this.debouncedSubmit = debounce(() => this.submitFiltersForm(), 120);

    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onDialogClose = this.onDialogClose.bind(this);
    this.onPopState = this.onPopState.bind(this);
    this.onDesktopChange = this.onDesktopChange.bind(this);

    this.addEventListener('change', this.onChange);
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener('click', this.onClick);
    if (this.dialog) this.dialog.addEventListener('close', this.onDialogClose);
    window.addEventListener('popstate', this.onPopState);
    this.desktopQuery = !this.drawerOnly && window.matchMedia ? window.matchMedia(MEDIA.desktop) : null;
    if (this.desktopQuery) {
      if (this.desktopQuery.addEventListener) this.desktopQuery.addEventListener('change', this.onDesktopChange);
      else if (this.desktopQuery.addListener) this.desktopQuery.addListener(this.onDesktopChange);
    }
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('submit', this.onSubmit);
    this.removeEventListener('click', this.onClick);
    if (this.dialog) this.dialog.removeEventListener('close', this.onDialogClose);
    window.removeEventListener('popstate', this.onPopState);
    if (this.desktopQuery) {
      if (this.desktopQuery.removeEventListener) this.desktopQuery.removeEventListener('change', this.onDesktopChange);
      else if (this.desktopQuery.removeListener) this.desktopQuery.removeListener(this.onDesktopChange);
    }
    if (this.abortController) this.abortController.abort();
    this.debouncedSubmit.cancel();
  }

  /* ---------- Eventos ---------- */

  onChange(event) {
    const target = event.target;
    if (target.matches('[data-facets-per-page]')) {
      this.changePerPage(target.value);
      return;
    }
    if (target.matches('[data-facets-sort]')) {
      // Não depende de target.form: o <select> fica fora do <form> (atributo form="...") e o
      // formulário é trocado a cada busca.
      this.debouncedSubmit.cancel();
      this.submitFiltersForm();
      return;
    }
    if (target.matches('.facet__checkbox')) {
      this.debouncedSubmit();
    }
  }

  onPopState() {
    if (window.location.pathname !== this.baseUrl) return;
    const url = this.sanitizeUrl(`${window.location.pathname}${window.location.search}`);
    // popstate também dispara em navegação por âncora (#MainContent): só busca se a grade mudou.
    if (!url || url === this.currentUrl) return;
    this.syncSortSelect(url);
    this.navigate(url, { push: false });
  }

  onDesktopChange(event) {
    if (!event.matches || !this.dialog || !this.dialog.open) return;
    // A gaveta some no computador (CSS); fechada aqui, o painel volta para a lateral.
    this.dialog.close();
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      const heading = this.querySelector('[data-facets-results-heading]');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  onSubmit(event) {
    if (!event.target.matches('[data-facets-form]')) return;
    event.preventDefault();
    this.debouncedSubmit.cancel();
    this.submitFiltersForm();
  }

  onClick(event) {
    const moreButton = event.target.closest('[data-facet-more]');
    if (moreButton) {
      this.toggleFacetMore(moreButton);
      return;
    }

    const openButton = event.target.closest('[data-facets-open]');
    if (openButton) {
      event.preventDefault();
      this.openDrawer(openButton);
      return;
    }

    const closeButton = event.target.closest('[data-facets-close]');
    if (closeButton) {
      event.preventDefault();
      const dialog = closeButton.closest('dialog');
      if (dialog) closeModal(dialog);
      return;
    }

    const loadMoreLink = event.target.closest('[data-load-more-link]');
    if (loadMoreLink) {
      event.preventDefault();
      this.loadMore(loadMoreLink);
      return;
    }

    const facetLink = event.target.closest('[data-facets-link]');
    if (facetLink) {
      event.preventDefault();
      // getAttribute (não a propriedade .href): a propriedade devolve o endereço absoluto,
      // e renderSection só aceita caminho local, a partir de "/" (search.api.js).
      this.navigate(facetLink.getAttribute('href'), { scroll: facetLink.hasAttribute('data-facets-scroll') });
    }
  }

  onDialogClose() {
    const panel = this.querySelector('[data-facets-panel]');
    if (panel && this.homeContainer && panel.parentElement !== this.homeContainer) {
      this.homeContainer.appendChild(panel);
    }
  }

  /* ---------- Gaveta (celular e tablet; qualquer largura no modo gaveta) ---------- */

  openDrawer(opener) {
    if (!this.dialog) return;
    const panel = this.querySelector('[data-facets-panel]');
    if (panel && this.drawerBody && panel.parentElement !== this.drawerBody) {
      this.drawerBody.appendChild(panel);
    }
    openModal(this.dialog, { opener });
  }

  /* ---------- "Ver mais" de um filtro ---------- */

  toggleFacetMore(button) {
    const facet = button.closest('.facet');
    if (!facet) return;
    const expanded = !facet.classList.contains('is-expanded');
    facet.classList.toggle('is-expanded', expanded);
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  /* ---------- Construção da URL (só parâmetros conhecidos) ---------- */

  /**
   * Valores aceitos em sort_by: as opções que a Shopify renderizou no <select>
   * (collection.sort_options), lidas uma vez ao conectar. O <select> não é trocado pelas buscas.
   */
  sortValues() {
    if (!this.allowedSorts) {
      const select = this.querySelector('[data-facets-sort]');
      this.allowedSorts = select ? Array.from(select.options, (option) => option.value) : [];
    }
    return this.allowedSorts;
  }

  /**
   * Endereço local com só os parâmetros conhecidos: filter.p.* / filter.v.*, sort_by (da lista
   * fechada) e page (inteiro positivo). Qualquer outro parâmetro (utm_*, lixo) fica de fora.
   * Devolve '' para endereço que não seja caminho local.
   */
  sanitizeUrl(url) {
    if (!isLocalPath(url)) return '';
    const [pathAndQuery] = url.split('#');
    const [pathname, query = ''] = pathAndQuery.split('?');
    const input = new URLSearchParams(query);
    const output = new URLSearchParams();
    const sorts = this.sortValues();
    const defaultSort = this.querySelector('[data-facets-sort]')?.dataset.defaultSort || '';
    for (const [key, rawValue] of input.entries()) {
      const value = String(rawValue).slice(0, MAX_PARAM_VALUE);
      if (FILTER_PARAM.test(key)) {
        if (value !== '') output.append(key, value);
      } else if (key === 'sort_by') {
        if (!output.has('sort_by') && sorts.includes(value) && value !== defaultSort) output.set('sort_by', value);
      } else if (key === 'page') {
        const page = Number.parseInt(value, 10);
        if (page > 1 && !output.has('page')) output.set('page', String(page));
      }
    }
    const result = output.toString();
    return result ? `${pathname}?${result}` : pathname;
  }

  buildFiltersUrl() {
    const form = this.querySelector('[data-facets-form]');
    const params = new URLSearchParams();

    if (form) {
      const priceNames = new Set(
        Array.from(form.querySelectorAll('[data-facet-price]'))
          .map((input) => input.name)
          .filter(Boolean)
      );
      const formData = new FormData(form);
      for (const [key, rawValue] of formData.entries()) {
        if (key === 'sort_by') continue;
        let value = String(rawValue).trim();
        if (value === '') continue;
        if (priceNames.has(key)) {
          value = normalizePrice(value);
          if (value === '') continue;
        }
        params.append(key, value);
      }
    }

    const sortSelect = this.querySelector('[data-facets-sort]');
    if (sortSelect && sortSelect.value) params.set('sort_by', sortSelect.value);

    const query = params.toString();
    return this.sanitizeUrl(query ? `${this.baseUrl}?${query}` : this.baseUrl);
  }

  /** Deixa o <select> de ordenação igual ao sort_by do endereço (voltar do navegador). */
  syncSortSelect(url) {
    const select = this.querySelector('[data-facets-sort]');
    if (!select) return;
    const sort = new URLSearchParams(url.split('?')[1] || '').get('sort_by') || select.dataset.defaultSort || '';
    if (this.sortValues().includes(sort)) select.value = sort;
  }

  submitFiltersForm() {
    this.navigate(this.buildFiltersUrl(), { scroll: false });
  }

  /* ---------- "Mostrar" (produtos por página) ---------- */

  async changePerPage(value) {
    const normalized = String(value);
    if (!this.perPageOptions.includes(normalized)) return;
    const attributeName = this.config.perPageAttribute || 'produtos_por_pagina';

    this.clearError();
    try {
      await updateCart({ attributes: { [attributeName]: normalized } }, { publish: false });
    } catch (error) {
      this.showError();
      return;
    }
    this.navigate(this.buildFiltersUrl(), { scroll: false });
  }

  /* ---------- Busca e troca de regiões ---------- */

  async navigate(rawUrl, { scroll = false, push = true } = {}) {
    const url = this.sanitizeUrl(rawUrl);
    if (!url) {
      if (rawUrl) this.showError();
      return;
    }
    const token = ++this.requestToken;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    this.clearError();
    const busyBefore = regionOf(this, 'results');
    if (busyBefore) busyBefore.setAttribute('aria-busy', 'true');

    let html;
    try {
      html = await renderSection(url, this.sectionId, { signal: this.abortController.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (token === this.requestToken) {
        this.showError();
        const busyError = regionOf(this, 'results');
        if (busyError) busyError.setAttribute('aria-busy', 'false');
      }
      return;
    }
    if (token !== this.requestToken) return;

    const doc = parseHTML(html);
    const root = getSectionElement(doc, this.sectionId);
    if (root) this.applyRegions(root);
    const busyAfter = regionOf(this, 'results');
    if (busyAfter) busyAfter.setAttribute('aria-busy', 'false');

    this.currentUrl = url;
    if (push && `${window.location.pathname}${window.location.search}` !== url) {
      history.pushState({ facets: true }, '', url);
    }
    this.announceCount();

    if (scroll) {
      const heading = this.querySelector('[data-facets-results-heading]');
      if (heading) {
        heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        heading.focus({ preventScroll: true });
      }
    }
  }

  applyRegions(root) {
    const active = document.activeElement;
    const focusId = active && active !== document.body && this.contains(active) ? active.id : '';
    const hadFocusInside = !!(active && active !== document.body && this.contains(active));
    const expanded = Array.from(this.querySelectorAll('.facet.is-expanded[id]'), (facet) => facet.id);

    REGIONS.forEach((name) => {
      const next = regionOf(root, name);
      const current = regionOf(this, name);
      if (!next || !current) return;
      current.replaceWith(document.importNode(next, true));
    });

    // "Ver mais" que o visitante abriu continua aberto no painel novo.
    expanded.forEach((id) => {
      const facet = this.querySelector(`#${CSS.escape(id)}`);
      if (!facet || facet.classList.contains('is-expanded')) return;
      facet.classList.add('is-expanded');
      const button = facet.querySelector('[data-facet-more]');
      if (button) button.setAttribute('aria-expanded', 'true');
    });

    if (hadFocusInside) this.restoreFocus(focusId);
  }

  /** Devolve o foco depois da troca das regiões (o nó focado foi substituído). */
  restoreFocus(focusId) {
    const current = document.activeElement;
    if (current && current !== document.body && current.isConnected && this.contains(current)) return;
    let target = focusId ? this.querySelector(`#${CSS.escape(focusId)}`) : null;
    if (target && (target.disabled || target.closest('[hidden]'))) target = null;
    if (!target && this.dialog && this.dialog.open) {
      target = this.dialog.querySelector('[data-facets-close]') || getFocusableElements(this.dialog)[0] || null;
    }
    if (!target) target = this.querySelector('[data-facets-results-heading]');
    if (target) target.focus({ preventScroll: true });
  }

  announceCount() {
    const el = this.querySelector('[data-facets-count]');
    const count = el ? Number.parseInt(el.dataset.facetsCount, 10) : NaN;
    if (!Number.isFinite(count)) return;
    const key = count === 0 ? 'resultsNone' : count === 1 ? 'resultsOne' : 'resultsOther';
    const message = this.strings[key] ? this.strings[key].replace('{count}', String(count)) : '';
    if (message) announce(message);
  }

  /* ---------- Carregar mais (celular) ---------- */

  async loadMore(link) {
    const url = this.sanitizeUrl(link.getAttribute('href'));
    if (!url) {
      this.showError();
      return;
    }
    const token = ++this.requestToken;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    this.clearError();
    const currentBlock = this.querySelector('[data-load-more]');
    if (currentBlock) currentBlock.classList.add('is-loading');

    let html;
    try {
      html = await renderSection(url, this.sectionId, { signal: this.abortController.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (token === this.requestToken) this.showError();
      if (currentBlock) currentBlock.classList.remove('is-loading');
      return;
    }
    if (token !== this.requestToken) return;

    const doc = parseHTML(html);
    const root = getSectionElement(doc, this.sectionId);
    if (!root) return;

    const nextGrid = root.querySelector('[data-facets-grid]');
    const currentGrid = this.querySelector('[data-facets-grid]');
    let addedCount = 0;
    if (nextGrid && currentGrid) {
      Array.from(nextGrid.children).forEach((item) => {
        currentGrid.appendChild(document.importNode(item, true));
        addedCount += 1;
      });
    }

    const nextBlock = root.querySelector('[data-load-more]');
    const block = this.querySelector('[data-load-more]');
    if (nextBlock && block) {
      block.replaceWith(document.importNode(nextBlock, true));
      const nextLink = this.querySelector('[data-load-more-link]');
      if (nextLink) {
        nextLink.focus({ preventScroll: true });
      } else {
        const status = this.querySelector('[data-load-more-status]');
        if (status) {
          status.setAttribute('tabindex', '-1');
          status.focus({ preventScroll: true });
        }
      }
    }

    this.currentUrl = url;
    if (`${window.location.pathname}${window.location.search}` !== url) history.pushState({ facets: true }, '', url);

    if (addedCount > 0) {
      const key = addedCount === 1 ? 'loadedOne' : 'loadedOther';
      const message = this.strings[key] ? this.strings[key].replace('{count}', String(addedCount)) : '';
      if (message) announce(message);
    }
  }

  /* ---------- Erro ---------- */

  showError() {
    if (!this.errorElement) return;
    this.errorElement.textContent = this.strings.error || getString('updateError') || '';
    this.errorElement.hidden = false;
  }

  clearError() {
    if (!this.errorElement) return;
    this.errorElement.hidden = true;
    this.errorElement.textContent = '';
  }
}

if (!customElements.get('facet-filters')) {
  customElements.define('facet-filters', FacetFilters);
}
