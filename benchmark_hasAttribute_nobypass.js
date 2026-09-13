const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = `<html><body>` +
  `<div class="container">` +
  Array.from({length: 5000}).map((_, i) => {
    // 100% elements with 5 attributes that don't match, and are NOT in TAG_SET.
    return `<strong class="text-${i}" id="id-${i}" data-test="1" aria-hidden="true" title="title">Text ${i}</strong>`;
  }).join('') +
  `</div></body></html>`;

const dom = new JSDOM(html);
const window = dom.window;
global.window = window;
global.document = window.document;

const TAG_SET = new Set(['IMG', 'VIDEO', 'SOURCE', 'PICTURE', 'DIV', 'SPAN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'LI', 'FIGURE', 'I', 'META', 'LINK', 'OBJECT', 'EMBED', 'IFRAME', 'image', 'IMAGE']);

const elements = Array.from(document.querySelectorAll('*'));

const start1 = Date.now();
let count1 = 0;
for (let j = 0; j < 50; j++) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = el.tagName;
    if (
      TAG_SET.has(tag) ||
      (el.hasAttributes && el.hasAttributes() && (
        el.hasAttribute('srcset') || el.hasAttribute('data-srcset') || el.hasAttribute('data-bgset') || el.hasAttribute('imagesrcset') ||
        el.hasAttribute('data-src') || el.hasAttribute('data-lazy-src') || el.hasAttribute('data-original') ||
        el.hasAttribute('data-bg') || el.hasAttribute('data-bg-src') || el.hasAttribute('data-background') ||
        el.hasAttribute('data-background-image') ||
        (el.hasAttribute('style') && el.style && el.style.backgroundImage)
      ))
    ) {
      count1++;
    }
  }
}
const end1 = Date.now();
console.log(`hasAttribute chain: ${end1 - start1}ms, count: ${count1}`);

const start2 = Date.now();
let count2 = 0;
for (let j = 0; j < 50; j++) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = el.tagName;
    let shouldExtract = TAG_SET.has(tag);
    if (!shouldExtract && el.hasAttributes && el.hasAttributes()) {
        const attrNames = el.getAttributeNames();
        for (let k = 0; k < attrNames.length; k++) {
            const attr = attrNames[k];
            if (attr === 'srcset' || attr === 'data-srcset' || attr === 'data-bgset' || attr === 'imagesrcset' ||
                attr === 'data-src' || attr === 'data-lazy-src' || attr === 'data-original' ||
                attr === 'data-bg' || attr === 'data-bg-src' || attr === 'data-background' || attr === 'data-background-image') {
                shouldExtract = true;
                break;
            }
        }
        if (!shouldExtract && el.hasAttribute('style') && el.style && el.style.backgroundImage) {
            shouldExtract = true;
        }
    }
    if (shouldExtract) {
      count2++;
    }
  }
}
const end2 = Date.now();
console.log(`getAttributeNames loop: ${end2 - start2}ms, count: ${count2}`);
