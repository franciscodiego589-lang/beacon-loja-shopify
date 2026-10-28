/*
  Beacon Labs · <conta-country-province> (área conta)

  Liga o seletor de país ao de estado no formulário de endereço
  (snippets/conta-address-fields.liquid).

  - Cada <option> de país vem do all_country_option_tags da Shopify, com o atributo
    data-provinces: uma lista JSON de pares [valor, rótulo]. Lista vazia = país sem estados.
  - Marca o país salvo (data-default) comparando com o valor ou com o texto da opção.
  - Monta as opções de estado com createElement e textContent (nunca innerHTML).
  - País sem estados: esconde o campo de estado e o desabilita (não é enviado).
  - País com estados: o estado passa a ser obrigatório e o asterisco do rótulo aparece.
*/

class ContaCountryProvince extends HTMLElement {
  constructor() {
    super();
    this.handleCountryChange = this.handleCountryChange.bind(this);
  }

  connectedCallback() {
    this.countrySelect = this.querySelector('[data-country-select]');
    this.provinceSelect = this.querySelector('[data-province-select]');
    this.provinceField = this.querySelector('[data-province-field]');
    this.provinceMark = this.querySelector('[data-province-required]');
    if (!this.countrySelect || !this.provinceSelect) return;

    ContaCountryProvince.selectByValueOrText(this.countrySelect, this.countrySelect.dataset.default);
    this.renderProvinces(this.provinceSelect.dataset.default);
    this.countrySelect.addEventListener('change', this.handleCountryChange);
  }

  disconnectedCallback() {
    if (this.countrySelect) this.countrySelect.removeEventListener('change', this.handleCountryChange);
  }

  handleCountryChange() {
    this.renderProvinces('');
  }

  static selectByValueOrText(select, wanted) {
    if (!select || !wanted) return false;
    const target = String(wanted).trim().toLowerCase();
    if (!target) return false;
    for (const option of select.options) {
      if (option.value.trim().toLowerCase() === target || option.textContent.trim().toLowerCase() === target) {
        select.value = option.value;
        return true;
      }
    }
    return false;
  }

  static readProvinces(option) {
    if (!option) return [];
    try {
      const parsed = JSON.parse(option.getAttribute('data-provinces') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  renderProvinces(defaultProvince) {
    const selectedCountry = this.countrySelect.options[this.countrySelect.selectedIndex];
    const provinces = ContaCountryProvince.readProvinces(selectedCountry);

    this.provinceSelect.replaceChildren();

    if (provinces.length === 0) {
      this.provinceSelect.disabled = true;
      this.provinceSelect.required = false;
      if (this.provinceMark) this.provinceMark.hidden = true;
      if (this.provinceField) this.provinceField.hidden = true;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.dataset.provincePlaceholder || '';
    this.provinceSelect.append(placeholder);

    for (const entry of provinces) {
      if (!Array.isArray(entry) || entry.length === 0) continue;
      const option = document.createElement('option');
      option.value = String(entry[0]);
      option.textContent = String(entry.length > 1 ? entry[1] : entry[0]);
      this.provinceSelect.append(option);
    }

    this.provinceSelect.disabled = false;
    this.provinceSelect.required = true;
    if (this.provinceMark) this.provinceMark.hidden = false;
    if (this.provinceField) this.provinceField.hidden = false;

    if (!ContaCountryProvince.selectByValueOrText(this.provinceSelect, defaultProvince)) {
      this.provinceSelect.value = '';
    }
  }
}

if (!customElements.get('conta-country-province')) {
  customElements.define('conta-country-province', ContaCountryProvince);
}
