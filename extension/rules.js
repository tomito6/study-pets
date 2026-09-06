// A parte pura da extensão: dado o estado do hardcore que o app mandou, quais
// regras do declarativeNetRequest aplicar, e se uma URL aberta cai no bloqueio.
// Sem `chrome.*` aqui — é o que o Vitest testa (tests/extension-rules.test.ts).
//
// Só navegação de página inteira (`main_frame`) é redirecionada: o objetivo é
// impedir de ABRIR o YouTube, não quebrar um site que embute um vídeo.

/** Domínios que nunca bloqueiam: o próprio app e o login do Google/Firebase (senão o app não abre no modo "permitir só estes"). */
export const ALWAYS_ALLOWED = ['plano-estudos-one.vercel.app', 'localhost', '127.0.0.1', 'accounts.google.com', 'googleapis.com', 'gstatic.com', 'firebaseapp.com'];

const BLOCKED_PAGE = '/blocked.html';

/** "https://www.youtube.com/watch" → "youtube.com". `null` se não é http(s). */
export function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** O host é o domínio ou um subdomínio dele ("m.youtube.com" cai em "youtube.com"). */
export const domainMatches = (host, site) => host === site || host.endsWith('.' + site);

/** Os domínios do app (o de produção e o de onde a página foi servida, se for outro). */
export function allowedFor(payload) {
  const extra = hostOf(payload.appUrl || '');
  return extra && !ALWAYS_ALLOWED.includes(extra) ? [...ALWAYS_ALLOWED, extra] : [...ALWAYS_ALLOWED];
}

/** Uma URL aberta agora cai no bloqueio deste estado? (Pra fechar abas que já estavam abertas.) */
export function isBlocked(url, payload) {
  if (!payload || !payload.active) return false;
  const host = hostOf(url);
  if (!host) return false;
  const allowed = allowedFor(payload);
  if (allowed.some((s) => domainMatches(host, s))) return false;
  const listed = (payload.sites || []).some((s) => domainMatches(host, s));
  return payload.mode === 'whitelist' ? !listed : listed;
}

/**
 * As regras dinâmicas pro estado. Lista negra: um redirect por site. Lista
 * branca: redirect de toda página http(s) (prioridade 1) com "allow" por cima
 * (prioridade 2) pros sites da lista e pros sempre permitidos.
 */
export function buildRules(payload) {
  if (!payload || !payload.active) return [];
  const redirect = { type: 'redirect', redirect: { extensionPath: BLOCKED_PAGE } };
  const main = ['main_frame'];
  const sites = payload.sites || [];
  if (payload.mode === 'whitelist') {
    const allow = [...allowedFor(payload), ...sites.filter((s) => !ALWAYS_ALLOWED.includes(s))];
    return [
      { id: 1, priority: 1, action: redirect, condition: { urlFilter: '|http', resourceTypes: main } },
      ...allow.map((site, i) => ({ id: 100 + i, priority: 2, action: { type: 'allow' }, condition: { requestDomains: [site], resourceTypes: main } })),
    ];
  }
  return sites.map((site, i) => ({ id: 1000 + i, priority: 1, action: redirect, condition: { requestDomains: [site], resourceTypes: main } }));
}
