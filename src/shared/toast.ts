// Toast simples, um por vez, no rodapé. Utilitário de DOM compartilhado entre React e legado.

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  if (typeof document === 'undefined') return; // testes em Node: sem DOM, sem toast
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText =
      'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 18px;font-size:13px;color:var(--text);z-index:500;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast!.style.opacity = '0';
  }, 2500);
}
