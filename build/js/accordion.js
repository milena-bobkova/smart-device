'use strict';

var accordions = document.querySelectorAll('.accordion');
var accordionButtons = document.querySelectorAll('.accordion__button');
var accordionMenues = document.querySelectorAll('.accordion__menu');

accordions.forEach(function (accordion) {
  accordion.classList.remove('accordion--nojs');
});

var accordeonGoHandler = function (button, menu) {
  button.addEventListener('click', function (evt) {
    evt.preventDefault();
    menu.classList.toggle('accordion__menu--opened')
    button.classList.toggle('accordion__button--opened')
  });
};

var accordionGo = function () {
  if (accordionButtons.length > 0 && accordionMenues.length > 0) {
    for (var i = 0; i < accordionMenues.length; i++) {
      if (accordionButtons[i] !== null && accordionMenues[i] !== null && accordionMenues[i].childNodes.length > 0) {
        accordeonGoHandler(accordionButtons[i], accordionMenues[i]);
      }
    }
  }
};

accordionGo();
