const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>');
const document = dom.window.document;

let addedNodes = new Set();
let a = document.createElement('div');
let b = document.createElement('div');
a.appendChild(b);

let isDescendant_parentElement = false;
for (let p = b.parentElement; p; p = p.parentElement) {
    if (addedNodes.has(p)) { isDescendant_parentElement = true; break; }
}

let isDescendant_parentNode = false;
for (let p = b.parentNode; p; p = p.parentNode) {
    if (addedNodes.has(p)) { isDescendant_parentNode = true; break; }
}

console.log('parentElement:', isDescendant_parentElement);
console.log('parentNode:', isDescendant_parentNode);

// What if b is reparented to document fragment?
let frag = document.createDocumentFragment();
frag.appendChild(b);
// parentElement is null
// parentNode is frag
