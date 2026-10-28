/**
 * Beacon Labs · video-reel.js (<video-reel>)
 *
 * Card de vídeo 9:16 da seção "Quem usa, mostra" (sections/video-reels.liquid).
 * Carregado pela própria seção (<script type="module">).
 *
 * O vídeo só é carregado no clique: o <video> gerado pelo Liquid (video_tag) fica dentro de um
 * <template>, cujo conteúdo é inerte (o navegador não baixa nada). Ao apertar o play, o conteúdo
 * do <template> é clonado para dentro de um <dialog> e o vídeo começa a tocar, com controles.
 *
 * Estrutura:
 *   <video-reel>
 *     <button type="button" aria-haspopup="dialog" data-video-reel-open>…</button>
 *     <dialog aria-label="…" data-video-reel-dialog>
 *       <button type="button" data-video-reel-close>…</button>
 *       <div data-video-reel-player></div>
 *     </dialog>
 *     <template data-video-reel-template><video …></video></template>
 *   </video-reel>
 *
 * O <dialog> abre com openModal() de global.js (showModal): foco preso, Esc fecha, fundo inerte,
 * rolagem travada e, ao fechar, o foco volta ao botão de play. Clique no fundo também fecha.
 * Ao fechar, o vídeo é pausado e removido (na próxima abertura ele é clonado de novo).
 *
 * Segurança: o único HTML inserido é o clone do <template> renderizado pelo Liquid
 * (saída do filtro video_tag da Shopify). Nada de innerHTML nem de texto do visitante.
 */

import { openModal, closeModal } from '@theme/global';

export class VideoReel extends HTMLElement {
  connectedCallback() {
    this.openButton = this.querySelector('[data-video-reel-open]');
    this.dialog = this.querySelector('[data-video-reel-dialog]');
    this.player = this.querySelector('[data-video-reel-player]');
    this.template = this.querySelector('template[data-video-reel-template]');
    if (!this.openButton || !this.dialog || !this.player || !this.template) return;

    this.onOpenClick = (event) => {
      event.preventDefault();
      this.open();
    };
    this.onDialogClick = (event) => {
      const closeButton = event.target instanceof Element ? event.target.closest('[data-video-reel-close]') : null;
      if (!closeButton) return;
      event.preventDefault();
      closeModal(this.dialog);
    };
    this.onDialogClose = () => this.unload();

    this.openButton.addEventListener('click', this.onOpenClick);
    this.dialog.addEventListener('click', this.onDialogClick);
    this.dialog.addEventListener('close', this.onDialogClose);
  }

  disconnectedCallback() {
    if (this.openButton && this.onOpenClick) this.openButton.removeEventListener('click', this.onOpenClick);
    if (this.dialog) {
      if (this.onDialogClick) this.dialog.removeEventListener('click', this.onDialogClick);
      if (this.onDialogClose) this.dialog.removeEventListener('close', this.onDialogClose);
      if (this.dialog.open) this.dialog.close();
    }
    if (this.player) this.player.replaceChildren();
  }

  open() {
    if (!this.player.querySelector('video')) {
      this.player.replaceChildren(this.template.content.cloneNode(true));
    }

    const closeButton = this.dialog.querySelector('[data-video-reel-close]');
    openModal(this.dialog, { opener: this.openButton, focusTarget: closeButton });

    const video = this.player.querySelector('video');
    if (!video) return;
    video.setAttribute('controls', '');
    video.setAttribute('playsinline', '');
    // O clique do visitante permite tocar com som; se o navegador recusar, os controles ficam à mão.
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }

  unload() {
    const video = this.player.querySelector('video');
    if (video) video.pause();
    this.player.replaceChildren();
  }
}

if (!customElements.get('video-reel')) {
  customElements.define('video-reel', VideoReel);
}
