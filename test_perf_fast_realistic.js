const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = `<html><body>` +
  `<div class="container">` +
  Array.from({length: 5000}).map((_, i) =>
    `<strong id="item-${i}" class="card">
       <span class="text">Hello </span>
       <a href="http://example.com/link-${i}.jpg">link</a>
       <p data-test="true">test</p>
     </strong>`
  ).join('') +
  `</div></body></html>`;

const dom = new JSDOM(html);
const window = dom.window;
global.window = window;
global.document = window.document;
global.NodeFilter = window.NodeFilter;

const start1 = Date.now();
let count1 = 0;
for (let j = 0; j < 10; j++) {
  const elements = document.querySelectorAll('div, span, section, article, header, footer, a, li, figure, i, [style*="background"]');
  for(let i=0; i<elements.length; i++) {
    const el = elements[i];
    if (!el.className && !el.id && !el.getAttribute('style')) continue;
    count1++;
  }
}
const end1 = Date.now();
console.log(`querySelectorAll: ${end1 - start1}ms, count: ${count1}`);

const bgTags = new Set(['DIV', 'SPAN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'LI', 'FIGURE', 'I']);

const start2 = Date.now();
let count2 = 0;
for (let j = 0; j < 10; j++) {
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  let bgEl;
  while ((bgEl = walker.nextNode())) {
    if (bgTags.has(bgEl.tagName) || (bgEl.getAttribute('style') || '').includes('background')) {
      if (!bgEl.className && !bgEl.id && !bgEl.getAttribute('style')) continue;
      count2++;
    }
  }
}
const end2 = Date.now();
console.log(`TreeWalker loop: ${end2 - start2}ms, count: ${count2}`);
