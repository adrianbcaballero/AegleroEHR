// CloudFront Function — runs at the edge in front of S3.
// Resolves clean URLs to Next.js static export's index.html files.
// With trailingSlash: true in next.config.mjs, Next emits files like
// /learning/index.html on disk. Browser requests /learning/ — we rewrite
// the URI to /learning/index.html so S3 returns the right file.
//
// Apex→www redirect is NOT here because it lives on the marketing CF
// distribution. This distribution only handles tenant subdomains, which
// don't have an apex equivalent.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Trailing slash → append index.html
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }

  // No extension and no trailing slash → 301 to canonical /path/ form
  // (handles users typing /learning instead of /learning/)
  var lastSegment = uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: uri + '/' }
      }
    };
  }

  return request;
}
