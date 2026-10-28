/**
 * Beacon Labs · comportamento do Liquid Glass (liquid-glass.js)
 *
 * Complementa assets/liquid-glass.css (spec docs/superpowers/specs/2026-09-27-liquid-glass-sistema.md,
 * seção 13, passo 4). Só mexe em classes e variáveis CSS; nunca em conteúdo nem em ARIA.
 *
 * 1. Adaptação ao fundo (D26): o botão de atendimento (.chat-button) recebe .is-over-dark (vira
 *    claro) enquanto um campo noite (.lg-field--noite) dentro de <main> passa por baixo dele. A
 *    barra de anúncio nunca é observada (ela não fica em <main>). O cabeçalho do redesenho v3 não
 *    fixa, não compacta e não adapta ao fundo: a classe que ligava isso (GlassHeader, sobre
 *    .lg-header[data-lg-sticky][data-lg-adapt]) saiu na etapa 8b da tarefa 8, depois de provar
 *    por busca no tema inteiro que nenhum elemento tem mais esses ganchos.
 * 2. Mega menu: grava em --lg-materialize-origin a posição do botão do item que abriu o painel,
 *    medida a partir da borda esquerda do cabeçalho (.site-header), que é onde o painel começa,
 *    para a materialização crescer a partir dele (spec 5.9).
 * 3. Contador da sacola: pulso de escala quando o número muda (o CSS desliga com movimento
 *    reduzido).
 * 4. Barra fixa de compra: o sticky-atc.js publica 'sticky-atc:change' (EVENTS.stickyAtcChange,
 *    detail { visible, height }) e ele mesmo põe .lg-has-sticky-atc no <html>; aqui o evento só
 *    faz o botão de atendimento ser medido de novo depois que ele sobe (contrato explícito, sem
 *    observar o atributo style do <html>).
 *
 * Editor de temas: quando o editor re-renderiza uma seção, ele dispara shopify:section:unload
 * (seção velha) e shopify:section:load (seção nova), com a seção em event.target (shopify.dev,
 * "Integrate sections and blocks with the theme editor", baixado em 28/09/2026). No unload, as
 * instâncias ligadas a elementos daquela seção são desligadas (observadores, temporizador e
 * ouvintes); no load, os elementos novos são ligados. Assim o botão de atendimento novo recebe
 * .is-over-dark sem recarregar a página.
 */

import { MEDIA, EVENTS, subscribe } from '@theme/global';

const DESKTOP = window.matchMedia(MEDIA.desktop);

/* ---------- 1. Botão de atendimento ---------- */

class GlassChat {
  constructor(button) {
    this.button = button;
    this.element = button;
    // Sem barra fixa ao carregar: o primeiro aviso "escondida" não precisa remedir o botão.
    this.lastOffset = 0;
    this.watch();
    this.unsubscribeSticky = subscribe(EVENTS.stickyAtcChange, (event) => {
      const { visible = false, height = 0 } = event.detail || {};
      const offset = visible ? height : 0;
      if (offset === this.lastOffset) return;
      this.lastOffset = offset;
      // A posição só muda depois da transição de "bottom" (section-footer.css); mede no fim.
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.watch(), 300);
    });
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.timer);
    this.unsubscribeSticky();
    if (this.observer) this.observer.disconnect();
  }

  watch() {
    if (this.destroyed) return;
    if (this.observer) this.observer.disconnect();
    const fields = document.querySelectorAll('main .lg-field--noite');
    if (!fields.length) {
      this.button.classList.remove('is-over-dark');
      return;
    }
    const rect = this.button.getBoundingClientRect();
    const top = Math.max(0, Math.round(rect.top));
    const bottom = Math.max(0, Math.round(window.innerHeight - rect.bottom));
    const over = new Set();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? over.add(entry.target) : over.delete(entry.target)));
        this.button.classList.toggle('is-over-dark', over.size > 0);
      },
      { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 }
    );
    fields.forEach((field) => this.observer.observe(field));
  }
}

/* ---------- 2. Origem da materialização do mega menu ---------- */

function setMegaMenuOrigin(event) {
  const toggle = event.target instanceof Element ? event.target.closest('[data-mega-menu-toggle]') : null;
  if (!toggle) return;
  const panel = document.getElementById(toggle.getAttribute('aria-controls') || '');
  // O painel se posiciona pelo cabeçalho (.site-header) e tem a largura dele (section-header.css:
  // left e right em 0), então a origem é medida a partir da borda esquerda do cabeçalho. Medir
  // pelo .site-nav, que começa depois do logo, deixava a origem uns 181 px à esquerda do botão.
  const header = toggle.closest('.site-header');
  if (!panel || !header) return;
  const toggleRect = toggle.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const x = Math.round(toggleRect.left + toggleRect.width / 2 - headerRect.left);
  panel.style.setProperty('--lg-materialize-origin', `${x}px 0`);
}

/* ---------- 3. Pulso do contador da sacola ---------- */

function watchCartCount(counter) {
  let last = counter.textContent.trim();
  const observer = new MutationObserver(() => {
    const value = counter.textContent.trim();
    if (value === last) return;
    last = value;
    counter.classList.remove('is-pulse');
    // Reinicia a animação: a leitura de offsetWidth aplica a remoção antes de recolocar.
    void counter.offsetWidth;
    counter.classList.add('is-pulse');
  });
  observer.observe(counter, { childList: true, characterData: true, subtree: true });
  const onAnimationEnd = () => counter.classList.remove('is-pulse');
  counter.addEventListener('animationend', onAnimationEnd);
  return {
    element: counter,
    destroy() {
      observer.disconnect();
      counter.removeEventListener('animationend', onAnimationEnd);
    },
  };
}

/* ---------- Início ---------- */

function init() {
  const chats = [];
  const counters = [];
  const lists = [chats, counters];

  /** Liga os elementos dentro de root (o documento ao carregar, a seção nova no editor). */
  const bind = (root) => {
    root.querySelectorAll('.chat-button.glass').forEach((button) => chats.push(new GlassChat(button)));
    root.querySelectorAll('[data-cart-count]').forEach((counter) => counters.push(watchCartCount(counter)));
  };

  /** Desliga as instâncias cujo elemento está dentro de root, ou já saiu do documento. */
  const unbind = (root) => {
    lists.forEach((list) => {
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const { element } = list[index];
        if (!element.isConnected || (root && root.contains(element))) {
          list[index].destroy();
          list.splice(index, 1);
        }
      }
    });
  };

  bind(document);

  document.addEventListener('shopify:section:unload', (event) => {
    if (event.target instanceof Element) unbind(event.target);
  });
  document.addEventListener('shopify:section:load', (event) => {
    if (!(event.target instanceof Element)) return;
    unbind(null);
    bind(event.target);
    // A seção pode ter trazido ou levado um campo noite: os observadores de fundo são refeitos.
    chats.forEach((chat) => chat.watch());
  });

  let resizeTimer = null;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      chats.forEach((chat) => chat.watch());
    }, 150);
  };
  window.addEventListener('resize', onResize);
  // Safari anterior ao 14 só tem addListener no MediaQueryList.
  if (typeof DESKTOP.addEventListener === 'function') DESKTOP.addEventListener('change', onResize);
  else if (typeof DESKTOP.addListener === 'function') DESKTOP.addListener(onResize);

  ['pointerover', 'focusin', 'click'].forEach((type) => document.addEventListener(type, setMegaMenuOrigin, true));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
