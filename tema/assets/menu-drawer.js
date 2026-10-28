/**
 * Beacon Labs · <menu-drawer> (menu-drawer.js)
 *
 * Gaveta de menu (snippets/menu-drawer.liquid): <menu-drawer id="MenuDrawer"> > <dialog>.
 * - Abre: [data-menu-drawer-open] (botão "Menu" do cabeçalho, fora do elemento).
 * - Fecha: [data-menu-drawer-close], clique no fundo e Esc (com animação de saída).
 * - Esc com um submenu aberto fecha primeiro o submenu e devolve o foco ao título dele.
 * - Ao abrir um submenu, os irmãos do mesmo nível fecham.
 * - Foco preso, fundo inerte e volta do foco ao botão: <dialog> modal + openModal/closeModal.
 */

import { openModal, closeModal } from '@theme/global';

class MenuDrawer extends HTMLElement {
  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    if (!this.dialog) return;

    this.onDocumentClick = (event) => {
      const opener = event.target.closest('[data-menu-drawer-open]');
      if (!opener) return;
      event.preventDefault();
      openModal(this.dialog, { opener });
    };
    this.onClick = (event) => {
      if (event.target.closest('[data-menu-drawer-close]')) {
        event.preventDefault();
        closeModal(this.dialog);
        return;
      }
      // Link para outra parte da mesma página: fecha a gaveta antes de rolar.
      const link = event.target.closest('a[href^="#"]');
      if (link && this.contains(link)) closeModal(this.dialog);
    };
    this.onToggle = (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const parentList = details.closest('ul');
      if (!parentList) return;
      parentList.querySelectorAll(':scope > li > details[open]').forEach((sibling) => {
        if (sibling !== details) sibling.open = false;
      });
    };
    this.onCancel = (event) => {
      event.preventDefault();
      const active = document.activeElement;
      const openDetails = active && active.closest ? active.closest('.menu-drawer__details[open]') : null;
      if (openDetails && this.dialog.contains(openDetails)) {
        openDetails.open = false;
        const summary = openDetails.querySelector(':scope > summary');
        if (summary) summary.focus();
        return;
      }
      closeModal(this.dialog);
    };

    document.addEventListener('click', this.onDocumentClick);
    this.addEventListener('click', this.onClick);
    this.addEventListener('toggle', this.onToggle, true);
    this.dialog.addEventListener('cancel', this.onCancel);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onDocumentClick);
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('toggle', this.onToggle, true);
    this.dialog?.removeEventListener('cancel', this.onCancel);
  }
}

if (!customElements.get('menu-drawer')) {
  customElements.define('menu-drawer', MenuDrawer);
}
