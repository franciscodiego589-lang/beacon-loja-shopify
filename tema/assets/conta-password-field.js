/*
  Beacon Labs · <conta-password-field> (área conta)

  Mostra e oculta a senha de um campo. Marcação (snippets/conta-password-field.liquid):
    <conta-password-field>
      <input type="password" ...>
      <button type="button" data-password-toggle aria-pressed="false" hidden>...</button>
    </conta-password-field>

  - O botão nasce com hidden e só aparece quando este módulo roda.
  - Botão de alternância: rótulo fixo ("Mostrar senha") e aria-pressed indicando o estado.
  - Antes de enviar o formulário, o campo volta a ser type="password", para o navegador
    tratar o valor como senha.
  - Sem fetch, sem innerHTML.
*/

class ContaPasswordField extends HTMLElement {
  constructor() {
    super();
    this.handleToggle = this.handleToggle.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  connectedCallback() {
    this.input = this.querySelector('input');
    this.toggle = this.querySelector('[data-password-toggle]');
    if (!this.input || !this.toggle) return;

    this.form = this.input.form;
    this.toggle.hidden = false;
    this.toggle.addEventListener('click', this.handleToggle);
    if (this.form) this.form.addEventListener('submit', this.handleSubmit);
  }

  disconnectedCallback() {
    if (this.toggle) this.toggle.removeEventListener('click', this.handleToggle);
    if (this.form) this.form.removeEventListener('submit', this.handleSubmit);
  }

  handleToggle() {
    const willShow = this.input.type === 'password';
    this.setVisible(willShow);
  }

  handleSubmit() {
    this.setVisible(false);
  }

  setVisible(visible) {
    this.input.type = visible ? 'text' : 'password';
    this.toggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }
}

if (!customElements.get('conta-password-field')) {
  customElements.define('conta-password-field', ContaPasswordField);
}
