const STORAGE_KEY = 'serverUrl';
// Replaced with a real URL by the server when downloaded via /extension.zip.
// Loading this folder unpacked straight from git leaves it untouched, so
// the setup screen still asks for a server address as before.
const BUNDLED_SERVER_URL = '__DEFAULT_SERVER_URL__';

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

chrome.storage.sync.get([STORAGE_KEY], (res) => {
  if (res[STORAGE_KEY]) {
    showFrame(res[STORAGE_KEY]);
  } else if (BUNDLED_SERVER_URL !== '__DEFAULT_SERVER_URL__') {
    chrome.storage.sync.set({ [STORAGE_KEY]: BUNDLED_SERVER_URL }, () => showFrame(BUNDLED_SERVER_URL));
  } else {
    showSetup('');
  }
});
