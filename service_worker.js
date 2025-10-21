chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'START_QUEUE') {
    runQueue(msg.queue, msg.options);
    sendResponse({ ok: true });
  }
});

function waitForSudowriteSaveCycle(timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let sawSaving = false;

    const interval = setInterval(() => {
      const el = document.querySelector('.save span');
      const text = el ? el.textContent.trim() : '';

      if (text.startsWith('Saving')) {
        sawSaving = true;
      }

      if (sawSaving && text.startsWith('Saved')) {
        clearInterval(interval);
        resolve(true);
      }

      if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error('Did not detect save cycle (Saving → Saved) in time'));
      }
    }, 250);
  });
}

async function runQueue(queue, options) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let updated = 0, skipped = 0, errors = 0;

  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    chrome.runtime.sendMessage({ type: 'QUEUE_PROGRESS', index: i + 1, total: queue.length, url, note: 'Navigating' });
    await chrome.tabs.update(tab.id, { url });
    await new Promise(resolve => {
      const listener = (tid, info) => {
        if (tid === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 10000); // Give Sudowrite's iframe time to update
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    chrome.runtime.sendMessage({ type: 'QUEUE_PROGRESS', index: i + 1, total: queue.length, url, note: 'Loaded' });

    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (opts) => {
          const iframe = document.querySelector('#editorContainer');
          if (!iframe || !iframe.contentWindow) return { status: 'error', details: 'Iframe not found' };
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const el = doc.querySelector('div.tiptap.ProseMirror');
          if (!el) return { status: 'skipped', details: 'Editor not found' };

          const regex = new RegExp(opts.findText, opts.caseSensitive ? 'g' : 'gi');
          let count = 0;
          const walk = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walk.nextNode()) nodes.push(walk.currentNode);
          for (const node of nodes) {
            const before = node.nodeValue;
            const after = before.replace(regex, match => { count++; return opts.replaceText; });
            if (after !== before && !opts.dryRun) node.nodeValue = after;
          }

          if (!opts.dryRun && count > 0) {
            el.focus();
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          }
          await waitForSudowriteSaveCycle();
          await new Promise(resolve => setTimeout(resolve, 10000));

          if (opts.dryRun) return { status: 'skipped', details: 'Dry run: ' + count + ' matches' };
          return count > 0 ? { status: 'updated', details: count + ' replaced' } : { status: 'skipped', details: 'No matches' };
        },
        args: [options]
      });

      if (result.status === 'updated') updated++;
      else if (result.status === 'skipped') skipped++;
      else errors++;

      chrome.runtime.sendMessage({ type: 'QUEUE_LOG', message: result.status + ' - ' + result.details });

      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (e) {
      errors++;
      chrome.runtime.sendMessage({ type: 'QUEUE_LOG', message: 'Error: ' + e.message });
    }
  }

  chrome.runtime.sendMessage({ type: 'QUEUE_DONE', updated, skipped, errors });
}