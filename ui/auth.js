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

// Check if PIN is configured; if yes, show auth gate; if no, proceed
export async function checkAndGate() {
  const config = await getAuthConfig();

  if (!config.enabled || !config.pinHash) {
    // No PIN set — open access
    isAuthenticated = true;
    return true;
  }

  // PIN is set — show auth screen
  showAuthScreen(config);
  return false;
}

function showAuthScreen(config) {
  const authScreen = document.getElementById('auth-screen');
  if (!authScreen) return;

  authScreen.classList.remove('hidden');

  const pinInput = document.getElementById('auth-pin-input');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorEl = document.getElementById('auth-error');
  const skipBtn = document.getElementById('auth-skip-btn');
  const dzBtn = document.getElementById('auth-divinity-btn');

  pinInput.value = '';
  errorEl.classList.add('hidden');
  pinInput.focus();

  const tryAuth = () => {
    const pin = pinInput.value.trim();
    if (!pin) {
      errorEl.textContent = 'Enter your sacred PIN.';
      errorEl.classList.remove('hidden');
      return;
    }

    const hash = hashPin(pin);
    if (hash === config.pinHash) {
      isAuthenticated = true;
      authScreen.classList.add('hidden');
      if (onAuthSuccess) onAuthSuccess();
    } else {
      errorEl.textContent = 'Incorrect PIN. The gate remains sealed.';
      errorEl.classList.remove('hidden');
      pinInput.value = '';
      pinInput.focus();
      // Shake animation
      pinInput.parentElement.style.animation = 'none';
      pinInput.parentElement.offsetHeight;
      pinInput.parentElement.style.animation = 'authShake 0.4s ease';
    }
  };

  submitBtn.onclick = tryAuth;
  pinInput.onkeydown = (e) => {
    if (e.key === 'Enter') tryAuth();
  };

  // Divinity Zone is always accessible
  if (dzBtn) {
    dzBtn.onclick = () => {
      window.__showDivinityZone?.();
    };
  }

  // Skip button (for users who forgot PIN - clears auth)
  if (skipBtn) {
    skipBtn.onclick = async () => {
      if (!confirm('This will remove your PIN protection. Your data stays intact. Continue?')) return;
      await setAuthConfig({ pinHash: null, enabled: false });
      isAuthenticated = true;
      authScreen.classList.add('hidden');
      if (onAuthSuccess) onAuthSuccess();
    };
  }
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
