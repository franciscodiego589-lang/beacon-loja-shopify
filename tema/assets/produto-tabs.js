/**
 * Beacon Labs · <produto-tabs> (produto-tabs.js)
 *
 * Área produto. Abas simples, usadas por sections/product-reviews.liquid para separar
 * "Avaliações" e "Perguntas". Padrão WAI-ARIA de tabs:
 *   <produto-tabs>
 *     [role="tab"][aria-controls="ID"] ... (o botão ativo tem aria-selected="true")
 *     [role="tabpanel"][id="ID"] ...
 *   </produto-tabs>
 * - Clique numa aba mostra o painel ligado por aria-controls/id e esconde os outros.
 * - Setas esquerda/direita movem o foco (e a seleção) entre as abas, em laço; Home e End vão
 *   para a primeira e a última aba. Só a aba ativa fica na ordem do Tab (tabindex 0).
 */

class ProdutoTabs extends HTMLElement {
  connectedCallback() {
    this.tabs = Array.from(this.querySelectorAll('[role="tab"]'));
    if (this.tabs.length === 0) return;

    this.onClick = (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab || !this.tabs.includes(tab)) return;
      this.select(tab);
    };
    this.onKeydown = (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      const currentIndex = this.tabs.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      let nextIndex;
      if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = this.tabs.length - 1;
      } else {
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
      }
      event.preventDefault();
      this.select(this.tabs[nextIndex]);
      this.tabs[nextIndex].focus();
    };

    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeydown);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeydown);
  }

  select(tab) {
    this.tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.tabIndex = active ? 0 : -1;
      item.classList.toggle('is-active', active);
      const panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    });
  }
}

if (!customElements.get('produto-tabs')) {
  customElements.define('produto-tabs', ProdutoTabs);
}
