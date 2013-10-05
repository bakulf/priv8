/* See license.txt for terms of usage */

Components.utils.import("chrome://priv8/content/modules/priv8-manager.jsm");

function debug(msg) {
  dump("Priv8-manager.js - " + msg + "\n");
}

// Main object for the manager (it's just a proxy for the single page objects)
function Priv8Manager() {}

// Initializer
Priv8Manager.initialize = function() {
  debug("initialize");
  Services.obs.addObserver(Priv8Manager._sendPong, "Priv8-manager-ping", false);
  Priv8Overlay.managerLoad();

  window.priv8ManagerData = new Priv8ManagerData(window, document);

  // Send a message about the loading completed
  Services.obs.notifyObservers(window, "Priv8-manager-loaded", "");
}

// Shutdown
Priv8Manager.shutdown = function() {
  debug("shutdown");
  Services.obs.removeObserver(Priv8Manager._sendPong, "Priv8-manager-ping");

  if (!window.priv8ManagerData)
    return;

  window.priv8ManagerData.shutdown();
  window.priv8ManagerData = null;
}

// Send a ping to inform when the UI is ready:
Priv8Manager._sendPong = function(aSubject, aTopic, aData) {
  debug("sendPong");
  Services.obs.notifyObservers(window, "Priv8-manager-pong", "");
}
