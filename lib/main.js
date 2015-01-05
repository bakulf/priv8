/* See license.txt for terms of usage */

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
        configureWindow(viewFor(subtab.window));
        highlightBrowser(viewFor(tab), viewFor(subtab.window));
      }
    }
  }
}

tabs.on("open", function(aTab) {
  configureWindow(viewFor(aTab.window));
});

tabs.on("activate", function(aTab) {
  highlightBrowser(null, viewFor(aTab.window));
});

refreshWindows();
Services.obs.addObserver(refreshWindows, "priv8-refresh-needed", false);

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
    let docShell = browser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                        .getInterface(Ci.nsIDocShell);

    let item;
    if (docShell.appId != Ci.nsIScriptSecurityManager.NO_APP_ID) {
      item = aWindow.document.getElementById("priv8-item-" + docShell.appId);
    }

    if (!item) {
      item = aWindow.document.getElementById("priv8-item");
    }

    item.setAttribute("checked", "true");
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
    item.setAttribute('id', 'priv8-item-' + priv8.appIdForSandbox(aSandbox));
  } else {
    item.setAttribute('id', 'priv8-item');
  }

  item.addEventListener('command', function() {
    let tab = aPopup.triggerNode.localName == 'tab' ?
                aPopup.triggerNode : aWindow.gBrowser.selectedTab;
    let browser = aWindow.gBrowser.getBrowserForTab(tab);

    if (priv8.configureWindowByName(tab, browser.contentWindow, aSandbox)) {
      aWindow.gBrowser.reloadTab(tab);
      priv8.highlightBrowser(tab, aWindow.gBrowser.getBrowserForTab(tab));
    }
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
  let docShell = win.gBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                           .getInterface(Ci.nsIDocShell);

  let obj = { sandboxNames: priv8.getSandboxNames(),
              currentSandboxName: priv8.getSandboxName(docShell.appId) };
  panel.port.emit("show", obj);
});

panel.port.on('openSandbox', function(sandbox) {
  let win = wu.getMostRecentBrowserWindow();
  priv8.openSandboxByName(win, sandbox);
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
    let docShell = win.gBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                             .getInterface(Ci.nsIDocShell);

    priv8.openSandbox(win, docShell.appId, aURL);
  }
});

function predicateContextFunction(data) {
  if (data.targetName != 'a') {
    return false;
  }

  let win = wu.getMostRecentBrowserWindow();
  let docShell = win.gBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                           .getInterface(Ci.nsIDocShell);
  if (docShell.appId == Ci.nsIScriptSecurityManager.NO_APP_ID) {
    return false;
  }

  return true;
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

  // Open the about:
  about: function() {
    this.panelManager(this.PRIV8_ABOUT);
  },

  _panelManagerPageNoWin: function(page) {
    function receivePong(aSubject, aTopic, aData) {
      this._panelManagerPage(aSubject, page);
    }

    Services.obs.addObserver(receivePong, "Priv8-manager-pong", false);
    Services.obs.notifyObservers(null, "Priv8-manager-ping", "");
    Services.obs.removeObserver(receivePong, "Priv8-manager-pong");
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
