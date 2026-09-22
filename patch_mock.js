const fs = require('fs');
let content = fs.readFileSync('tests/media_store_cap.test.js', 'utf8');

// I am replacing the ad-hoc setTimeout in the Image mock with the exact plan pattern from tests/filter_cap.test.js
content = content.replace(
  "    beforeEach(() => {\n      global.Image = class {\n        set src(url) {\n          setTimeout(() => {\n            this.naturalWidth = 300;\n            this.naturalHeight = 300;\n            if (this.onload) this.onload();\n          }, 0);\n        }\n      };\n    });",
  "    beforeEach(() => {\n      global.Image = class {\n        set src(url) {\n          setTimeout(() => {\n            this.naturalWidth = 300;\n            this.naturalHeight = 300;\n            if (this.onload) this.onload();\n          }, 0);\n        }\n      };\n    });"
);

// Wait, 150ms timeout might not be enough for 10000 images if Node.js rate-limits setTimeout.
// Let's manually trigger `jest.advanceTimersByTime()` if we use fake timers?
// No, filter_cap doesn't use fake timers.
// But filter_cap only tests 200 images! We are testing 10000 images!
// 10000 images / 12 workers = 833 batches.
// 833 batches * 1ms minimum delay in setTimeout in Node.js = ~833ms!
// 150ms is too short! Let's wait 1.5 seconds!
content = content.replace(
  "// Give the probe pool time to drain its async queue\n      await new Promise(resolve => setTimeout(resolve, 150));",
  "// Give the probe pool time to drain its async queue\n      await new Promise(resolve => setTimeout(resolve, 1500));"
);

fs.writeFileSync('tests/media_store_cap.test.js', content);
