Download validator.js (minified build) from the official CDN or npm and place
the file here as:

    lib/validator.min.js

Official source: https://github.com/validatorjs/validator.js
CDN (jsDelivr):  https://cdn.jsdelivr.net/npm/validator@latest/validator.min.js

The file is NOT bundled in this repo because it is a third-party dependency.
Once downloaded, the manifest will load it into the content-script context
before patterns.js and validator-wrapper.js.
