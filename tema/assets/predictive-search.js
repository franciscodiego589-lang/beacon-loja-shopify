/**
 * Beacon Labs · <predictive-search> (predictive-search.js)
 *
 * Busca preditiva em modal (snippets/predictive-search-modal.liquid), com os resultados da
 * seção 'predictive-search' (sections/predictive-search.liquid, área de busca).
 * - Gatilho: a lupa do cabeçalho, um botão com [data-predictive-search-open]; o clique ou o
 *   toque abrem o modal. O código também aceita como gatilho um campo de texto com o mesmo
 *   atributo (a digitação abre o modal levando o texto, que volta ao campo ao fechar), mas o
 *   cabeçalho do redesenho v3 não tem mais esse campo. Focar só pelo Tab não abre, para não
 *   prender quem está navegando pelo teclado.
 * - Digitação no modal: espera de 300 ms e busca pelo search.api.js (sugerir), com
 *   AbortController (a busca anterior é cancelada) e termo limitado a 80 caracteres.
 * - Campo vazio: mostra as buscas populares, pedindo a mesma seção na página de busca
 *   (renderSection(data-search-url, 'predictive-search')), uma vez por página.
 * - Resultados: HTML da Section Rendering API inserido em [data-predictive-search-results];
 *   enquanto carrega, aria-busy="true".
 * - Região viva [data-predictive-search-status]: texto de data-status do
 *   [data-predictive-search-root] (já traduzido na seção), sempre por textContent.
 * - Setas para cima e para baixo percorrem [data-predictive-search-option].
 * - Fecha: [data-predictive-search-close], Esc, clique no fundo e quando o carrinho abre
 *   ('cart:open'). O foco volta ao gatilho (a lupa; se o gatilho for um campo, o texto volta a
 *   ele), menos quando quem fechou foi o carrinho abrindo: aí o foco fica com a gaveta.
 * - Sem JS, o formulário vai para a página de busca.
 */

import { debounce, getConfig, getString, subscribe, EVENTS, openModal, closeModal, parseHTML, getSectionElement } from '@theme/global';
import { sugerir, renderSection, normalizeTerm, MAX_TERM_LENGTH } from '@theme/search-api';

const OPTION_SELECTOR = '[data-predictive-search-option]';

class PredictiveSearch extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    this.input = this.querySelector('[data-predictive-search-input]');
    this.results = this.querySelector('[data-predictive-search-results]');
    this.status = this.querySelector('[data-predictive-search-status]');
    this.resetButton = this.querySelector('[data-predictive-search-reset]');
    this.form = this.querySelector('[data-predictive-search-form]');
    if (!this.dialog || !this.input || !this.results) return;

    this.sectionId = this.dataset.sectionId || 'predictive-search';
    this.controller = null;
    this.shownTerm = null;
    this.popularHTML = null;
    this.opener = null;
    this.input.maxLength = MAX_TERM_LENGTH;
    this.search = debounce(() => this.update(), 300);

    this.onTriggerClick = (event) => {
      const trigger = event.target.closest('[data-predictive-search-open]');
      if (trigger) this.open(trigger);
    };
    this.onTriggerInput = (event) => {
      const trigger = event.target.closest('[data-predictive-search-open]');
      if (trigger && !this.dialog.open) this.open(trigger);
    };
    this.onInput = () => {
      this.updateReset();
      this.search();
    };
    this.onReset = (event) => {
      event.preventDefault();
      this.input.value = '';
      this.updateReset();
      this.search.cancel();
      this.update();
      this.input.focus();
    };
    this.onClick = (event) => {
      if (event.target.closest('[data-predictive-search-close]')) {
        event.preventDefault();
        closeModal(this.dialog);
      }
    };
    this.onKeyDown = (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      let options = Array.from(this.results.querySelectorAll(OPTION_SELECTOR));
      if (options.length === 0) options = Array.from(this.results.querySelectorAll('a[href]'));
      if (options.length === 0) return;
      const index = options.indexOf(document.activeElement);
      if (index === -1 && document.activeElement !== this.input) return;
      event.preventDefault();
      if (event.key === 'ArrowDown') {
        options[Math.min(options.length - 1, index + 1)].focus();
      } else if (index <= 0) {
        this.input.focus();
      } else {
        options[index - 1].focus();
      }
    };
    this.onCancel = (event) => {
      event.preventDefault();
      closeModal(this.dialog);
    };
    this.onClose = () => {
      if (this.controller) this.controller.abort();
      this.search.cancel();
      if (this.opener && typeof this.opener.value === 'string') this.opener.value = this.input.value;
      // O foco volta ao gatilho (a lupa do cabeçalho), menos quando a busca fechou porque o
      // carrinho abriu (botão Adicionar): aí o foco fica na gaveta, e o cabeçalho está inerte
      // atrás dela.
      const returnTo = this.closingForCart ? null : this.opener;
      this.closingForCart = false;
      if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
    };
    this.onSubmit = (event) => {
      const term = normalizeTerm(this.input.value);
      if (!term) {
        event.preventDefault();
        this.input.focus();
        return;
      }
      this.input.value = term;
    };

    document.addEventListener('click', this.onTriggerClick);
    document.addEventListener('input', this.onTriggerInput);
    this.input.addEventListener('input', this.onInput);
    this.resetButton?.addEventListener('click', this.onReset);
    this.addEventListener('click', this.onClick);
    this.dialog.addEventListener('keydown', this.onKeyDown);
    this.dialog.addEventListener('cancel', this.onCancel);
    this.dialog.addEventListener('close', this.onClose);
    this.form?.addEventListener('submit', this.onSubmit);
    this.unsubscribeCart = subscribe(EVENTS.cartOpen, () => {
      if (!this.dialog.open) return;
      // A gaveta (showModal) cuida do próprio foco; a busca só fecha, sem puxar o foco de volta.
      this.closingForCart = true;
      this.dialog.close();
    });
    this.updateReset();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onTriggerClick);
    document.removeEventListener('input', this.onTriggerInput);
    this.input?.removeEventListener('input', this.onInput);
    this.resetButton?.removeEventListener('click', this.onReset);
    this.removeEventListener('click', this.onClick);
    this.dialog?.removeEventListener('keydown', this.onKeyDown);
    this.dialog?.removeEventListener('cancel', this.onCancel);
    this.dialog?.removeEventListener('close', this.onClose);
    this.form?.removeEventListener('submit', this.onSubmit);
    if (this.unsubscribeCart) this.unsubscribeCart();
    if (this.controller) this.controller.abort();
  }

  open(trigger) {
    if (this.dialog.open) return;
    this.opener = trigger;
    this.closingForCart = false;
    if (trigger && typeof trigger.value === 'string') this.input.value = trigger.value.slice(0, MAX_TERM_LENGTH);
    // returnFocus: false — a volta do foco é decidida em onClose (ver 'cart:open').
    openModal(this.dialog, { opener: trigger, focusTarget: this.input, returnFocus: false });
    const end = this.input.value.length;
    try {
      this.input.setSelectionRange(end, end);
    } catch (error) {
      /* alguns navegadores não aceitam seleção em type=search */
    }
    this.updateReset();
    this.update();
  }

  updateReset() {
    if (this.resetButton) this.resetButton.hidden = this.input.value.length === 0;
  }

  setStatus(text) {
    if (this.status) this.status.textContent = text || '';
  }

  /** Mostra o HTML da seção (resposta da Shopify) e lê o status traduzido que ela traz. */
  show(html) {
    const doc = parseHTML(html);
    const section = getSectionElement(doc, this.sectionId);
    const nodes = section ? Array.from(section.childNodes, (node) => document.importNode(node, true)) : [];
    this.results.replaceChildren(...nodes);
    const root = this.results.querySelector('[data-predictive-search-root]');
    this.setStatus(root ? root.dataset.status : '');
  }

  async update() {
    const term = normalizeTerm(this.input.value);
    if (term === this.shownTerm) return;
    if (this.controller) this.controller.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.results.setAttribute('aria-busy', 'true');
    if (term) this.setStatus(getString('searchLoading'));

    try {
      let html;
      if (term) {
        ({ html } = await sugerir(term, {
          signal: controller.signal,
          sectionId: this.sectionId,
          limit: this.dataset.limit,
          resources: this.dataset.resources,
          url: this.dataset.url,
        }));
      } else {
        if (this.popularHTML === null) {
          const searchUrl = this.dataset.searchUrl || getConfig().routes.search;
          this.popularHTML = await renderSection(searchUrl, this.sectionId, { signal: controller.signal });
        }
        html = this.popularHTML;
      }
      if (controller.signal.aborted) return;
      this.show(html);
      this.shownTerm = term;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      this.results.replaceChildren();
      this.setStatus('');
      this.shownTerm = null;
    } finally {
      if (this.controller === controller) this.results.removeAttribute('aria-busy');
    }
  }
}

if (!customElements.get('predictive-search')) {
  customElements.define('predictive-search', PredictiveSearch);
}
