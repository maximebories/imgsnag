const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body>' + '<div class="test"></div>'.repeat(10000) + '</body></html>');
const document = dom.window.document;

const BG_IMAGE_SELECTORS = 'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';
const BG_IMAGE_TAGS = new Set(['DIV', 'SPAN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'LI', 'FIGURE', 'I']);

console.time('querySelectorAll');
const nodes1 = [];
document.querySelectorAll(BG_IMAGE_SELECTORS).forEach((el) => {
  if (!el.className && !el.id && !el.getAttribute('style')) return;
  nodes1.push(el);
});
console.timeEnd('querySelectorAll');

console.time('TreeWalker');
const nodes2 = [];
const walker = document.createTreeWalker(
  document.documentElement,
  dom.window.NodeFilter.SHOW_ELEMENT
);
let el;
while ((el = walker.nextNode())) {
  // If it doesn't have styling hints, we'd skip it anyway in the inner loop,
  // so we can check that first for an even faster path?
  if (!el.className && !el.id && !el.getAttribute('style')) continue;

  if (BG_IMAGE_TAGS.has(el.tagName) || (el.hasAttribute('style') && el.getAttribute('style').includes('background'))) {
    nodes2.push(el);
  }
}
console.timeEnd('TreeWalker');

console.log('nodes1', nodes1.length, 'nodes2', nodes2.length);
