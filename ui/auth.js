// ui/auth.js - PIN-based auth screen to protect user's sacred logs
import { getAuthConfig, setAuthConfig, hashPin } from '../db.js';

let isAuthenticated = false;
let onAuthSuccess = null;

export function initAuth(onSuccess) {
  onAuthSuccess = onSuccess;
}

export function isAuthed() {
  return isAuthenticated;
}

export function setAuthed(val) {
  isAuthenticated = val;
}

// Always show the auth portal after splash. First launch creates a local PIN.
export async function checkAndGate() {
  if (isAuthenticated) return true;
  const config = await getAuthConfig();
  showAuthScreen(config);
  return false;
}

function showAuthScreen(config) {
  const authScreen = document.getElementById('auth-screen');
  if (!authScreen) return;

  authScreen.classList.remove('hidden');

  const isSetup = !config.enabled || !config.pinHash;
  const portal = authScreen.querySelector('.auth-portal');
  const titleEl = document.getElementById('auth-title');
  const subtitleEl = document.getElementById('auth-subtitle');
  const pinLabel = document.getElementById('auth-pin-label');
  const pinInput = document.getElementById('auth-pin-input');
  const confirmWrap = document.getElementById('auth-confirm-wrap');
  const confirmInput = document.getElementById('auth-confirm-input');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorEl = document.getElementById('auth-error');
  const skipBtn = document.getElementById('auth-skip-btn');
  const dzBtn = document.getElementById('auth-divinity-btn');

  titleEl.textContent = isSetup ? 'Create Sign-In PIN' : 'Sign In';
  subtitleEl.textContent = isSetup
    ? 'Choose a local PIN to protect your characters, chats, lore, media, and settings on this device.'
    : 'Enter your PIN to unlock your saved characters, chats, lore, media, and settings.';
  pinLabel.textContent = isSetup ? 'New PIN' : 'PIN';
  submitBtn.textContent = isSetup ? 'Create PIN & Sign In' : 'Sign In';
  confirmWrap.classList.toggle('hidden', !isSetup);
  if (skipBtn) skipBtn.classList.add('hidden');
  pinInput.setAttribute('autocomplete', isSetup ? 'new-password' : 'current-password');
  pinInput.value = '';
  if (confirmInput) confirmInput.value = '';
  errorEl.classList.add('hidden');
  requestAnimationFrame(() => pinInput.focus());

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    if (portal) {
      portal.style.animation = 'none';
      portal.offsetHeight;
      portal.style.animation = 'authShake 0.4s ease';
    }
  };

  const finishAuth = () => {
    isAuthenticated = true;
    authScreen.classList.add('hidden');
    if (onAuthSuccess) onAuthSuccess();
  };

  const tryAuth = async () => {
    const pin = pinInput.value.trim();
    const confirmPin = confirmInput?.value.trim() || '';

    if (!/^\d{4,8}$/.test(pin)) {
      showError('PIN must be 4-8 digits.');
      return;
    }

    if (isSetup) {
      if (pin !== confirmPin) {
        showError('PINs do not match.');
        return;
      }
      await setAuthConfig({ pinHash: hashPin(pin), enabled: true, updatedAt: Date.now() });
      finishAuth();
      return;
    }

    if (hashPin(pin) === config.pinHash) {
      finishAuth();
    } else {
      showError('Incorrect PIN. The gate remains sealed.');
      pinInput.value = '';
      if (confirmInput) confirmInput.value = '';
      pinInput.focus();
    }
  };

  submitBtn.onclick = () => { void tryAuth(); };
  pinInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isSetup && confirmInput && !confirmInput.value) confirmInput.focus();
      else void tryAuth();
    }
  };
  if (confirmInput) {
    confirmInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void tryAuth();
      }
    };
  }

  // Divinity Zone is always accessible
  if (dzBtn) {
    dzBtn.onclick = () => {
      window.__showDivinityZone?.();
    };
  }

  if (skipBtn) skipBtn.onclick = null;
}

// PIN Setup Modal (shown from Settings)
export function showPinSetupModal() {
  return new Promise(async (resolve) => {
    const config = await getAuthConfig();
    const modal = document.getElementById('modal-pin-setup');
    if (!modal) { resolve(false); return; }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const titleEl = modal.querySelector('.pin-modal-title');
    const currentRow = modal.querySelector('.pin-current-row');
    const currentInput = document.getElementById('pin-current');
    const newInput = document.getElementById('pin-new');
    const confirmInput = document.getElementById('pin-confirm');
    const errorEl = document.getElementById('pin-setup-error');
    const saveBtn = document.getElementById('pin-save-btn');
    const cancelBtn = document.getElementById('pin-cancel-btn');
    const removeBtn = document.getElementById('pin-remove-btn');

    errorEl.classList.add('hidden');
    newInput.value = '';
    confirmInput.value = '';

    if (config.enabled && config.pinHash) {
      titleEl.textContent = 'Change Sacred PIN';
      currentRow.classList.remove('hidden');
      currentInput.value = '';
      removeBtn.classList.remove('hidden');
    } else {
      titleEl.textContent = 'Set Sacred PIN';
      currentRow.classList.add('hidden');
      currentInput.value = '';
      removeBtn.classList.add('hidden');
    }

    const close = (result) => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      saveBtn.onclick = null;
      cancelBtn.onclick = null;
      removeBtn.onclick = null;
      resolve(result);
    };

    cancelBtn.onclick = () => close(false);

    removeBtn.onclick = async () => {
      await setAuthConfig({ pinHash: null, enabled: false });
      close(true);
    };

    saveBtn.onclick = async () => {
      const newPin = newInput.value.trim();
      const confirmPin = confirmInput.value.trim();

      if (newPin.length < 4 || newPin.length > 8) {
        errorEl.textContent = 'PIN must be 4-8 digits.';
        errorEl.classList.remove('hidden');
        return;
      }

      if (newPin !== confirmPin) {
        errorEl.textContent = 'PINs do not match.';
        errorEl.classList.remove('hidden');
        return;
      }

      // Verify current PIN if changing
      if (config.enabled && config.pinHash) {
        const currentPin = currentInput.value.trim();
        if (hashPin(currentPin) !== config.pinHash) {
          errorEl.textContent = 'Current PIN is incorrect.';
          errorEl.classList.remove('hidden');
          return;
        }
      }

      await setAuthConfig({ pinHash: hashPin(newPin), enabled: true });
      close(true);
    };
  });
}
