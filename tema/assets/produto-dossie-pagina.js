/**
 * Beacon Labs · botão "Salvar dossiê em PDF" (produto-dossie-pagina.js)
 *
 * Página do dossiê técnico (sections/produto-dossie-pagina.liquid, /products/x?view=dossie).
 * O botão nasce com o atributo hidden (sem JavaScript ele não faria nada) e é mostrado aqui.
 * Ao clicar, abre a janela de impressão do navegador, onde a pessoa escolhe "Salvar como PDF".
 * O CSS de impressão (assets/component-produto-dossie.css) esconde cabeçalho, rodapé e botões.
 * Não lê nem grava dado nenhum.
 */

const buttons = document.querySelectorAll('[data-dossie-print]');

buttons.forEach((button) => {
  button.hidden = false;
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-dossie-print]')) return;
  window.print();
});
