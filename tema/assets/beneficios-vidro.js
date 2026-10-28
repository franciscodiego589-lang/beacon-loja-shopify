/**
 * Beacon Labs · beneficios-vidro.js
 *
 * Cards de benefício de vidro (assets/component-beneficios-vidro.css) que reagem ao mouse: grava no
 * card a posição do ponteiro (--bv-x, --bv-y, em %) e a inclinação (--bv-rx, --bv-ry, até 5 graus).
 * Só em aparelho com mouse e sem "reduzir movimento". Um quadro de animação por movimento.
 */
const comMouse = window.matchMedia('(hover: hover) and (pointer: fine)');
const reduz = window.matchMedia('(prefers-reduced-motion: reduce)');
const MAX = 5;
let quadro = 0;

function mover(event) {
  const card = event.target.closest('.dp-benefits--vidro .dp-benefit');
  if (!card || !comMouse.matches || reduz.matches) return;
  const { clientX, clientY } = event;
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(() => {
    const r = card.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    card.style.setProperty('--bv-x', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--bv-y', `${(y * 100).toFixed(1)}%`);
    card.style.setProperty('--bv-ry', `${((x - 0.5) * 2 * MAX).toFixed(2)}deg`);
    card.style.setProperty('--bv-rx', `${((0.5 - y) * 2 * MAX).toFixed(2)}deg`);
  });
}

function sair(event) {
  const card = event.target.closest('.dp-benefits--vidro .dp-benefit');
  if (!card) return;
  cancelAnimationFrame(quadro);
  card.style.setProperty('--bv-rx', '0deg');
  card.style.setProperty('--bv-ry', '0deg');
}

document.addEventListener('pointermove', mover, { passive: true });
document.addEventListener('pointerout', (event) => {
  const card = event.target.closest('.dp-benefits--vidro .dp-benefit');
  if (card && !card.contains(event.relatedTarget)) sair(event);
}, { passive: true });
