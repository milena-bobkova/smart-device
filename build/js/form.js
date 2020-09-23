'use strict';

(function () {
  var NUMBER_LENGTH = 10;

  var phoneInputs = document.querySelectorAll('[type=tel]');

  var setPhoneMask = function (element) {
    var inputMask = new window.Inputmask({
      mask: '+7(999) 999-99-99',
      placeholder: ' ',
      jitMasking: true,
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
        };
      });
    });
  };

  checkNumberValidity(phoneInputs);
})();
