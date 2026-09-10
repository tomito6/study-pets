// Ler um arquivo escolhido pelo usuário como texto. Atrás da porta como todo o
// resto do mundo externo: caso de uso chama isto, componente não.

/** Texto do arquivo, ou `null` se este navegador não sabe ler. */
export async function readFileText(file: Blob): Promise<string | null> {
  try {
    if (typeof file.text === 'function') return await file.text();
  } catch {
    return null;
  }
  if (typeof FileReader === 'undefined') return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}
