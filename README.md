<p align="center">
  <img src="icons/128.png" alt="imgsnag" />
</p>

<h1 align="center">imgsnag</h1>

<p align="center">Browser extension to download images from web pages.</p>

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/imgsnag/">
    <img src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" alt="Get imgsnag for Firefox" height="60" />
  </a>
</p>

## Features

- **Bulk download** — click the toolbar button to download all images from the current page
- **Alt+Click** — hold Alt and click any image to save it
- **Drag-to-save** — drag an image to download it (can be disabled in settings)

Supports JPEG, PNG, GIF, WebP, SVG, and AVIF. Small images (icons, thumbnails) are automatically filtered out.

## Build

```bash
bash build.sh
```

Outputs `dist/imgsnag-chrome.zip` and `dist/imgsnag-firefox.zip`.
