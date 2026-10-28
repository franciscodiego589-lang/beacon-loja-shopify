/**
 * Beacon Labs · <details-disclosure> (details-disclosure.js)
 *
 * Envolve um <details>. Comportamento:
 * - Esc dentro do <details> aberto fecha e devolve o foco ao <summary>.
 * - Com o atributo data-open-on-desktop (colunas do rodapé): no computador (a partir de 990 px)
 *   o <details> fica sempre aberto e o <summary> sai da ordem do Tab (é só um título);
 *   no celular vira acordeão, começando fechado. O Liquid entrega o <details> aberto,
 *   para que sem JS todos os links fiquem visíveis.
 */

import { MEDIA, onKeyUpEscape } from '@theme/global';

const desktopQuery = window.matchMedia(MEDIA.desktop);

class DetailsDisclosure extends HTMLElement {
  connectedCallback() {
    this.details = this.querySelector('details');
    if (!this.details) return;
    this.summary = this.details.querySelector(':scope > summary');

    this.onKeyUp = (event) => {
      // No computador, a coluna do rodapé fica sempre aberta: Esc não a fecha.
      if (this.hasAttribute('data-open-on-desktop') && desktopQuery.matches) return;
      onKeyUpEscape(event);
    };
    this.details.addEventListener('keyup', this.onKeyUp);

    if (this.hasAttribute('data-open-on-desktop')) {
      this.onSummaryClick = (event) => {
        if (desktopQuery.matches) event.preventDefault();
      };
      this.onMediaChange = () => this.sync();
      this.summary?.addEventListener('click', this.onSummaryClick);
      desktopQuery.addEventListener('change', this.onMediaChange);
      this.sync();
    }
  }

  disconnectedCallback() {
    this.details?.removeEventListener('keyup', this.onKeyUp);
    if (this.onSummaryClick) this.summary?.removeEventListener('click', this.onSummaryClick);
    if (this.onMediaChange) desktopQuery.removeEventListener('change', this.onMediaChange);
  }

  sync() {
    const desktop = desktopQuery.matches;
    this.details.open = desktop;
    if (!this.summary) return;
    if (desktop) {
      this.summary.setAttribute('tabindex', '-1');
    } else {
      this.summary.removeAttribute('tabindex');
    }
  }
}

if (!customElements.get('details-disclosure')) {
  customElements.define('details-disclosure', DetailsDisclosure);
}
