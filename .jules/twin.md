## 2024-08-06 - Badge text clearing divergence
**Learning:** To clear the extension badge text across both Chrome and Firefox MV3 when using webextension-polyfill, Firefox requires `text: null` (to avoid a colored square) but Chrome requires `text: ''`. A standard try/catch block fails because the polyfill converts Chrome's synchronous TypeError for `null` into a rejected Promise.
**Action:** Attempt `browser.action.setBadgeText({ text: null })` and chain `.catch(() => browser.action.setBadgeText({ text: '' }))` as a fallback.
