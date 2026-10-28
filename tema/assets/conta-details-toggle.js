/*
  Beacon Labs · <conta-details-toggle> (área conta)

  Usado em sections/main-addresses.liquid, em volta de um <details-disclosure> (fundação)
  que envolve um <details>. O Esc já fecha o <details> e devolve o foco ao <summary>, pelo
  details-disclosure.js da fundação; este elemento cobre só o clique no botão "Cancelar"
  ([data-details-close]) dentro do painel, que faz a mesma coisa.

  Um listener só, por delegação (clique em qualquer [data-details-close] do seu interior).
  Sem fetch, sem innerHTML.
*/

class ContaDetailsToggle extends HTMLElement {
  constructor() {
    super();
    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
  }

  handleClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-details-close]') : null;
    if (!button || !this.contains(button)) return;

    const details = button.closest('details');
    if (!details) return;

    const summary = details.querySelector(':scope > summary');
    details.open = false;
    if (summary) summary.focus();
  }
}

if (!customElements.get('conta-details-toggle')) {
  customElements.define('conta-details-toggle', ContaDetailsToggle);
}
