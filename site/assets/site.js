// Adds a copy button to every code block. The site works without this script.
(function () {
  'use strict';

  var status = document.getElementById('copy-status');

  function announce(message) {
    if (status) { status.textContent = message; }
  }

  function selectText(node) {
    try {
      var range = document.createRange();
      range.selectNodeContents(node);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      // Selection is a fallback only; ignore failures.
    }
  }

  if (!navigator.clipboard || !navigator.clipboard.writeText) { return; }

  var blocks = document.querySelectorAll('.codeblock');
  Array.prototype.forEach.call(blocks, function (block) {
    var code = block.querySelector('code');
    if (!code || block.querySelector('.copy-button')) { return; }

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy command to clipboard');

    function reset() { button.textContent = 'Copy'; }

    button.addEventListener('click', function () {
      navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = 'Copied';
        announce('Command copied to the clipboard.');
        window.setTimeout(reset, 1800);
      }, function () {
        selectText(code);
        button.textContent = 'Select';
        announce('Copy failed. The command is selected, so press Ctrl+C or Cmd+C.');
        window.setTimeout(reset, 2400);
      });
    });

    block.appendChild(button);
  });
})();
