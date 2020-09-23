'use strict';

(function () {

  var popup = document.querySelector('.modal');
  var popupOverlay = document.querySelector('.modal-overlay');
  var popupOpen = document.querySelector('.page-header__button');
  var popupClose = popup.querySelector('.modal__close');
  var form = popup.querySelector('form');
  var userName = form.querySelector('[name=modal-name]');
  var userPhone = form.querySelector('[name=modal-phone]');
  var userQuestion = form.querySelector('[name=modal-question]');

  var isStorageSupport = true;
  var storage = {};

  try {
    storage.name = localStorage.getItem('userName');
    storage.phone = localStorage.getItem('userPhone');
    storage.question = localStorage.getItem('userQuestion');
  } catch (err) {
    isStorageSupport = false;
  }

  form.addEventListener('submit', function () {
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

  var closePopup = function () {
    popup.classList.remove('modal--show');
    popupOverlay.classList.remove('modal-overlay--show');
    document.body.classList.remove('modal__fix');
    document.removeEventListener('keydown', escPressHandler);
    popupOverlay.removeEventListener('click', function () {
        closePopup();
    });
  }

  var escPressHandler = function (evt) {
    if (evt.key === 'Escape') {
      closePopup();
    }
  }

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
  }

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
  };

  popupClose.addEventListener('click', function (evt) {
    evt.preventDefault();
    closePopup();
  });

  popupClose.addEventListener('keydown', function (evt) {
    if (evt.key === 'Enter') {
      closePopup();
    }
  });
})();
