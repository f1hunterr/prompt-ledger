const STORAGE_KEY = 'serverUrl';
// Both replaced with real values by the server when downloaded via
// /extension.zip. Loading this folder unpacked straight from git leaves
// them untouched, so the setup screen still asks for a server address and
// the update check below never fires for a raw git checkout.
const BUNDLED_SERVER_URL = '__DEFAULT_SERVER_URL__';
const CURRENT_EXTENSION_VERSION = '__EXTENSION_VERSION__';

function normalizeUrl(raw) {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  return url.replace(/\/+$/, '');
}

function showSetup(prefill) {
  document.getElementById('setup').hidden = false;
  document.getElementById('bar').hidden = true;
  document.getElementById('frame').hidden = true;
  document.getElementById('frame').src = '';
  if (prefill) document.getElementById('urlInput').value = prefill;
  document.getElementById('urlInput').focus();
}

function showFrame(url) {
  document.getElementById('setup').hidden = true;
  document.getElementById('bar').hidden = false;
  const frame = document.getElementById('frame');
  frame.src = url;
  frame.hidden = false;
  document.getElementById('urlLabel').textContent = url.replace(/^https?:\/\//, '');
  checkForExtensionUpdate(url);
}

// Chrome has no update mechanism at all for a "Load unpacked" extension -
// this can only ever notify, never auto-install. Skipped entirely for a
// raw git checkout (CURRENT_EXTENSION_VERSION still the literal
// placeholder), since there's nothing meaningful to compare against.
const EXTENSION_UPDATE_CHECK_MS = 30 * 60 * 1000;

async function checkForExtensionUpdate(serverUrl) {
  if (CURRENT_EXTENSION_VERSION === '__EXTENSION_VERSION__') return;
  try {
    const res = await fetch(`${serverUrl}/api/extension-version`, { credentials: 'omit' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (version && version !== CURRENT_EXTENSION_VERSION) {
      const notice = document.getElementById('updateNotice');
      notice.querySelector('a').href = `${serverUrl}/extension.zip`;
      notice.hidden = false;
    }
  } catch (e) {
    // Offline or server unreachable - not worth surfacing, just retry later.
  }
}

function connect() {
  const url = normalizeUrl(document.getElementById('urlInput').value);
  const errEl = document.getElementById('setupError');
  if (!url) {
    errEl.textContent = 'Enter a server address.';
    errEl.hidden = false;
    return;
  }
  errEl.hidden = true;
  chrome.storage.sync.set({ [STORAGE_KEY]: url }, () => showFrame(url));
}

document.getElementById('connectBtn').addEventListener('click', connect);
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connect();
});
document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.storage.sync.get([STORAGE_KEY], (res) => showSetup(res[STORAGE_KEY] || ''));
});

document.getElementById('dismissUpdateNoticeBtn').addEventListener('click', () => {
  document.getElementById('updateNotice').hidden = true;
});

chrome.storage.sync.get([STORAGE_KEY], (res) => {
  if (res[STORAGE_KEY]) {
    showFrame(res[STORAGE_KEY]);
  } else if (BUNDLED_SERVER_URL !== '__DEFAULT_SERVER_URL__') {
    chrome.storage.sync.set({ [STORAGE_KEY]: BUNDLED_SERVER_URL }, () => showFrame(BUNDLED_SERVER_URL));
  } else {
    showSetup('');
  }
});

setInterval(() => {
  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    if (res[STORAGE_KEY]) checkForExtensionUpdate(res[STORAGE_KEY]);
  });
}, EXTENSION_UPDATE_CHECK_MS);
