/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8-colors.jsm");

this.EXPORTED_SYMBOLS = ["priv8"];

function debug(msg) {
  //dump("Priv8.jsm - " + msg + "\n");
}

// Priv8 Component
const priv8 = {
  // ...component implementation...
  _initialized: false,

  _sandboxes: {},

  init: function() {
    debug("init");

    if (this._initialized) {
      return;
    }
    this._initialized = true;

    let data = Services.prefs.getCharPref('extensions.id@baku.priv8.sandboxes');
    try {
      this._sandboxes = JSON.parse(data);
    } catch(e) {
      this._sandboxes = {};
    }
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

    return Components.interfaces.nsIScriptSecurityManager.NO_APP_ID;
  },

  colorForSandbox: function(aSandbox) {
    for (let i in this._sandboxes) {
      if (this._sandboxes[i].name == aSandbox) {
        return this._sandboxes[i].color;
      }
    }

    return "";
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
    let id = this._newSandboxId();
    this._sandboxes[id] = { name: aName,
                            url: "",
                            color: this._randomColor(),
                            id: id };
    this._save();
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

    let mainWindow = aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                            .getInterface(Components.interfaces.nsIWebNavigation)
                            .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                            .rootTreeItem
                            .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                            .getInterface(Components.interfaces.nsIDOMWindow);
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

    tab = browser.getBrowserForTab(tab);
    let docShell = tab.contentWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                                    .getInterface(Components.interfaces.nsIDocShell);
    debug("Opening a new tab with the sandbox");
    docShell.setIsApp(aId);

    let self = this;
    function onLoad() {
      debug("Tab loaded!");
      // First loading opens the waiting page - we are still with the old appId
      if (tab.currentURI.spec == 'about:blank') {
        tab.loadURI('chrome://priv8/content/wait.html');
        return;
      }

      // Here we are running with the right appId.
      tab.removeEventListener("load", onLoad, true);

      let url = aURL;
      if (!url) {
        url = self._sandboxes[aId].url;
      }

      if (typeof(url) != "string" || url.length == 0) {
        url = "chrome://priv8/content/readme.html";
      }

      debug("Opening: " + url);
      tab.loadURI(url);
    }

    tab.addEventListener("load", onLoad, true);
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
      QueryInterface: XPCOMUtils.generateQI([Components.interfaces.mozIApplicationClearPrivateDataParams])
    };

    const serviceMarker = "service,";

    // First create observers from the category manager.
    let cm = Components.classes["@mozilla.org/categorymanager;1"]
                       .getService(Components.interfaces.nsICategoryManager);
    let enumerator = cm.enumerateCategory("webapps-clear-data");

    let observers = [];

    while (enumerator.hasMoreElements()) {
      let entry = enumerator.getNext().QueryInterface(Components.interfaces.nsISupportsCString).data;
      let contractID = cm.getCategoryEntry("webapps-clear-data", entry);

      let factoryFunction;
      if (contractID.substring(0, serviceMarker.length) == serviceMarker) {
        contractID = contractID.substring(serviceMarker.length);
        factoryFunction = "getService";
      } else {
        factoryFunction = "createInstance";
      }

      try {
        let handler = Components.classes[contractID][factoryFunction]();
        if (handler) {
          let observer = handler.QueryInterface(Components.interfaces.nsIObserver);
          observers.push(observer);
        }
      } catch(e) { }
    }

    // Next enumerate the registered observers.
    enumerator = Services.obs.enumerateObservers("webapps-clear-data");
    while (enumerator.hasMoreElements()) {
      try {
        let observer = enumerator.getNext().QueryInterface(Components.interfaces.nsIObserver);
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
  }
};
