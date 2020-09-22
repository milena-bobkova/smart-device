'use strict';

(function () {
  var anchors = document.querySelectorAll('.page-header__anchor');

  anchors.forEach(function (anchor) {
    anchor.addEventListener('click', function (evt) {
      evt.preventDefault();

      var blockId = anchor.getAttribute('href').substr(1);

      document.getElementById(blockId).scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  });
})();
