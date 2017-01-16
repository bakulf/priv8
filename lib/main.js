/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const self = require('sdk/self');
const tabs = require('sdk/tabs');
const tabsUtils = require("sdk/tabs/utils");
const wu = require('sdk/window/utils');
const { isBrowser } = require("sdk/window/utils");
const { viewFor } = require("sdk/view/core");
const { Cc, Ci, Cu, Cr } = require('chrome');

let _ = require("sdk/l10n").get;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://priv8/content/modules/priv8.jsm");

priv8.init(self.data.url('wait.html'), self.data.url('readme.html'));

exports.main = function(aOptions) {
  if (aOptions.loadReason === 'startup') {
    if (!reloadTab()) {
      require("sdk/timers").setTimeout(reloadTab, 0);
    }
  }
}

function reloadTab() {
  if (!tabs.length) {
    return false;
  }

  for (let i = 0; i < tabs.length; ++i) {
    priv8.restoreTab(viewFor(tabs[i]));
  }

  return true;
}

function refreshWindows() {
  let windows = require("sdk/windows").browserWindows;
  for (let window of windows) {
    for (let tab of window.tabs) {
      for (let subtab of tab.window.tabs) {
        let win = viewFor(subtab.window);
        configureWindow(win);
        highlightBrowser(viewFor(tab), win);
        refreshButtonIcons(win);
      }
    }
  }
}

function refreshButtonIcons(aWindow) {
  if (button) {
    priv8.getOriginAttributes(aWindow.gBrowser, function(aAttr) {
      if (priv8.getSandboxName(priv8.getSandboxFromOriginAttributes(aAttr)) === null) {
        button.icon = {
          '16': './icons/icon-16.png',
          '32': './icons/icon-32.png',
          '64': './icons/icon-64.png'
        }
      } else {
        button.icon = {
          '16': './icons/icon-16-active.png',
          '32': './icons/icon-32-active.png',
          '64': './icons/icon-64-active.png'
        }
      }
    });
  }
}

tabs.on("open", function(aTab) {
  configureWindow(viewFor(aTab.window));
  refreshButtonIcons(viewFor(aTab.window));
});

tabs.on("activate", function(aTab) {
  highlightBrowser(null, viewFor(aTab.window));
  refreshButtonIcons(viewFor(aTab.window));
});

function highlightBrowser(aTab, aWindow) {
  if (!isBrowser(aWindow)) {
    return;
  }

  if (!aTab) {
    aTab = aWindow.gBrowser.selectedTab;
  }

  let browser = aWindow.gBrowser.getBrowserForTab(aTab);
  priv8.highlightBrowser(aTab, browser);
}

function tabRestoring(aEvent) {
  priv8.tabRestoring(aEvent);
}

function configureWindow(aWindow) {
  if (!isBrowser(aWindow)) {
    return;
  }

  let oldmenu = aWindow.document.getElementById('priv8_menu');
  if (oldmenu) {
    oldmenu.parentNode.removeChild(oldmenu);
  }

  let oldseparator = aWindow.document.getElementById('priv8_separator');
  if (oldseparator) {
    oldseparator.parentNode.removeChild(oldseparator);
  }

  let mainmenu = aWindow.document.getElementById("tabContextMenu");

  let separator = aWindow.document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menuseparator");
  separator.setAttribute('id', 'priv8_separator');
  mainmenu.insertBefore(separator, mainmenu.firstChild);

  let menu = aWindow.document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menu");
  menu.setAttribute('id', 'priv8_menu');
  menu.setAttribute('label', 'Priv8!');
  mainmenu.insertBefore(menu, mainmenu.firstChild);

  let popup = aWindow.document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menupopup");
  menu.appendChild(popup);

  popup.addEventListener('popupshown', function(e) {
    let tab = popup.triggerNode.localName == 'tab' ?
                popup.triggerNode : aWindow.gBrowser.selectedTab;
    let browser = aWindow.gBrowser.getBrowserForTab(tab);
    priv8.getOriginAttributes(browser, function(aAttr) {
      let item;
      let id = priv8.getSandboxFromOriginAttributes(aAttr);
      if (id) {
        item = aWindow.document.getElementById("priv8-item-" + id);
      }

      if (!item) {
        item = aWindow.document.getElementById("priv8-item");
      }

      item.setAttribute("checked", "true");
    });
  });

  createMenuItem(aWindow, popup, null);

  {
    let separator = aWindow.document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menuseparator");
    popup.appendChild(separator);
  }

  let sandboxes = priv8.getSandboxNames();
  for (let i = 0; i < sandboxes.length; ++i) {
    createMenuItem(aWindow, popup, sandboxes[i]);
  }

  aWindow.document.removeEventListener("SSTabRestoring", tabRestoring);
  aWindow.document.addEventListener("SSTabRestoring", tabRestoring, false);
}

function createMenuItem(aWindow, aPopup, aSandbox) {
  let item = aWindow.document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","menuitem");
  aPopup.appendChild(item);

  item.setAttribute("label", aSandbox ? aSandbox : _("Priv8.default"));
  item.setAttribute('name', 'priv8');
  item.setAttribute('type', 'radio');

  if (aSandbox) {
    item.setAttribute('id', 'priv8-item-' + priv8.idForSandbox(aSandbox));
  } else {
    item.setAttribute('id', 'priv8-item');
  }

  item.addEventListener('command', function() {
    let tab = aPopup.triggerNode.localName == 'tab' ?
                aPopup.triggerNode : aWindow.gBrowser.selectedTab;
    let browser = aWindow.gBrowser.getBrowserForTab(tab);

    priv8.getOriginAttributes(browser, (aAttr) => {
      if (aAttr != aSandbox) {
        let url = browser.currentURI.spec;
        function onLoad() {
          if (browser.currentURI.spec != 'about:blank') {
            return;
          }

          browser.removeEventListener("load", onLoad, true);

          priv8.configureWindowByName(tab, browser, aSandbox, function(aStatus) {
            if (aStatus) {
              aWindow.gBrowser.reloadTab(tab);
              refreshButtonIcons(aWindow);
              priv8.highlightBrowser(tab, aWindow.gBrowser.getBrowserForTab(tab));
              browser.loadURI(url);
            }
          });
        }

        browser.addEventListener("load", onLoad, true);
        browser.loadURI('about:blank');
      }
    });
  });
}

// UI button
let { ToggleButton } = require('sdk/ui/button/toggle');
let panels = require('sdk/panel');

let button = ToggleButton({
  id: 'priv8-button',
  label: "Priv8",
  icon: {
    '16': './icons/icon-16.png',
    '32': './icons/icon-32.png',
    '64': './icons/icon-64.png'
  },
  onChange: function(state) {
    if (state.checked) {
      panel.show({
        position: button
      });
    }
  }
});

let panel = panels.Panel({
  contentURL: self.data.url('panel.html'),
  contentScriptFile: self.data.url('panel.js'),
  height: 180,
  onHide: function() {
    button.state('window', {checked: false});
  }
});

panel.on("show", function() {
  let win = wu.getMostRecentBrowserWindow();
  priv8.getOriginAttributes(win.gBrowser, function(aAttr) {
    let id = priv8.getSandboxFromOriginAttributes(aAttr);
    let obj = { sandboxNames: priv8.getSandboxNames(),
                currentSandboxName: priv8.getSandboxName(id) };
    panel.port.emit("show", obj);
  });
});

panel.port.on('openSandbox', function(sandbox) {
  let win = wu.getMostRecentBrowserWindow();
  priv8.openSandboxByName(win, sandbox);
  refreshButtonIcons(win);
  panel.hide();
});

panel.port.on('manager', function() {
  Priv8Overlay.panelManager(Priv8Overlay.PRIV8_SANDBOXES);
  panel.hide();
});

panel.port.on('about', function() {
  Priv8Overlay.panelManager(Priv8Overlay.PRIV8_ABOUT);
  panel.hide();
});

var cm = require("sdk/context-menu");
cm.Item({
  label: _("Priv8.contextOpenLink"),
  context: cm.PredicateContext(predicateContextFunction),
  contentScript: 'self.on("click", function (aNode, aData) {' +
                 '  self.postMessage(aNode.href);' +
                 '});',
  accesskey: '8',
  onMessage: function(aURL) {
    let win = wu.getMostRecentBrowserWindow();
    priv8.getOriginAttributes(win.gBrowser, function(aAttr) {
      let id = priv8.getSandboxFromOriginAttributes(aAttr);
      priv8.openSandbox(win, id, aURL);
    });
  }
});

function predicateContextFunction(data) {
  return data.targetName == 'a';
}

let Priv8Overlay = {
  PRIV8_SANDBOXES: "sandboxes",
  PRIV8_ABOUT:     "about",

  // Open the manager
  panelManager: function(page) {
    if (!page) {
      page = this.PRIV8_SANDBOXES;
    }

    let me = this;
    Services.obs.addObserver(function (aSubject, aTopic, aData) {
      Services.obs.removeObserver(arguments.callee, aTopic);
      me._panelManagerPage(aSubject, page);
    }, "Priv8-manager-loaded", false);

    let win = wu.getMostRecentBrowserWindow();
    tabsUtils.openTab(win, 'chrome://priv8/content/manager.xul');
  },

  _panelManagerPage: function(win, page) {
    if (!win.priv8ManagerData) {
      return;
    }

    if (page == this.PRIV8_ABOUT) {
      win.priv8ManagerData.pageAbout();
    }

    if (page == this.PRIV8_SANDBOXES) {
      win.priv8ManagerData.pageSandboxes();
    }
  }
}

refreshWindows();
Services.obs.addObserver(refreshWindows, "priv8-refresh-needed", false);
