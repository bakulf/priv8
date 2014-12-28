/* See license.txt for terms of usage */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://priv8/content/modules/priv8-colors.jsm");

this.EXPORTED_SYMBOLS = ["priv8"];

function debug(msg) {
  //dump("Priv8.jsm - " + msg + "\n");
}

// Priv8 Component
const priv8 = {
  // ...component implementation...
  _sandboxes: {},

  _waitURL: null,
  _readmeURL: null,
  _defaultBrowserStyle: null,

  _sessionStore: null,

  init: function(aWaitURL, aReadmeURL) {
    debug("init");

    this._waitURL = aWaitURL;
    this._readmeURL = aReadmeURL;

    let data = Services.prefs.getCharPref('extensions.id@baku.priv8.sandboxes');
    try {
      this._sandboxes = JSON.parse(data);
    } catch(e) {
      this._sandboxes = {};
    }

    this._sessionStore = Cc["@mozilla.org/browser/sessionstore;1"].
                           getService(Ci.nsISessionStore);
  },

  shutdown: function() {
    debug("shutdown");
    // nothing special
  },

  appIdForSandbox: function(aSandbox) {
    for (let i in this._sandboxes) {
      if (this._sandboxes[i].name == aSandbox) {
        return i;
      }
    }

    return Ci.nsIScriptSecurityManager.NO_APP_ID;
  },

  getSandboxes: function() {
    debug("getSandboxes");
    return this._sandboxes;
  },

  getSandboxNames: function() {
    debug("getSandboxNames");
    let names = [];
    for (let i in this._sandboxes) {
      names.push(this._sandboxes[i].name);
    }
    return names;
  },

  createSandbox: function(aName) {
    debug("Create sandbox: " + aName);

    for (let i in this._sandboxes) {
      if (this._sandboxes[i].name == aName) {
        return false;
      }
    }

    let id = this._newSandboxId();
    this._sandboxes[id] = { name: aName,
                            url: "",
                            color: this._randomColor(),
                            id: id };
    this._save();
    return true;
  },

  openSandboxByName: function(aWindow, aName, aURL) {
    debug("Open sandboxByName: " + aName);
    for (let i in this._sandboxes) {
      if (this._sandboxes[i].name == aName) {
        this.openSandbox(aWindow, i, aURL);
        return;
      }
    }
  },

  openSandbox: function(aWindow, aId, aURL) {
    debug("Open sandbox: " + aId);

    if (!(aId in this._sandboxes)) {
      return;
    }

    let mainWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIWebNavigation)
                            .QueryInterface(Ci.nsIDocShellTreeItem)
                            .rootTreeItem
                            .QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIDOMWindow);
    if (!mainWindow) {
      dump("Error getting the mainWindow\n");
      return;
    }

    let browser = mainWindow.gBrowser;
    if (!browser) {
      dump("Error getting the browser\n");
      return;
    }

    let tab = browser.addTab("about:blank");
    tab.style.color = this._sandboxes[aId].color;
    browser.selectedTab = tab;

    browser = browser.getBrowserForTab(tab);

    debug("Opening a new tab with the sandbox");
    this.configureWindow(tab, browser.contentWindow, aId);

    let self = this;
    function onLoad() {
      debug("Tab loaded!");
      // First loading opens the waiting page - we are still with the old appId
      if (browser.currentURI.spec == 'about:blank') {
        browser.loadURI(self._waitURL);
        return;
      }

      // Here we are running with the right appId.
      browser.removeEventListener("load", onLoad, true);

      let url = aURL;
      if (!url) {
        url = self._sandboxes[aId].url;
      }

      if (typeof(url) != "string" || url.length == 0) {
        url = self._readmeURL;
      }

      debug("Opening: " + url);
      browser.loadURI(url);

      self.highlightBrowser(browser);
    }

    browser.addEventListener("load", onLoad, true);
  },

  renameSandbox: function(aId, aName) {
    debug("Sandbox renamed: " + aName);
    if (aId in this._sandboxes) {
      this._sandboxes[aId].name = aName;
      this._save();
    }
  },

  deleteSandbox: function(aId) {
    debug("Sandbox deleted: " + aId);
    if (!(aId in this._sandboxes)) {
      return;
    }

    let subject = {
      appId: aId,
      browserOnly: false,
      QueryInterface: XPCOMUtils.generateQI([Ci.mozIApplicationClearPrivateDataParams])
    };

    const serviceMarker = "service,";

    // First create observers from the category manager.
    let cm = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
    let enumerator = cm.enumerateCategory("webapps-clear-data");

    let observers = [];

    while (enumerator.hasMoreElements()) {
      let entry = enumerator.getNext().QueryInterface(Ci.nsISupportsCString).data;
      let contractID = cm.getCategoryEntry("webapps-clear-data", entry);

      let factoryFunction;
      if (contractID.substring(0, serviceMarker.length) == serviceMarker) {
        contractID = contractID.substring(serviceMarker.length);
        factoryFunction = "getService";
      } else {
        factoryFunction = "createInstance";
      }

      try {
        let handler = Cc[contractID][factoryFunction]();
        if (handler) {
          let observer = handler.QueryInterface(Ci.nsIObserver);
          observers.push(observer);
        }
      } catch(e) { }
    }

    // Next enumerate the registered observers.
    enumerator = Services.obs.enumerateObservers("webapps-clear-data");
    while (enumerator.hasMoreElements()) {
      try {
        let observer = enumerator.getNext().QueryInterface(Ci.nsIObserver);
        if (observers.indexOf(observer) == -1) {
          observers.push(observer);
        }
      } catch (e) { }
    }

    observers.forEach(function (observer) {
      try {
        observer.observe(subject, "webapps-clear-data", null);
      } catch(e) { }
    });

    // Real operation
    delete this._sandboxes[aId];
    this._save();

    debug("Notification sent!");
  },

  updateSandbox: function(aId, aURL, aColor) {
    debug("URL update for sandbox: " + aId);

    if (aId in this._sandboxes) {
      this._sandboxes[aId].url = aURL;
      this._sandboxes[aId].color = aColor;
      this._save();
    }
  },

  configureWindowByName: function(aTab, aWindow, aSandbox) {
    return this.configureWindow(aTab, aWindow, this.appIdForSandbox(aSandbox));
  },

  configureWindow: function(aTab, aWindow, aId) {
    this._sessionStore.setTabValue(aTab, this.TAB_DATA_IDENTIFIER,
                                   JSON.stringify({ appId: aId }));

    let docShell = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                          .getInterface(Ci.nsIDocShell);
    if (docShell.appId == aId) {
      return false;
    }

    docShell.setIsApp(aId);
    aTab.style.color = (aId == Ci.nsIScriptSecurityManager.NO_APP_ID
                         ? "" : this._sandboxes[aId].color);
    return true;
  },

  _randomColor: function() {
    let colors = [];
    for (aColor in priv8colors) {
      colors.push(aColor);
    }

    return colors[Math.floor(Math.random() * colors.length)];
  },

  _newSandboxId: function() {
    let id = Services.prefs.getIntPref("extensions.id@baku.priv8.maxLocalId") + 1;
    Services.prefs.setIntPref("extensions.id@baku.priv8.maxLocalId", id);
    Services.prefs.savePrefFile(null);
    return id;
  },

  _save: function() {
    Services.prefs.setCharPref('extensions.id@baku.priv8.sandboxes',
                               JSON.stringify(this._sandboxes));
    Services.prefs.savePrefFile(null);
    Services.obs.notifyObservers(null, "priv8-refresh-needed", null);
    debug("saved!");
  },

  highlightBrowser: function(aBrowser) {
    debug("highlightBrowser");

    if (this._defaultBrowserStyle === null) {
      debug("First time, let's store the default style.");
      this._defaultBrowserStyle = aBrowser.style.border;
    }

    let docShell = aBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIDocShell);
    if (docShell.appId == Ci.nsIScriptSecurityManager.NO_APP_ID) {
      debug("Setting default color.");
      aBrowser.style.border = this._defaultBrowserStyle;
      return;
    }

    let appId = docShell.appId;
    if (!(appId in this._sandboxes)) {
      debug("Setting default color.");
      aBrowser.style.border = this._defaultBrowserStyle;
      return;
    }

    debug("Setting sandbox color.");
    aBrowser.style.border = "3px solid " + this._sandboxes[appId].color;
  },

  tabRestoring: function(aEvent) {
    debug("tabRestoring");
    let tab = aEvent.originalTarget;
    this.restoreTab(tab);
  },

  restoreTab: function(aTab) {
    debug("restoreTab");
    let data = this._sessionStore.getTabValue(aTab, this.TAB_DATA_IDENTIFIER);

    try {
      data = JSON.parse(data);
    } catch(e) {
      return;
    }

    let window = aTab.ownerDocument.defaultView;
    let innerTab = window.gBrowser.getBrowserForTab(aTab);
    this.configureWindow(aTab, innerTab.contentWindow, data.appId);
    this.highlightBrowser(window.gBrowser);
  }
};
