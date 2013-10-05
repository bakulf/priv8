/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8.jsm");

function debug(msg) {
  dump("Priv8.js - " + msg + "\n");
}

// Generic load for any window:
window.addEventListener("load", function() {
  debug("Window loaded");

  if (priv8.firstRun()) {
    debug("FirstRun!");
    Priv8Overlay.addRemoveIcon();
  }

  // TODO: the color for the appId
}, false);

function Priv8Overlay() {}

// Add/Remove the icon to the navBar
Priv8Overlay.addRemoveIcon = function() {
  debug("Overlay addRemoveIcon");

  let icon   = "priv8-toolbarbutton";
  let navBar = document.getElementById("nav-bar") || document.getElementById("addon-bar");
  let obj  = document.getElementById(icon);

  if (!navBar) {
    return;
  }

  navBar.insertItem(icon, null, null, false);
  navBar.setAttribute("currentset", navBar.currentSet);
  document.persist(navBar.id, "currentset");
}

Priv8Overlay._panelCreate = function(aJar) {
  debug("_panelCreate");

  let row = document.createElement('listitem');
  row.setAttribute('label', aJar.name);

  row.addEventListener('click', function() {
    priv8.openCookieJar(window, aJar.id);
    document.getElementById('priv8-panel').hidePopup();
  }, false);

  // TODO: the color
  return row;
}

Priv8Overlay.panelOpen = function() {
  debug("panelOpen");

  let rows = document.getElementById('priv8-panel-rows');
  while(rows.firstChild) {
    rows.removeChild(rows.firstChild);
  }

  let jars = priv8.getCookieJars();
  for (let i in jars) {
    rows.appendChild(Priv8Overlay._panelCreate(jars[i]));
  }
}

Priv8Overlay.settings = function() {
  debug("settings");
  Priv8Overlay.panelManager("settings");
}

Priv8Overlay.about = function() {
  debug("about");
  Priv8Overlay.panelManager("about");
}

Priv8Overlay.panelManager = function(aPage) {
  debug("panelManager");

  // This object maybe doesn't exist (if the navBar doesn't contain the priv8's icon)
  try {
    document.getElementById('priv8-panel').hidePopup();
  } catch(e) { }

  let URI = Services.io.newURI('chrome://priv8/content/manager.xul', null, null);

  let isBrowserWindow = !!window.gBrowser;

  // Prioritise this window.
  if (isBrowserWindow && Priv8Overlay._switchIfURIInWindow(window, URI)) {
    Priv8Overlay._panelManagerPageNoWin(aPage);
    return;
  }

  let winEnum = Services.wm.getEnumerator("navigator:browser");
  while (winEnum.hasMoreElements()) {
    let browserWin = winEnum.getNext();

    // Skip closed (but not yet destroyed) windows,
    // and the current window (which was checked earlier).
    if (browserWin.closed || browserWin == window)
      continue;

    if (Priv8Overlay._switchIfURIInWindow(browserWin, URI)) {
      Priv8Overlay._panelManagerPageNoWin(aPage);
      return;
    }
  }

  if (isBrowserWindow && Priv8Overlay._isTabEmpty(gBrowser.selectedTab)) {
    gBrowser.selectedBrowser.loadURI(URI.spec);
  } else {
    openUILinkIn(URI.spec, "tab");
  }

  Services.obs.addObserver(function (aSubject, aTopic, aData) {
    Services.obs.removeObserver(arguments.callee, aTopic);
    Priv8Overlay._panelManagerPage(aSubject, aPage);
  }, "Priv8-manager-loaded", false);
}

Priv8Overlay._panelManagerPageNoWin = function(aPage) {
  debug("panelManagerPageNoWin");

  function receivePong(aSubject, aTopic, aData) {
    Priv8Overlay._panelManagerPage(aSubject, aPage);
  }

  Services.obs.addObserver(receivePong, "Priv8-manager-pong", false);
  Services.obs.notifyObservers(null, "Priv8-manager-ping", "");
  Services.obs.removeObserver(receivePong, "Priv8-manager-pong");
}

// This will switch to the tab in aWindow having aURI, if present.
Priv8Overlay._switchIfURIInWindow = function(aWindow, aURI) {
  let browsers = aWindow.gBrowser.browsers;
  for (let i = 0; i < browsers.length; ++i) {
    let browser = browsers[i];
    if (browser.currentURI.equals(aURI)) {
      // Focus the matching window & tab
      aWindow.focus();
      aWindow.gBrowser.tabContainer.selectedIndex = i;
      return true;
    }
  }
  return false;
}

/*
 * Determines if a tab is "empty", usually used in the context of determining
 * if it's ok to close the tab.
 */
Priv8Overlay._isTabEmpty = function(aTab) {
  let browser = aTab.linkedBrowser;
  return browser.sessionHistory.count < 2 &&
         browser.currentURI.spec == "about:blank" &&
         !browser.contentDocument.body.hasChildNodes() &&
         !aTab.hasAttribute("busy");
}

Priv8Overlay._panelManagerPage = function(aWin, aPage) {
  debug("panelManagerPage");

  if (!aWin.priv8ManagerData) {
    return;
  }

  if (aPage == "settings") {
    aWin.priv8ManagerData.pageSettings();
  }

  if (aPage == "about") {
    aWin.priv8ManagerData.pageAbout();
  }
}

// Configure the manager window:
Priv8Overlay.managerLoad = function() {
  debug("managerLoad");

  let win = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
          .getInterface(Components.interfaces.nsIWebNavigation)
          .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
          .rootTreeItem
          .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
          .getInterface(Components.interfaces.nsIDOMWindow);

  try {
    win.document.documentElement.setAttribute("disablechrome", "true");
    document.documentElement.setAttribute("disablechrome", "true");
  } catch(e) {}

  // Emm... I want to be in the white-list :)
  try {
    win.top.XULBrowserWindow.inContentWhitelist.push('chrome://priv8/content/manager.xul');
  } catch(e) {}
}
