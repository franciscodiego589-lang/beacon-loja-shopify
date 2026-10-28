/**
 * Beacon Labs · <mega-menu> (mega-menu.js)
 *
 * Faixa de menu do cabeçalho no computador (sections/header.liquid).
 * Estrutura: li[data-mega-menu-item] > button[data-mega-menu-toggle][aria-expanded][aria-controls]
 *            + div.mega-menu__panel[data-mega-menu-panel][hidden]
 * - O botão abre e fecha o painel (atributo hidden) e troca aria-expanded.
 * - Abrir um painel fecha os outros.
 * - Fecha com Esc (o foco volta ao botão), com clique fora e quando o foco sai do item.
 * - Com mouse (hover: hover e pointer: fine), abre ao passar o cursor, com pequena espera.
 * - Seta para baixo no botão abre o painel e leva o foco ao primeiro link.
 */

const HOVER_QUERY = window.matchMedia('(hover: hover) and (pointer: fine)');
const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

class MegaMenu extends HTMLElement {
  connectedCallback() {
    this.items = Array.from(this.querySelectorAll('[data-mega-menu-item]')).filter((item) =>
      item.querySelector('[data-mega-menu-toggle]')
    );
    this.timers = new Map();

    this.onClick = (event) => {
      const toggle = event.target.closest('[data-mega-menu-toggle]');
      if (!toggle || !this.contains(toggle)) return;
      event.preventDefault();
      const item = toggle.closest('[data-mega-menu-item]');
      // Painel aberto pelo cursor: o primeiro clique mantém aberto em vez de fechar.
      if (item.dataset.hoverOpened === 'true' && this.isOpen(item)) {
        delete item.dataset.hoverOpened;
        return;
      }
      this.toggle(item, !this.isOpen(item));
    };
    this.onKeyDown = (event) => {
      if (event.key === 'Escape') {
        const item = this.openItem();
        if (!item) return;
        event.preventDefault();
        this.toggle(item, false);
        const toggle = item.querySelector('[data-mega-menu-toggle]');
        if (toggle) toggle.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        const toggle = event.target.closest('[data-mega-menu-toggle]');
        if (!toggle) return;
        event.preventDefault();
        const item = toggle.closest('[data-mega-menu-item]');
        this.toggle(item, true);
        const firstLink = item.querySelector('[data-mega-menu-panel] a[href]');
        if (firstLink) firstLink.focus();
      }
    };
    this.onFocusOut = (event) => {
      const item = event.target.closest('[data-mega-menu-item]');
      if (!item || !this.isOpen(item)) return;
      if (event.relatedTarget && item.contains(event.relatedTarget)) return;
      this.toggle(item, false);
    };
    this.onDocumentClick = (event) => {
      const item = this.openItem();
      if (item && !item.contains(event.target)) this.toggle(item, false);
    };
    this.onPointerEnter = (event) => {
      if (!HOVER_QUERY.matches || event.pointerType === 'touch') return;
      const item = event.currentTarget;
      this.clearTimer(item);
      this.timers.set(
        item,
        setTimeout(() => {
          if (!this.isOpen(item)) item.dataset.hoverOpened = 'true';
          this.toggle(item, true);
        }, OPEN_DELAY)
      );
    };
    this.onPointerLeave = (event) => {
      if (!HOVER_QUERY.matches || event.pointerType === 'touch') return;
      const item = event.currentTarget;
      this.clearTimer(item);
      // Não fecha se o foco de teclado está dentro do item.
      if (item.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return;
      this.timers.set(item, setTimeout(() => this.toggle(item, false), CLOSE_DELAY));
    };

    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeyDown);
    this.addEventListener('focusout', this.onFocusOut);
    document.addEventListener('click', this.onDocumentClick);
    this.items.forEach((item) => {
      item.addEventListener('pointerenter', this.onPointerEnter);
      item.addEventListener('pointerleave', this.onPointerLeave);
    });
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeyDown);
    this.removeEventListener('focusout', this.onFocusOut);
    document.removeEventListener('click', this.onDocumentClick);
    (this.items || []).forEach((item) => {
      item.removeEventListener('pointerenter', this.onPointerEnter);
      item.removeEventListener('pointerleave', this.onPointerLeave);
      this.clearTimer(item);
    });
  }

  clearTimer(item) {
    clearTimeout(this.timers.get(item));
    this.timers.delete(item);
  }

  isOpen(item) {
    const panel = item && item.querySelector('[data-mega-menu-panel]');
    return !!panel && !panel.hidden;
  }

  openItem() {
    return this.items.find((item) => this.isOpen(item)) || null;
  }

  toggle(item, open) {
    if (!item) return;
    const toggle = item.querySelector('[data-mega-menu-toggle]');
    const panel = item.querySelector('[data-mega-menu-panel]');
    if (!toggle || !panel) return;
    if (open) {
      this.items.forEach((other) => {
        if (other !== item) this.toggle(other, false);
      });
    }
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) delete item.dataset.hoverOpened;
  }
}

if (!customElements.get('mega-menu')) {
  customElements.define('mega-menu', MegaMenu);
}
