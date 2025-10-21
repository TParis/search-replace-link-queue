(function(){
// Utility: wait for selector with timeout
    function waitForSelector(sel, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(sel);
            if (el) return resolve(el);
            const obs = new MutationObserver(() => {
                const found = document.querySelector(sel);
                if (found) {
                    obs.disconnect();
                    resolve(found);
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout waiting for ${sel}`)); }, timeoutMs);
        });
    }


    function buildRegex(query, { useRegex, caseSensitive, wholeWord }) {
        if (!useRegex) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(wholeWord ? `\\b${escaped}\\b` : escaped, caseSensitive ? 'g' : 'gi');
        }
        return new RegExp(query, caseSensitive ? 'g' : 'gi');
    }


    function replaceInTextNodes(root, regex, replacement) {
        let matches = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const n of nodes) {
            const before = n.nodeValue;
            const after = before.replace(regex, (m, ...rest) => { matches++; return replacement; });
            if (after !== before) n.nodeValue = after;
        }
        return matches;
    }


    async function run(options) {
        const {
            editorSelector = 'div.editor',
            findText = '',
            replaceText = '',
            useRegex = false,
            caseSensitive = false,
            wholeWord = false,
            dryRun = false,
            replaceHTML = false,
        } = options || {};


        if (!findText) return { status: 'skipped', details: 'Empty findText' };


        const el = await waitForSelector(editorSelector).catch((e) => ({ __err: e }))
        if (el && el.__err) return { status: 'error', details: String(el.__err) };


        const regex = buildRegex(findText, { useRegex, caseSensitive, wholeWord });


        let matchCount = 0;
        if (!replaceHTML) {
            matchCount = replaceInTextNodes(el, regex, replaceText);
        } else {
            const html = el.innerHTML;
            const newHtml = html.replace(regex, (m) => { matchCount++; return replaceText; });
            if (!dryRun && newHtml !== html) el.innerHTML = newHtml;
        }


        if (dryRun) return { status: 'skipped', details: `Dry run, matches=${matchCount}` };


        if (matchCount > 0) {
// Attempt to flag changes for reactive editors
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { status: 'updated', details: `Replaced ${matchCount} occurrence(s)` };
        }


        return { status: 'skipped', details: 'No matches' };
    }


    window.__BATCH_REPLACE_RUN__ = run;
})();