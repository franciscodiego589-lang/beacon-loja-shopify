/**
 * Beacon Labs · <related-products> (related-products.js)
 *
 * Produtos relacionados da página de produto (sections/related-products.liquid).
 * A Product Recommendations API da Shopify só existe pelo endpoint Ajax
 * (recommendations.api.js, shopify.dev/docs/api/ajax/reference/product-recommendations):
 * não há como pedir esses produtos de forma síncrona no carregamento da página (a mesma
 * limitação vale para o tema padrão da Shopify). Por isso esta seção nasce vazia e, ao entrar
 * na página, busca a si mesma pelo próprio id de seção (intent "related") e troca o conteúdo
 * pelo HTML devolvido, marcado com [data-related-products-loaded]. Sem produtos relacionados,
 * a seção continua vazia: nada é inventado.
 *
 * Segurança: o HTML injetado vem só da Section Rendering API da própria Shopify (parseHTML);
 * nenhum texto de usuário entra por innerHTML.
 */

import { getRecommendationsNode } from '@theme/recommendations-api';

class RelatedProducts extends HTMLElement {
  async connectedCallback() {
    const productId = this.dataset.productId;
    const sectionId = this.dataset.sectionId;
    const list = this.querySelector('[data-related-products-list]');
    if (!productId || !sectionId || !list) return;

    const loaded = await getRecommendationsNode(productId, '[data-related-products-loaded]', {
      sectionId,
      limit: Number.parseInt(this.dataset.limit, 10) || 4,
      intent: 'related',
    });
    if (!loaded) return;
    list.replaceChildren(loaded);
  }
}

if (!customElements.get('related-products')) {
  customElements.define('related-products', RelatedProducts);
}
