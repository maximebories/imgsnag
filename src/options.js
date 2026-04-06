// imgsnag — Options Page

function saveOptions() {
  const isDragDisabled = document.getElementById('disable_drag').checked;

  browser.storage.sync.set({ disableDrag: isDragDisabled }).then(() => {
    const status = document.getElementById('status');
    status.textContent = browser.i18n.getMessage('optionsStatus');
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  });
}

function restoreOptions() {
  document.getElementById('disable_drag_label').textContent =
    browser.i18n.getMessage('disableDragLabel');
  document.getElementById('save').textContent =
    browser.i18n.getMessage('optionsSave');

  browser.storage.sync.get({ disableDrag: false }).then((items) => {
    document.getElementById('disable_drag').checked = items.disableDrag;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
