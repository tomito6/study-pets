// Baixar um arquivo pro dispositivo: Blob + <a download>. O DOM fica aqui, na
// infra — a camada de aplicação só entrega nome e conteúdo. Sem `document`
// (Node, testes), não faz nada e devolve false.

export function downloadText(filename: string, text: string, mime = 'application/json'): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // O browser já pegou o blob no clique; soltar a URL logo depois é seguro.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
