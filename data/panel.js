/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let selectElm = document.getElementById("priv8-panel-select");

let buttons = [ 'manager', 'about' ];
for (let i = 0; i < buttons.length; ++i) {
  createButton(buttons[i]);
}

function createButton(name) {
  let button = document.getElementById('priv8-panel-' + name + '-button');
  button.onclick = function() {
    self.port.emit(name);
  }
}

self.port.on("show", function(data) {
  while (selectElm.hasChildNodes()) {
    selectElm.removeChild(selectElm.lastChild);
  }

  for (let i = 0; i < data.sandboxNames.length; ++i) {
    let opt = document.createElement('option');
    opt.appendChild(document.createTextNode(data.sandboxNames[i]));
    opt.setAttribute('value', data.sandboxNames[i]);
    opt.onclick = function() {
      self.port.emit("openSandbox", selectElm.value);
    }
    selectElm.appendChild(opt);
  }

  let current = document.getElementById("priv8-current-sandbox");
  current.textContent = data.currentSandboxName === null ?
                          "" : data.currentSandboxName;
});
