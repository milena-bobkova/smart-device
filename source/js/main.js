'use strict';

(function () {

  var popup = document.querySelector('.modal');
  var popupOverlay = document.querySelector('.modal-overlay');
  var popupOpen = document.querySelector('.page-header__button');
  var popupClose = popup.querySelector('.modal__close');
  var form = popup.querySelector('form');
  var userName = document.querySelector('[name=modal-name]');
  var userPhone = document.querySelector('[name=modal-phone]');
  var userQuestion = document.querySelector('[name=modal-question]');

  var isStorageSupport = true;
  var storage = {};

  try {
    storage.name = localStorage.getItem('userName');
    storage.phone = localStorage.getItem('userPhone');
    storage.question = localStorage.getItem('userQuestion');
  } catch (err) {
    isStorageSupport = false;
  }

  if (form !== null) {
    form.addEventListener('submit', function (evt) {
      if (!userName.value || !userPhone.value || !userQuestion.value) {
        evt.preventDefault();
      } else {
        if (isStorageSupport) {
          localStorage.setItem('name', userName.value);
          localStorage.setItem('phone', userPhone.value);
          localStorage.setItem('question', userQuestion.value);
        }
      }
    });
  }

  var closePopup = function () {
    popup.classList.remove('modal--show');
    popupOverlay.classList.remove('modal-overlay--show');
    document.body.classList.remove('modal__fix');
    document.removeEventListener('keydown', escPressHandler);
    popupOverlay.removeEventListener('click', function () {
      closePopup();
    });
    form.reset();
  };

  var escPressHandler = function (evt) {
    if (evt.key === 'Escape') {
      closePopup();
    }
  };

  var setFocus = function () {
    userName.focus();
    if (isStorageSupport) {
      if (localStorage.getItem('userName')) {
        userName.value = localStorage.getItem('userName');
        userPhone.focus();
        if (localStorage.getItem('userPhone')) {
          userPhone.value = localStorage.getItem('userPhone');
          userQuestion.focus();
          if (localStorage.getItem('userQuestion')) {
            userQuestion.value = localStorage.getItem('userQuestion');
          }
        }
      }
    }
  };

  var openPopup = function () {
    if (popup !== null && popupOverlay !== null) {
      popup.classList.add('modal--show');
      popupOverlay.classList.add('modal-overlay--show');
      document.body.classList.add('modal__fix');
      document.addEventListener('keydown', escPressHandler);
      setFocus();
      popupOverlay.addEventListener('click', function () {
        closePopup();
      });
    }
  };

  if (popupOpen !== null) {
    popupOpen.addEventListener('click', function (evt) {
      evt.preventDefault();
      openPopup();
    });

    popupOpen.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        openPopup();
      }
    });
  }

  popupClose.addEventListener('click', function (evt) {
    evt.preventDefault();
    closePopup();
  });

  popupClose.addEventListener('keydown', function (evt) {
    if (evt.key === 'Enter') {
      closePopup();
    }
  });

  /******************************/

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

  /******************************/

  var NUMBER_LENGTH = 10;

  var phoneInputs = document.querySelectorAll('[type=tel]');

  var setPhoneMask = function (element) {
    var inputMask = new window.Inputmask({
      mask: '+7(999) 999-99-99'
    });
    inputMask.mask(element);
  };

  phoneInputs.forEach(function (input) {
    setPhoneMask(input);
  });

  var checkNumberValidity = function (inputs) {
    inputs.forEach(function (input) {
      input.addEventListener('input', function () {
        var phoneValue = input.inputmask.unmaskedvalue();
        if (phoneValue.length < NUMBER_LENGTH) {
          input.setCustomValidity('Номер телефона введен неверно!');
        } else {
          input.setCustomValidity('');
        }
      });
    });
  };

  checkNumberValidity(phoneInputs);

  /******************************/

  var accordions = document.querySelectorAll('.accordion');

  accordions.forEach(function (accordion) {
    accordion.classList.remove('accordion--nojs');
  });

  var accordionGo = function () {
    var accordionToggles = document.querySelectorAll('.accordion__click');
    var accordionButtons = document.querySelectorAll('.accordion__button');
    var accordionMenus = document.querySelectorAll('.accordion__menu');
    var index = null;

    var accordionOpen = function (i) {
      accordionButtons[i].classList.remove('accordion__button--closed');
      accordionButtons[i].classList.add('accordion__button--opened');
      accordionMenus[i].classList.remove('accordion__menu--closed');
      accordionMenus[i].classList.add('accordion__menu--opened');
    };

    var accordionClose = function (i) {
      accordionButtons[i].classList.remove('accordion__button--opened');
      accordionButtons[i].classList.add('accordion__button--closed');
      accordionMenus[i].classList.remove('accordion__menu--opened');
      accordionMenus[i].classList.add('accordion__menu--closed');
    };

    if (accordionToggles.length > 0 && accordionMenus.length > 0) {
      accordionToggles.forEach(function (button, i) {
        if (accordionButtons[i] !== null && accordionMenus[i] !== null && accordionMenus[i].childNodes.length > 0) {
          accordionClose(i);
          button.addEventListener('click', function () {
            accordionOpen(i);
            if (index !== null) {
              accordionClose(index);
            }
            index = index === i ? null : i;
          });
        }
      });
    }
  };

  accordionGo();

})();
