const qs = s => document.querySelector(s);
const logEl = qs('#log'), statusEl = qs('#status'), progressEl = qs('#progress');
const fields = {
  linkSelector: qs('#linkSelector'),
  findText: qs('#findText'),
  replaceText: qs('#replaceText'),
  caseSensitive: qs('#caseSensitive'),
  dryRun: qs('#dryRun')
};
function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += '[' + time + '] ' + msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}
function setStatus(msg) { statusEl.textContent = msg; }
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function collectLinks(tabId, selector) {
  const [{ result = [] } = {}] = await chrome.scripting.executeScript({
    target: { tabId }, func: sel => Array.from(document.querySelectorAll(sel)).map(a => a.href || a.getAttribute('href')),
    args: [selector]
  });
  return result;
}
qs('#startBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const selector = fields.linkSelector.value.trim();
  const links = await collectLinks(tab.id, selector);
  if (!links.length) return log('No links found.');
  const options = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
  chrome.runtime.sendMessage({ type: 'START_QUEUE', queue: links, options }, (resp) => {
    if (chrome.runtime.lastError) log('Error: ' + chrome.runtime.lastError.message);
    else log('Queued ' + links.length + ' URL(s).');
  });
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUEUE_PROGRESS') {
    const { index, total, url, note } = msg;
    progressEl.value = Math.round((index / total) * 100);
    setStatus('Processing ' + index + '/' + total + '...');
    if (note) log(note + ' (' + index + '/' + total + ') ' + url);
  }
  if (msg.type === 'QUEUE_DONE') {
    setStatus('Done.'); progressEl.value = 100;
    log('Done. Updated: ' + msg.updated + ', Skipped: ' + msg.skipped + ', Errors: ' + msg.errors);
  }
  if (msg.type === 'QUEUE_LOG') log(msg.message);
});