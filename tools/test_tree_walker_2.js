const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body>' + '<div></div>'.repeat(10000) + '</body></html>');
const document = dom.window.document;

const BG_IMAGE_SELECTORS = 'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';
const BG_IMAGE_TAGS = new Set(['DIV', 'SPAN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'LI', 'FIGURE', 'I']);

console.time('querySelectorAll');
let c1 = 0;
document.querySelectorAll(BG_IMAGE_SELECTORS).forEach((el) => {
  if (!el.className && !el.id && !el.getAttribute('style')) return;
  c1++;
});
console.timeEnd('querySelectorAll');

console.time('TreeWalker');
let c2 = 0;
const walker = document.createTreeWalker(
  document.documentElement,
  dom.window.NodeFilter.SHOW_ELEMENT
);
let el;
while ((el = walker.nextNode())) {
  if (!el.className && !el.id && !el.getAttribute('style')) continue;
  if (BG_IMAGE_TAGS.has(el.tagName) || (el.hasAttribute('style') && el.getAttribute('style').includes('background'))) {
    c2++;
  }
}
console.timeEnd('TreeWalker');

console.log('c1', c1, 'c2', c2);
