// O que a casca de computador decide sem precisar do Electron: qual arquivo do build
// responde a um endereço `app://study-pets/...`, e qual endereço fica DENTRO do app.
// Puro (só `node:path`) de propósito — é o que deixa o Vitest da raiz cobrar as duas
// regras sem instalar o Electron. Ver "App de computador (Windows)" no CLAUDE.md.

const path = require('node:path');

/** O esquema próprio do app. Uma origem só, estável: é ela que guarda o login e o cache. */
const APP_SCHEME = 'app';
const APP_HOST = 'study-pets';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * O arquivo do build que responde a este caminho de URL, ou `null` se o caminho tenta
 * sair da pasta do build. `/` (e qualquer pasta) vira o `index.html` dela.
 */
function resolveAppPath(root, urlPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null; // sequência % quebrada
  }
  if (decoded.includes('\0')) return null;
  // Barra invertida é separador no Windows: tratada como barra antes de normalizar,
  // senão `..\..\segredo` passaria por um segmento só.
  const rel = path.posix.normalize('/' + decoded.replace(/\\/g, '/'));
  const base = path.resolve(root);
  const file = path.resolve(base, '.' + rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return rel.endsWith('/') ? path.join(file, 'index.html') : file;
}

/** Este endereço é do próprio app (e pode ser carregado na janela)? */
function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST;
  } catch {
    return false;
  }
}

/**
 * Este endereço pode ser entregue ao navegador do sistema? Só http(s) e mailto —
 * `file:`, `javascript:` e esquemas de outros apps nunca saem daqui.
 */
function isExternalUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

module.exports = { APP_SCHEME, APP_HOST, APP_ORIGIN, resolveAppPath, isAppUrl, isExternalUrl };
