/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8-colors.jsm");

this.EXPORTED_SYMBOLS = ["priv8"];

function debug(msg) {
  dump("Priv8.jsm - " + msg + "\n");
}

// Priv8 Component
const priv8 = {
  // ...component implementation...
  _initialized: false,

  _firstRun: true,
  _cookieJars: {},

  init: function() {
    debug("init");

    if (this._initialized) {
      return;
    }
    this._initialized = true;

    // Preferences:
    this._firstRun = Services.prefs.getBoolPref('extensions.priv8.firstRun');
    if (this._firstRun == true) {
      Services.prefs.setBoolPref('extensions.priv8.firstRun', false);
    }

    let data = Services.prefs.getCharPref('extensions.priv8.cookieJars');
    try {
      this._cookieJars = JSON.parse(data);
    } catch(e) {
      this._cookieJars = {};
    }
  },

  shutdown: function() {
    debug("shutdown");
    // nothing special
  },

  firstRun: function() {
    return this._firstRun;
  },

  getCookieJars: function() {
    debug("getCookieJars");
    return this._cookieJars;
  },

  createCookieJar: function(aName) {
    debug("Create cookie jar: " + aName);
    let id = this._newCookieJarId();
    this._cookieJars[id] = { name: aName,
                             url: "",
                             color: this._randomColor(),
                             id: id };
    this._save();
  },

  openCookieJar: function(aWindow, aJarId) {
    debug("Open cookie jar: " + aJarId);

    if (!(aJarId in this._cookieJars)) {
      return;
    }

    var mainWindow = aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                            .getInterface(Components.interfaces.nsIWebNavigation)
                            .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                            .rootTreeItem
                            .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                            .getInterface(Components.interfaces.nsIDOMWindow);
    if (!mainWindow) {
      dump("Error getting the mainWindow\n");
      return;
    }

    var browser = mainWindow.gBrowser;
    if (!browser) {
      dump("Error getting the browser\n");
      return;
    }

    var tab = browser.addTab("about:blank");
    // TODO: browser.selectedTab = tab;

    tab = browser.getBrowserForTab(tab);
    var docShell = tab.contentWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                                    .getInterface(Components.interfaces.nsIDocShell);
    debug("Opening a new tab with the jar");
    docShell.setIsApp(aJarId);

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

      var url = self._cookieJars[aJarId].url;
      if (typeof(url) != "string" || url.length == 0) {
        url = "chrome://priv8/content/readme.html";
      }

      debug("Opening: " + url);
      tab.loadURI(url);
    }

    tab.addEventListener("load", onLoad, true);
  },

  renameCookieJar: function(aJarId, aName) {
    debug("Cookie Jar renamed: " + aName);
    if (aJarId in this._cookieJars) {
      this._cookieJars[aJarId].name = aName;
      this._save();
    }
  },

  deleteCookieJar: function(aJarId) {
    debug("Cookie Jar deleted: " + aJarId);
    if (!(aJarId in this._cookieJars)) {
      return;
    }

    let subject = {
      appId: aJarId,
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
    delete this._cookieJars[aJarId];
    this._save();

    debug("Notification sent!");
  },

  updateCookieJar: function(aJarId, aURL, aColor) {
    debug("URL update for Jar: " + aJarId);

    if (aJarId in this._cookieJars) {
      this._cookieJars[aJarId].url = aURL;
      this._cookieJars[aJarId].color = aColor;
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

  _newCookieJarId: function() {
    let id = Services.prefs.getIntPref("extensions.priv8.maxLocalId") + 1;
    Services.prefs.setIntPref("extensions.priv8.maxLocalId", id);
    Services.prefs.savePrefFile(null);
    return id;
  },

  _save: function() {
    Services.prefs.setCharPref('extensions.priv8.cookieJars',
                               JSON.stringify(this._cookieJars));
    Services.prefs.savePrefFile(null);
    debug("saved!");
  }
};
