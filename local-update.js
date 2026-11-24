// "Updates" button for the downloaded copy of the game. It does nothing on the hosted website: it only
// appears when the page is served by server.py on this computer (localhost).
(function () {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  const button = document.createElement('button');
  button.textContent = 'Updates';
  button.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99999;padding:6px 10px;border-radius:8px;' +
    'border:1px solid rgba(255,255,255,.3);background:rgba(10,14,24,.85);color:#fff;font:12px system-ui,sans-serif;cursor:pointer';
  document.body.appendChild(button);
  let state = 'idle';

  async function check() {
    button.textContent = 'Checking...';
    try {
      const info = await (await fetch('/__update-check')).json();
      if (info.error) { button.textContent = 'Updates (offline)'; state = 'idle'; return; }
      if (info.available) { button.textContent = 'Update now'; state = 'ready'; }
      else { button.textContent = 'Up to date'; state = 'idle'; }
    } catch (error) {
      button.textContent = 'Updates (not available here)';
      state = 'idle';
    }
  }

  async function apply() {
    button.textContent = 'Updating...';
    try {
      const response = await fetch('/__update', { method: 'POST', headers: { 'X-Road-To-Pro': 'update' } });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error);
      button.textContent = 'Updated, reloading';
      setTimeout(() => location.reload(), 600);
    } catch (error) {
      button.textContent = 'Update failed';
      state = 'idle';
    }
  }

  button.addEventListener('click', () => (state === 'ready' ? apply() : check()));
  check();
})();
