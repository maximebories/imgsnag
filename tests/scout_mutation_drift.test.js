/**
 * @jest-environment jsdom
 */

describe('MutationObserver coverage drift', () => {
  it('TAG_SET includes button, main, dialog', () => {
    const fs = require('fs');
    const source = fs.readFileSync('./src/content.js', 'utf8');
    const tagSetMatch = source.match(/const TAG_SET = new Set\(\[(.*?)\]\);/);
    expect(tagSetMatch).toBeTruthy();
    const tags = tagSetMatch[1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(tags).toContain('BUTTON');
    expect(tags).toContain('MAIN');
    expect(tags).toContain('DIALOG');
  });

  it('setupMutationObserver checks raw style attribute for background and mask', () => {
    const fs = require('fs');
    const source = fs.readFileSync('./src/content.js', 'utf8');
    // Check that it no longer uses el.style.backgroundImage in the observer
    const observerMatch = source.match(/el\.hasAttribute\('style'\) && el\.style && el\.style\.backgroundImage/);
    expect(observerMatch).toBeFalsy();

    // Check that it uses includes('mask')
    const hasMaskCheck = source.match(/el\.getAttribute\('style'\).*?toLowerCase\(\).*?includes\('mask'\)/);
    expect(hasMaskCheck).toBeTruthy();
  });
});
