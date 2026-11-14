/**
 * Options Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const apiUrlInput = document.getElementById('api-url');
  const btnTest = document.getElementById('btn-test');
  const btnSave = document.getElementById('btn-save');
  const testResult = document.getElementById('test-result');
  const accountStatus = document.getElementById('account-status');

  // Load current values
  const { apiUrl = 'http://localhost:3000', user = null } = await chrome.storage.local.get(['apiUrl', 'user']);
  apiUrlInput.value = apiUrl;

  if (user) {
    accountStatus.innerHTML = `Connected as <strong>${user.name || user.username}</strong> (${user.plan_tier || 'pro'} plan)`;
  } else {
    accountStatus.textContent = 'Not paired with any user account. Open extension popup to connect.';
  }

  // Test connection
  btnTest.addEventListener('click', async () => {
    const rawUrl = apiUrlInput.value.trim().replace(/\/+$/, '');
    const cleanUrl = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`;
    btnTest.textContent = 'Testing...';

    try {
      const res = await fetch(`${cleanUrl}/extension/ping`);
      const data = await res.json();
      testResult.textContent = `✓ Successfully reached server (Status: ${data.status}, Version: ${data.version})`;
      testResult.className = 'alert alert-success';
      testResult.classList.remove('hidden');
    } catch (err) {
      testResult.textContent = `✗ Connection failed: ${err.message}. Ensure backend is running.`;
      testResult.className = 'alert alert-error';
      testResult.classList.remove('hidden');
    } finally {
      btnTest.textContent = 'Test Connection';
    }
  });

  // Save settings
  btnSave.addEventListener('click', async () => {
    let rawUrl = apiUrlInput.value.trim().replace(/\/+$/, '');
    if (!rawUrl) rawUrl = 'http://localhost:3000';
    await chrome.storage.local.set({ apiUrl: rawUrl });

    btnSave.textContent = 'Saved!';
    setTimeout(() => {
      btnSave.textContent = 'Save Settings';
    }, 1500);
  });
});
