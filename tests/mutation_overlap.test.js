const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { JSDOM } = require('jsdom');
const fs = require('fs');
const contentJs = fs.readFileSync('src/content.js', 'utf8');

describe('MutationObserver Added Nodes Deduplication', () => {
    let dom;

    beforeEach(() => {
        dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
            runScripts: "dangerously",
            url: "http://localhost"
        });
        dom.window.browser = {
            runtime: {
                sendMessage: async () => {},
                onMessage: { addListener: () => {} },
                onConnect: { addListener: () => {} }
            },
            storage: {
                sync: { get: async () => ({ disableDrag: false }) },
                onChanged: { addListener: () => {} }
            }
        };
        dom.window.requestIdleCallback = (cb) => setTimeout(cb, 1);
    });

    it('correctly discovers URLs when parent and child are added in same batch', (done) => {
        let addedUrls = new Set();
        let modifiedJs = 'window.module = { exports: {} };\n' + contentJs + '\nwindow.imgsnagExports = window.module.exports;';

        modifiedJs = modifiedJs.replace('function addNewUrls(urls, type) {', 'function addNewUrls(urls, type) { urls.forEach(u => window.addedUrls.add(u));');
        dom.window.addedUrls = addedUrls;

        dom.window.eval(modifiedJs);

        setTimeout(() => {
            const c1 = dom.window.document.createElement('div');

            const child = dom.window.document.createElement('div');
            child.innerHTML = '<img src="http://example.com/deduped.jpg">';
            c1.appendChild(child);

            // Adding to body creates the mutation
            dom.window.document.body.appendChild(c1);

            setTimeout(() => {
                expect(addedUrls.has('http://example.com/deduped.jpg')).toBe(true);
                done();
            }, 100);
        }, 50);
    });
});
