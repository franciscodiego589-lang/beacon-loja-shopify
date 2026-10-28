/**
 * Beacon Labs · recommendations.api.js (serviço de recomendações)
 *
 * Importe pelo apelido:
 *   import { getRecommendations, getRecommendationsNode } from '@theme/recommendations-api';
 *
 * Product Recommendations API com Section Rendering
 * (shopify.dev/docs/api/ajax/reference/product-recommendations, consultado em 27/09/2026):
 *   GET {routes.product_recommendations_url}?product_id=...&limit=...&section_id=...&intent=...
 * - product_id: obrigatório
 * - limit: 1 a 10 (padrão da Shopify: 10)
 * - section_id: obrigatório para receber HTML
 * - intent: 'related' ou 'complementary'
 * Devolve o HTML (texto) da seção renderizada com o objeto recommendations.
 * Produto inexistente ou fora da loja virtual (404) devolve texto vazio.
 */

import { getConfig, fetchConfig, parseHTML, SECTION_ID_PATTERN, isLocalPath } from '@theme/global';

const INTENTS = ['related', 'complementary'];

export class RecommendationsError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'RecommendationsError';
    this.status = status;
  }
}

export async function getRecommendations(productId, { sectionId, limit = 4, intent = 'related', url, signal } = {}) {
  const id = String(productId ?? '').replace(/\D/g, '');
  if (!id) return '';
  if (!SECTION_ID_PATTERN.test(String(sectionId || ''))) throw new RecommendationsError('Invalid section id');

  const params = new URLSearchParams();
  params.set('product_id', id);
  params.set('limit', String(Math.min(10, Math.max(1, Number.parseInt(limit, 10) || 4))));
  params.set('section_id', sectionId);
  params.set('intent', INTENTS.includes(intent) ? intent : 'related');

  const base = isLocalPath(url) ? url.split('?')[0] : getConfig().routes.productRecommendations;
  const response = await fetch(`${base}?${params.toString()}`, fetchConfig('html', { method: 'GET', signal }));
  if (response.status === 404) return '';
  if (!response.ok) throw new RecommendationsError(`Recommendations failed (${response.status})`, response.status);
  return response.text();
}

/**
 * Pede a seção de recomendações e devolve o nó [selector] do HTML (a marcação da seção com os
 * produtos, ex.: '[data-related-products-loaded]') já importado para este documento, pronto
 * para inserir. Sem resultado, com 404 ou com erro de rede: null (nada é inventado).
 * Antes cada componente (cart-drawer, combo-offer e related-products) repetia este trecho.
 */
export async function getRecommendationsNode(productId, selector, options = {}) {
  let html = '';
  try {
    html = await getRecommendations(productId, options);
  } catch (error) {
    html = '';
  }
  const node = html ? parseHTML(html).querySelector(selector) : null;
  return node ? document.importNode(node, true) : null;
}
