const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = {
    action: {
        setBadgeText: () => {}
    },
    downloads: {
        download: async ({url}) => {
            await sleep(50); // simulate download ID retrieval latency
            return Math.floor(Math.random() * 10000);
        }
    }
};

const urls = Array.from({length: 50}).map((_, i) => `url${i}`);
const activeDownloadIds = new Set();
const total = urls.length;

async function sequential() {
    activeDownloadIds.clear();
    const start = performance.now();
    for (let i = 0; i < urls.length; i++) {
        browser.action.setBadgeText({ text: `${i + 1}/${total}` });
        try {
            const downloadId = await browser.downloads.download({ url: urls[i] });
            activeDownloadIds.add(downloadId);
        } catch (err) {
            console.warn('err', err);
        }
    }
    browser.action.setBadgeText({ text: '' });
    return performance.now() - start;
}

async function parallel() {
    activeDownloadIds.clear();
    const start = performance.now();
    let completed = 0;

    await Promise.all(urls.map(async (url) => {
        try {
            const downloadId = await browser.downloads.download({ url });
            activeDownloadIds.add(downloadId);
        } catch (err) {
            console.warn('err', err);
        } finally {
            completed++;
            browser.action.setBadgeText({ text: `${completed}/${total}` });
        }
    }));
    browser.action.setBadgeText({ text: '' });

    return performance.now() - start;
}

async function run() {
    const seqTime = await sequential();
    const parTime = await parallel();
    console.log(`Sequential: ${seqTime.toFixed(2)}ms`);
    console.log(`Parallel: ${parTime.toFixed(2)}ms`);
}

run();
