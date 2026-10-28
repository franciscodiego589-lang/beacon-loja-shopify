/**
 * Beacon Labs · search.api.js (serviço de busca)
 *
 * Importe pelo apelido: import { sugerir, renderSection } from '@theme/search-api';
 *
 * sugerir(termo, { signal, sectionId, limit, resources, limitScope, unavailableProducts, url })
 *   Predictive Search API com Section Rendering:
 *   GET {routes.predictive_search_url}?q=...&resources[type]=...&resources[limit]=...
 *       &resources[limit_scope]=...&resources[options][unavailable_products]=...&section_id=...
 *   (shopify.dev/docs/api/ajax/reference/predictive-search, consultado em 27/09/2026)
 *   Devolve { term, html }. O termo é limpo e cortado em 80 caracteres antes de sair.
 *   Use um AbortController por digitação e passe o signal: a busca anterior é cancelada.
 *
 * renderSection(caminho, sectionId, { signal })
 *   HTML de uma seção renderizada numa página de busca ou coleção (filtros, ordenação,
 *   paginação): GET {caminho}&section_id=... Devolve o HTML (texto).
 */

import { getConfig, fetchConfig, SECTION_ID_PATTERN, isLocalPath } from '@theme/global';

export const MAX_TERM_LENGTH = 80;

const RESOURCE_TYPES = ['product', 'collection', 'article', 'page', 'query'];
const UNAVAILABLE_OPTIONS = ['show', 'hide', 'last'];

export class SearchError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SearchError';
    this.status = status;
  }
}

/** Remove espaços extras e caracteres de controle e limita a 80 caracteres. */
export function normalizeTerm(term) {
  return String(term ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERM_LENGTH)
    .trim();
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export async function sugerir(
  term,
  {
    signal,
    sectionId = 'predictive-search',
    limit = 6,
    resources = 'product,collection,article,page',
    limitScope = 'each',
    unavailableProducts = 'last',
    url,
  } = {}
) {
  const q = normalizeTerm(term);
  if (!q) return { term: '', html: '' };
  if (!SECTION_ID_PATTERN.test(String(sectionId))) throw new SearchError('Invalid section id');

  const types = String(resources)
    .split(',')
    .map((type) => type.trim())
    .filter((type, index, list) => RESOURCE_TYPES.includes(type) && list.indexOf(type) === index);

  const params = new URLSearchParams();
  params.set('q', q);
  params.set('resources[type]', (types.length ? types : ['product']).join(','));
  params.set('resources[limit]', String(clampInteger(limit, 1, 10, 6)));
  params.set('resources[limit_scope]', limitScope === 'all' ? 'all' : 'each');
  params.set(
    'resources[options][unavailable_products]',
    UNAVAILABLE_OPTIONS.includes(unavailableProducts) ? unavailableProducts : 'last'
  );
  params.set('section_id', sectionId);

  const base = isLocalPath(url) ? url : getConfig().routes.predictiveSearch;
  const response = await fetch(`${base}?${params.toString()}`, fetchConfig('html', { method: 'GET', signal }));
  if (!response.ok) throw new SearchError(`Predictive search failed (${response.status})`, response.status);
  return { term: q, html: await response.text() };
}

/**
 * HTML de uma seção numa página do próprio site (busca ou coleção), para filtros e ordenação.
 * O caminho precisa começar com "/" (nunca um endereço externo).
 */
export async function renderSection(path, sectionId, { signal } = {}) {
  if (!isLocalPath(path)) throw new SearchError('Invalid path');
  if (!SECTION_ID_PATTERN.test(String(sectionId))) throw new SearchError('Invalid section id');
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('section_id', sectionId);
  const response = await fetch(`${pathname}?${params.toString()}`, fetchConfig('html', { method: 'GET', signal }));
  if (!response.ok) throw new SearchError(`Section request failed (${response.status})`, response.status);
  return response.text();
}
