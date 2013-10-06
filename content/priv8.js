/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8-colors.jsm");

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

  var container = gBrowser.tabContainer;
  container.addEventListener("TabOpen", function(event) {
    Priv8Overlay.tabOpened(gBrowser, event.target);
  }, false);

  for (let i = 0; i < gBrowser.tabContainer.childNodes.length; ++i) {
    Priv8Overlay.tabOpened(gBrowser, gBrowser.tabContainer.childNodes[i]);
  }
}, false);

// Add/Remove the icon to the navBar
const Priv8Overlay = {
  addRemoveIcon: function() {
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
  },

  _panelCreate: function(aJar) {
    debug("_panelCreate");

    let row = document.createElement('listitem');
    row.setAttribute('label', aJar.name);
    row.setAttribute('style', 'color: ' + aJar.color);

    row.addEventListener('click', function() {
      priv8.openCookieJar(window, aJar.id);
      document.getElementById('priv8-panel').hidePopup();
    }, false);

    return row;
  },

  panelOpen: function() {
    debug("panelOpen");

    let rows = document.getElementById('priv8-panel-rows');
    while(rows.firstChild) {
      rows.removeChild(rows.firstChild);
    }

    let jars = priv8.getCookieJars();
    for (let i in jars) {
      rows.appendChild(Priv8Overlay._panelCreate(jars[i]));
    }
  },

  settings: function() {
    debug("settings");
    Priv8Overlay.panelManager("settings");
  },

  about: function() {
    debug("about");
    Priv8Overlay.panelManager("about");
  },

  panelManager: function(aPage) {
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
      if (browserWin.closed || browserWin == window) {
        continue;
      }

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
  },

  _panelManagerPageNoWin: function(aPage) {
    debug("panelManagerPageNoWin");

    function receivePong(aSubject, aTopic, aData) {
      Priv8Overlay._panelManagerPage(aSubject, aPage);
    }

    Services.obs.addObserver(receivePong, "Priv8-manager-pong", false);
    Services.obs.notifyObservers(null, "Priv8-manager-ping", "");
    Services.obs.removeObserver(receivePong, "Priv8-manager-pong");
  },

  // This will switch to the tab in aWindow having aURI, if present.
  _switchIfURIInWindow: function(aWindow, aURI) {
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
  },

  // Determines if a tab is "empty", usually used in the context of determining
  // if it's ok to close the tab.
  _isTabEmpty: function(aTab) {
    let browser = aTab.linkedBrowser;
    return browser.sessionHistory.count < 2 &&
           browser.currentURI.spec == "about:blank" &&
           !browser.contentDocument.body.hasChildNodes() &&
           !aTab.hasAttribute("busy");
  },

  _panelManagerPage: function(aWin, aPage) {
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
  },

  // Configure the manager window:
  managerLoad: function() {
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
  },

  tabOpened: function(aBrowser, aTab) {
    debug("tabOpened");

    let browser = aBrowser.getBrowserForTab(aTab);
    let self = this;

    function onLoad() {
      debug("Tab loaded: " + browser.currentURI.spec);
      if (browser.currentURI.spec != 'about:blank') {
        browser.removeEventListener("load", onLoad, true);

        var docShell = browser.contentWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                                            .getInterface(Components.interfaces.nsIDocShell);

        var appId = docShell.appId;
        if (appId != Components.interfaces.nsIScriptSecurityManager.NO_APP_ID &&
            appId != Components.interfaces.nsIScriptSecurityManager.UNKNOWN_APP_ID) {
          Priv8Overlay._setColor(aTab, appId);
        }
      }
    }

    browser.addEventListener("load", onLoad, true);
  },

  _setColor: function(aTab, aAppId) {
    debug("_setColor");

    var jars = priv8.getCookieJars();
    if (!(aAppId in jars)) {
      return;
    }

    Priv8Overlay._changeColor(aTab, jars[aAppId].color);
  },

  _changeColor: function(aTab, aColor) {
    debug("_changeColor");
    let color = Priv8Overlay._parseColor(aColor);
    let mac = window.navigator.userAgent.toLowerCase().indexOf('macintosh') != -1;

    if(!mac) {
      aTab.style.setProperty('background-image',
                             '-moz-linear-gradient(rgba(255,255,255,.7),' +
                             'rgba(' + color +',.5),rgb(' + color + ')),' +
                             '-moz-linear-gradient(rgb(' + color + '),' +
                             'rgb(' + color + '))', 'important');
    } else {
      var macColor = '-moz-linear-gradient(rgba(255,255,255,0),' +
                     'rgb(' + color + ')),-moz-linear-gradient(rgb(' + color  + '),' +
                     'rgb(' + color + '))';
      document.getAnonymousElementByAttribute(aTab, "class", "tab-background-start")
              .style.setProperty('background-image', macColor, 'important');
      document.getAnonymousElementByAttribute(aTab, "class", "tab-background-middle")
               .style.setProperty('background-image', macColor, 'important');
      document.getAnonymousElementByAttribute(aTab, "class", "tab-background-end")
              .style.setProperty('background-image', macColor, 'important');
    }
  },

  _parseColor: function(aColor) {
    // rgb(...)
    if (aColor.indexOf('rgb') != -1 && aColor.indexOf('rgba') == -1) {
      return aColor.replace('rgb', '')
                   .replace('(', '')
                   .replace(')', '')
    }

    // #ff00ff
    if (aColor.indexOf('#') != -1) {
      aColor = aColor.replace('#', '');

      let r,g,b;

      if (aColor.length == 3) {
        r = parseInt(aColor.substring(0, 1) + '' + aColor.substring(0, 1), 16);
        g = parseInt(aColor.substring(1, 2) + '' + aColor.substring(1, 2), 16);
        b = parseInt(aColor.substring(2, 3) + '' + aColor.substring(2, 3), 16);
      } else {
        r = parseInt(aColor.substring(0, 2), 16);
        g = parseInt(aColor.substring(2, 4), 16)
        b = parseInt(aColor.substring(4, 6), 16);
      }
        
      return r + "," + g + "," + b;
    }

    // color name
    if (aColor in priv8colors) {
      return Priv8Overlay._parseColor(priv8colors[aColor]);
    }

    dump("Error parsing the color\n");
    return 255,0,0;
  }
};
