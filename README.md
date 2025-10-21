# Batch Search & Replace via Link List


This extension collects links by a selector from the current page, then visits each link and performs a search/replace inside a target editor element.


## Features
- Link scraping with a CSS selector (default matches your `.list-container.styled-scrollbars a.document-label`).
- Text replacement through text nodes (safe default) or raw HTML string replacement (faster but riskier).
- Regex / case sensitive / whole word / dry run options.
- Progress bar and log.


## Notes
- If the editor is a SPA/virtual editor, the script triggers `input` and `change` events to help frameworks detect the change. For custom save flows, you may still need to click a Save button—this tool doesn’t auto‑save.
- If navigation is intercepted by the site (client‑side routing), the `waitForSelector` still watches the DOM for your `div.editor` and proceeds once it appears.
- Host permissions are set to `<all_urls>` for convenience; you can restrict to your domain.


## Hardening / Tweaks
- Increase `waitForSelector` timeout in `content_replace.js` if some pages are slow.
- If the editor is shadow‑DOM based, update `waitForSelector` to pierce shadow roots.
- To open each URL in a **new tab** instead of reusing the active tab, modify `processQueue()` to `await chrome.tabs.create({ url })` and track those tabs.