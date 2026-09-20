/* Pages like /p/some-post and 404 are served from a different depth than the files they load.
   Pinning <base> to the site root keeps every relative path (css, js, fonts) working. */
(function () {
  if (location.protocol === 'file:') return;
  document.write('<base href="/">');
})();
