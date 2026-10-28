/**
 * Beacon Labs · popup-cupom.js (<popup-cupom>)
 *
 * Janela de cadastro com o cupom de boas-vindas (sections/popup-cupom.liquid, grupo do rodapé).
 * Carregado pela própria seção (<script type="module">).
 *
 * Estados (atributo data-state, escrito pela Liquid):
 *   form     formulário de e-mail; abre uma vez, depois do atraso (data-delay, em segundos).
 *   success  envio feito (?customer_posted=true): abre já, com o código em destaque.
 *   error    a Shopify devolveu erro no envio: abre já, com a mensagem.
 *
 * Quando o estado é "form", a janela só abre se TODAS estas condições valerem:
 *   - o localStorage funciona (sem ele não dá para lembrar que a pessoa fechou: não abre);
 *   - a pessoa não fechou nem se cadastrou nos últimos data-days dias;
 *   - a página não é carrinho, conta, senha, busca, cartão-presente nem a de erro 404;
 *   - não há outro <dialog> aberto (gaveta do carrinho, menu, busca) nem rolagem travada;
 *   - a aba está visível e a pessoa não está digitando num campo.
 * Se algo bloquear na hora, tenta de novo a cada 4 segundos, no máximo 20 vezes.
 *
 * O <dialog> abre com openModal() de global.js (showModal): foco preso, Esc fecha, fundo inerte,
 * rolagem travada, clique no fundo fecha e, ao fechar, o foco volta a quem estava ativo.
 *
 * Segurança: nenhum HTML é montado por texto. Os textos de feedback vêm de atributos data-* que a
 * Liquid escreveu e entram por textContent.
 */

import { openModal, closeModal } from '@theme/global';

const STORAGE_KEY = 'beacon:popup-cupom';
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 4000;
const RETRY_MAX = 20;
const COPY_FEEDBACK_MS = 2500;
const BLOCKED_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:\d+\/)?(?:cart|account|search|password|challenge|checkouts|gift_cards)(?:\/|$)/i;

function storageWorks() {
  try {
    const probe = `${STORAGE_KEY}:teste`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (error) {
    return false;
  }
}

function recentlyDismissed(days) {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 && Date.now() - stored < days * DAY_MS;
  } catch (error) {
    return true;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch (error) {
    /* sem localStorage: a janela também não abre no estado "form" */
  }
}

function isTyping() {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return active.matches('input, textarea, select, [contenteditable="true"]');
}

if (!customElements.get('popup-cupom')) {
  class PopupCupom extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('[data-popup-cupom-dialog]');
      if (!this.dialog) return;

      this.closeButton = this.querySelector('[data-popup-cupom-close]');
      this.copyButton = this.querySelector('[data-popup-cupom-copy]');
      this.copyLabel = this.querySelector('[data-popup-cupom-copy-label]');
      this.codeElement = this.querySelector('[data-popup-cupom-code]');
      this.statusElement = this.querySelector('[data-popup-cupom-status]');
      this.form = this.querySelector('form');
      this.days = Math.max(1, Number(this.dataset.days) || 30);
      this.delay = Math.max(0, Number(this.dataset.delay) || 12);
      this.state = this.dataset.state || 'form';
      this.attempts = 0;
      this.timer = null;
      this.copyTimer = null;

      this.onCloseClick = () => closeModal(this.dialog);
      this.onDialogClose = () => markDismissed();
      this.onCopyClick = () => this.copyCode();
      this.onSubmit = () => markDismissed();
      this.onSectionSelect = (event) => {
        if (event.target.contains(this) || this.contains(event.target)) this.openNow();
      };
      this.onSectionDeselect = (event) => {
        if (event.target.contains(this) || this.contains(event.target)) closeModal(this.dialog);
      };

      if (this.closeButton) this.closeButton.addEventListener('click', this.onCloseClick);
      this.dialog.addEventListener('close', this.onDialogClose);
      if (this.copyButton) this.copyButton.addEventListener('click', this.onCopyClick);
      if (this.form) this.form.addEventListener('submit', this.onSubmit);
      // Editor de temas: selecionar a seção mostra a janela; sair dela fecha.
      document.addEventListener('shopify:section:select', this.onSectionSelect);
      document.addEventListener('shopify:section:deselect', this.onSectionDeselect);

      if (BLOCKED_PATH.test(window.location.pathname)) return;

      if (this.state === 'success' || this.state === 'error') {
        // Volta do envio: abre já. A página recarregada com o parâmetro não deve reabrir a janela de
        // sucesso, então o parâmetro sai do endereço.
        if (this.state === 'success') {
          markDismissed();
          this.cleanAddress();
        }
        window.requestAnimationFrame(() => this.openNow());
        return;
      }

      if (!storageWorks() || recentlyDismissed(this.days)) return;
      this.timer = window.setTimeout(() => this.tryOpen(), this.delay * 1000);
    }

    disconnectedCallback() {
      window.clearTimeout(this.timer);
      window.clearTimeout(this.copyTimer);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
      if (this.closeButton && this.onCloseClick) this.closeButton.removeEventListener('click', this.onCloseClick);
      if (this.copyButton && this.onCopyClick) this.copyButton.removeEventListener('click', this.onCopyClick);
      if (this.form && this.onSubmit) this.form.removeEventListener('submit', this.onSubmit);
      if (this.dialog) {
        if (this.onDialogClose) this.dialog.removeEventListener('close', this.onDialogClose);
        if (this.dialog.open) this.dialog.close();
      }
    }

    isFree() {
      if (document.visibilityState !== 'visible') return false;
      if (document.querySelector('dialog[open]')) return false;
      if (document.documentElement.classList.contains('scroll-locked')) return false;
      return !isTyping();
    }

    tryOpen() {
      if (!this.isConnected || this.dialog.open) return;
      if (recentlyDismissed(this.days)) return;
      if (this.isFree()) {
        this.openNow();
        return;
      }
      this.attempts += 1;
      if (this.attempts < RETRY_MAX) this.timer = window.setTimeout(() => this.tryOpen(), RETRY_MS);
    }

    openNow() {
      if (!this.dialog || this.dialog.open) return;
      // Em tela de toque o foco inicial vai ao botão de fechar: focar o campo de e-mail abriria o
      // teclado na hora e esconderia metade da folha.
      const touch = window.matchMedia('(pointer: coarse)').matches;
      const field = touch ? null : this.querySelector('input[type="email"]');
      const focusTarget = field || this.copyButton || this.closeButton || null;
      openModal(this.dialog, { focusTarget });
    }

    cleanAddress() {
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('customer_posted')) return;
        url.searchParams.delete('customer_posted');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (error) {
        /* o endereço fica como está */
      }
    }

    selectCode() {
      if (!this.codeElement) return;
      const range = document.createRange();
      range.selectNodeContents(this.codeElement);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    async copyCode() {
      if (!this.codeElement) return;
      const code = this.codeElement.textContent.trim();
      let copied = false;
      try {
        await window.navigator.clipboard.writeText(code);
        copied = true;
      } catch (error) {
        try {
          this.selectCode();
          copied = document.execCommand('copy');
        } catch (fallbackError) {
          copied = false;
        }
      }
      if (!copied) this.selectCode();
      this.showCopyResult(copied);
    }

    showCopyResult(copied) {
      const message = copied ? this.dataset.copied : this.dataset.copyFailed;
      if (this.statusElement) this.statusElement.textContent = message || '';
      if (copied && this.copyLabel) {
        this.copyLabel.textContent = this.dataset.copied || '';
        window.clearTimeout(this.copyTimer);
        this.copyTimer = window.setTimeout(() => {
          if (this.copyLabel) this.copyLabel.textContent = this.dataset.copyLabel || '';
          if (this.statusElement) this.statusElement.textContent = '';
        }, COPY_FEEDBACK_MS);
      }
    }
  }

  customElements.define('popup-cupom', PopupCupom);
}
