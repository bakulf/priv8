/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8.jsm");

// Gecko 1.9.0/1.9.1 compatibility - add XPCOMUtils.defineLazyServiceGetter
if (!("defineLazyServiceGetter" in XPCOMUtils)) {
  XPCOMUtils.defineLazyServiceGetter = function XPCU_defineLazyServiceGetter(obj, prop, contract, iface) {
    obj.__defineGetter__(prop, function XPCU_serviceGetter() {
      delete obj[prop];
      return obj[prop] = Components.classes[contract]
                                   .getService(Components.interfaces[iface]);
    });
  };
}

// Load dependences:
XPCOMUtils.defineLazyServiceGetter(this, "loader", "@mozilla.org/moz/jssubscript-loader;1", "mozIJSSubScriptLoader");

/**
 * Application startup/shutdown observer, triggers init()/shutdown() methods in 'priv8' object.
 * @constructor
 */
function Priv8Initializer() {}
Priv8Initializer.prototype = {
  classDescription: "Priv8 initializer",
  contractID: "@baku.priv8/priv8Startup;1",
  classID: Components.ID("{1ad9de19-4d0c-4b40-9ddb-e91fdeacdd06}"),
  _xpcom_categories: [{ category: "app-startup", service: true }],

  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver,
                                         Components.interfaces.nsISupportsWeakReference]),

  observe: function(subject, topic, data) {
    switch(topic) {
      case "app-startup":
        let observerService = Components.classes["@mozilla.org/observer-service;1"]
                                        .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this, "profile-after-change", true);
        observerService.addObserver(this, "quit-application", true);
        break;
      case "profile-after-change":
        let appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
                                .getService(Components.interfaces.nsIXULAppInfo);
        if (appInfo.ID != "{1810dfbe-8d2e-4ce4-bd51-ffd3a5a6da67}") {
          priv8.init();
        }
        break;
      case "quit-application":
        priv8.shutdown();
        break;
    }
  }
};

/* Module declaration */
if (XPCOMUtils.generateNSGetFactory) {
  var NSGetFactory = XPCOMUtils.generateNSGetFactory([Priv8Initializer]);
} else {
  var NSGetModule = XPCOMUtils.generateNSGetModule([Priv8Initializer]);
}
