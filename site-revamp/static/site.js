// Adds a copy button to every code block. The site reads and works without this script.
(function () {
  'use strict';

  if (!navigator.clipboard || !navigator.clipboard.writeText) { return; }

  var blocks = document.querySelectorAll('.codeblock');
  Array.prototype.forEach.call(blocks, function (block) {
    var code = block.querySelector('code');
    if (!code || block.querySelector('.copy-button')) { return; }

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy this command');

    button.addEventListener('click', function () {
      navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = 'Copied';
        window.setTimeout(function () { button.textContent = 'Copy'; }, 2000);
      }, function () {
        button.textContent = 'Press Ctrl+C';
      });
    });

    if (block.querySelector('.code-label')) { block.classList.add('has-label'); }
    block.appendChild(button);
  });
}());
