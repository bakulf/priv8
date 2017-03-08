/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  _defaultTabStyle: null,

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

  idForSandbox: function(aSandbox) {
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

  getSandboxName: function(aId) {
    if (aId in this._sandboxes) {
      return this._sandboxes[aId].name;
    }

    return null;
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

    let tab = browser.addTab(this._waitURL);
    browser.selectedTab = tab;

    let tabBrowser = browser.getBrowserForTab(tab);

    let self = this;
    function onLoad() {
      debug("Tab loaded!");
      // First loading opens the waiting page - we are still with the old sandbox
      if (tabBrowser.currentURI.spec != 'about:blank') {
        tabBrowser.loadURI('about:blank');
        return;
      }

      // Here we are running with the right sandbox.
      tabBrowser.removeEventListener("load", onLoad, true);

      debug("Opening a new tab with the sandbox");
      self.configureWindow(tab, tabBrowser, aId, () => {
        let url = aURL;
        if (!url) {
          url = self._sandboxes[aId].url;
        }

        if (typeof(url) != "string" || url.length == 0) {
          url = self._readmeURL;
        }

        debug("Opening: " + url);
        tabBrowser.loadURI(url);

        self.highlightBrowser(tab, tabBrowser);
      });
    }

    tabBrowser.addEventListener("load", onLoad, true);
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

  getSandboxFromOriginAttributes: function(aAttr) {
    if ("firstPartyDomain" in aAttr) {
      debug("Using firstPartyDomain!");
      return this.getSandboxFromOriginAttributesInternal(aAttr, "firstPartyDomain", "string");
    }

    debug("Using appId!");
    return this.getSandboxFromOriginAttributesInternal(aAttr, "appId", "int");
  },

  getSandboxFromOriginAttributesInternal: function(aAttr, aWhat, aType) {
    if (aType == "string") {
      if (aAttr[aWhat].indexOf("priv8-") != 0) {
        return 0;
      }

      return parseInt(aAttr[aWhat].substring("priv8-".length), 10);
    }

    return aAttr[aWhat];
  },

  configureWindowByName: function(aTab, aBrowser, aSandbox, aCb) {
    return this.configureWindow(aTab, aBrowser, this.idForSandbox(aSandbox), aCb);
  },

  configureWindow: function(aTab, aBrowser, aId, aCb = null) {
    if (!aCb) { aCb = function(aStatus) {} }

    this._sessionStore.setTabValue(aTab, this.TAB_DATA_IDENTIFIER,
                                   JSON.stringify({ priv8sandbox: aId }));

    this.getOriginAttributes(aBrowser, (aAttr) => {
      if (this.getSandboxFromOriginAttributes(aAttr) == aId) {
        aCb(false);
        return;
      }

      if ("firstPartyDomain" in aAttr) {
        debug("Using firstPartyDomain!");
        aAttr.firstPartyDomain = aId ? "priv8-" + aId : "";
      } else {
        debug("Using appId!");
        aAttr.appId = aId;
      }

      this.setOriginAttributes(aBrowser, aAttr, () => { aCb(true); });
    });
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

  getOriginAttributes: function(aBrowser, aCb) {
    if (!aBrowser.contentWindow || !aBrowser.contentWindow.QueryInterface) {
      debug("e10s mode");

      var mm = aBrowser.messageManager;
      if (!mm) {
        aCb({});
        return;
      }

      var listener = {
        receiveMessage: function(aMsg) {
          mm.removeMessageListener("priv8-oa", listener);
          aCb(aMsg.data);
        }
      }
      mm.addMessageListener("priv8-oa", listener);

      function scriptFunction() {
        sendAsyncMessage("priv8-oa", docShell.getOriginAttributes());
      }

      debug("Loading script...");
      var scriptString = scriptFunction.toString();
      var scriptSource = scriptString.substring(scriptString.indexOf('\n') + 1, scriptString.length - 1);
      mm.loadFrameScript('data:,' + scriptSource, true);
      return;
    }

    debug("non-e10s mode");
    let docShell = aBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIDocShell);
    aCb(docShell.getOriginAttributes());
  },

  setOriginAttributes: function(aBrowser, aAttr, aCb) {
    var mm = aBrowser.messageManager;
    if (mm) {
      debug("e10s mode");

      function scriptFunction() {
        function priv8msg(aMsg) {
          removeMessageListener("priv8-oa", priv8msg);
          docShell.setOriginAttributes(aMsg.data);
          sendAsyncMessage("priv8-oa-done");
        };
        addMessageListener("priv8-oa", priv8msg);
        sendAsyncMessage("priv8-oa-ready");
      }

      debug("Loading script...");
      var scriptString = scriptFunction.toString();
      var scriptSource = scriptString.substring(scriptString.indexOf('\n') + 1, scriptString.length - 1);
      mm.loadFrameScript('data:,' + scriptSource, true);

      var listener = {
        receiveMessage: function(aMsg) {
          switch (aMsg.name) {
            case 'priv8-oa-ready':
              debug("Content is ready, setting OA");
              mm.removeMessageListener("priv8-oa-ready", listener);
              mm.sendAsyncMessage("priv8-oa", aAttr);
              break;
            case 'priv8-oa-done':
              debug("Content has done.");
              mm.removeMessageListener("priv8-oa-done", listener);
              aCb();
              break;
          }
        }
      }
      mm.addMessageListener("priv8-oa-ready", listener);
      mm.addMessageListener("priv8-oa-done", listener);
      return;
    }

    debug("non-e10s mode");
    let docShell = aBrowser.contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIDocShell);
    docShell.setOriginAttributes(aAttr);
    aCb();
  },

  highlightBrowser: function(aTab, aBrowser) {
    debug("highlightBrowser");

    if (this._defaultBrowserStyle === null) {
      debug("First time, let's store the default style.");
      this._defaultBrowserStyle = aBrowser.style.border;
      this._defaultTabStyle = aTab.style.color;
    }

    this.getOriginAttributes(aBrowser, (aAttr) => {
      let id = this.getSandboxFromOriginAttributes(aAttr);
      if (!id) {
        debug("Setting default color.");
        aBrowser.style.border = this._defaultBrowserStyle;
        aTab.style.color = this._defaultTabStyle;
        return;
      }

      if (!(id in this._sandboxes)) {
        debug("Setting default color.");
        aBrowser.style.border = this._defaultBrowserStyle;
        return;
      }

      debug("Setting sandbox color.");
      aBrowser.style.border = "3px solid " + this._sandboxes[id].color;
      aTab.style.color = this._sandboxes[id].color;
    });
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
    let browser = window.gBrowser.getBrowserForTab(aTab);

    let self = this;
    function restoreTabReal() {
      let id = "appId" in data ? data.appId : data.priv8sandbox;
      self.configureWindow(aTab, browser, id);
      self.highlightBrowser(aTab, browser);
    }

    if (browser.currentURI.spec == 'about:blank') {
      restoreTabReal();
      return;
    }

    let url = browser.currentURI.spec;
    function onLoad() {
      if (browser.currentURI.spec != 'about:blank') {
        return;
      }

      browser.removeEventListener("load", onLoad, true);
      restoreTabReal();
      browser.loadURI(url);
    }

    browser.addEventListener("load", onLoad, true);
    browser.loadURI('about:blank');
  }
};
