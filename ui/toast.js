// ui/toast.js - Simple toast notifications
let toastEl = null;
let timeout = null;

export function showToast(message, type = 'default') {
  if (!toastEl) {
    toastEl = document.getElementById('toast');
    if (!toastEl) return;
  }

  const options = typeof type === 'object' && type !== null ? type : { type };
  const toastType = options.type || 'default';
  const actions = Array.isArray(options.actions) ? options.actions : [];

  clearTimeout(timeout);
  toastEl.innerHTML = '';
  toastEl.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-3xl px-6 py-3 text-sm shadow-2xl border 
    ${toastType === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-100' : 
      toastType === 'error' ? 'bg-red-900/90 border-red-700 text-red-100' : 
      'bg-slate-900 border-white/10 text-slate-200'}`;

  const text = document.createElement('span');
  text.textContent = message;
  toastEl.appendChild(text);

  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-3 rounded-xl border border-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/10';
    btn.textContent = action.label;
    btn.onclick = () => {
      hideToast();
      action.onClick?.();
    };
    toastEl.appendChild(btn);
  });

  toastEl.classList.remove('hidden');
  toastEl.classList.add('flex', 'items-center', 'justify-center', 'gap-2');

  timeout = setTimeout(() => {
    toastEl.classList.add('hidden');
    toastEl.classList.remove('flex');
  }, options.duration || (actions.length ? 9000 : 3200));
}

export function hideToast() {
  if (toastEl) toastEl.classList.add('hidden');
}
