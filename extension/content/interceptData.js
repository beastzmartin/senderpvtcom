/**
 * Google Maps Data Interceptor - Page World Script
 * Hooks into Google Maps internal XHR /search queries to extract structured JSON/Protobuf payload
 */
(function () {
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._requestUrl = url;
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          const urlStr = String(this._requestUrl || '');
          if (urlStr.includes('/search') || urlStr.includes('maps/preview') || urlStr.includes('/place/')) {
            let container = document.getElementById('searchAPIResponseData');
            if (!container) {
              container = document.createElement('div');
              container.id = 'searchAPIResponseData';
              container.style.display = 'none';
              container.style.visibility = 'hidden';
              container.style.height = '0';
              container.style.overflow = 'hidden';
              (document.body || document.documentElement).appendChild(container);
            }

            if (this.responseType === '' || this.responseType === 'text') {
              if (this.responseText && this.responseText.length > 50) {
                container.innerText = this.responseText;
                window.dispatchEvent(new CustomEvent('__gmap_data_intercepted__'));
              }
            } else if (this.response instanceof Blob) {
              const reader = new FileReader();
              reader.onload = function () {
                if (this.result && this.result.length > 50) {
                  container.innerText = this.result;
                  window.dispatchEvent(new CustomEvent('__gmap_data_intercepted__'));
                }
              };
              reader.readAsText(this.response);
            }
          }
        } catch (err) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch (e) {}
})();

