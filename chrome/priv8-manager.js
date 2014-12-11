/* See license.txt for terms of usage */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://priv8/content/modules/priv8-manager.jsm");

// Main object for the manager (it's just a proxy for the single page objects)
function Priv8Manager() {}

// Initializer
Priv8Manager.initialize = function() {
  Services.obs.addObserver(Priv8Manager._sendPong, "Priv8-manager-ping", false);

  let win = window.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIWebNavigation)
                  .QueryInterface(Ci.nsIDocShellTreeItem)
                  .rootTreeItem
                  .QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIDOMWindow);

  try {
    win.document.documentElement.setAttribute("disablechrome", "true");
    document.documentElement.setAttribute("disablechrome", "true");
  } catch(e) {}

  // Emm... I want to be in the white-list :)
  try {
    win.top.XULBrowserWindow.inContentWhitelist.push('chrome://priv8/content/manager.xul');
  } catch(e) {}

  window.priv8ManagerData = new Priv8ManagerData(window, document);

  // Send a message about the loading completed
  Services.obs.notifyObservers(window, "Priv8-manager-loaded", "");
}

// Shutdown
Priv8Manager.shutdown = function() {
  Services.obs.removeObserver(Priv8Manager._sendPong, "Priv8-manager-ping");

  if (!window.priv8ManagerData) {
    return;
  }

  window.priv8ManagerData.shutdown();
  window.priv8ManagerData = null;
}

// Send a ping to inform when the UI is ready:
Priv8Manager._sendPong = function(aSubject, aTopic, aData) {
  Services.obs.notifyObservers(window, "Priv8-manager-pong", "");
}
