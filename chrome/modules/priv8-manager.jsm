/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("chrome://priv8/content/modules/priv8.jsm");
Cu.import("chrome://priv8/content/modules/priv8-colors.jsm");

function debug(msg) {
  //dump("Priv8-manager.jsm - " + msg + "\n");
}

this.EXPORTED_SYMBOLS = ["Priv8ManagerData"];

// Translate a page
function priv8Translate(aStrbundle, aBrowser) {
  let list = aBrowser.contentDocument.getElementsByClassName('trans');
  for (let i = 0; i < list.length; ++i) {
     list[i].textContent = aStrbundle.getString(list[i].textContent);
  }

  list = aBrowser.contentDocument.getElementsByClassName('transattr');
  for (let i = 0; i < list.length; ++i) {
     let attr = list[i].getAttribute('data-trans');
     list[i].setAttribute(attr, aStrbundle.getString(list[i].getAttribute(attr)));
  }
}

// Objects -------------------------------------------------------------------

// Object for the 'settings' view:
function Priv8ManagerSettings(aWindow, aDocument) {
  this.initialize(aWindow, aDocument);
}

Priv8ManagerSettings.prototype = {
  _browser: null,
  _timer: null,
  _prompt: null,

  _document: null,
  _window: null,

  initialize: function(aWindow, aDocument) {
    debug("Settings initialize");

    this._window = aWindow;
    this._document = aDocument;

    this._browser = this._document.getElementById('settings-browser');
    this._browser.addProgressListener(this, Ci.nsIWebProgress.NOTIFY_ALL |
                                            Ci.nsIWebProgress.NOTIFY_STATE_ALL);
  },

  shutdown: function() {
    debug("Settings shutdown");

    this._browser = null;
    this._timer = null;
    this._prompt = null;

    this._document = null;
    this._window = null;
  },

  show: function() {
    debug("Settings show");

    this._browser.loadURIWithFlags('chrome://priv8/content/manager/settings.html',
                                   Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
  },

  // For progress listener
  onLocationChange: function(aWebProgress, aRequest, aLocation) {},

  onProgressChange: function() {},

  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Don't care about state but window
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_IS_WINDOW))) {
      return;
    }

    // Only when the operation is concluded
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_STOP))) {
      return;
    }

    // Translate
    priv8Translate(this._document.getElementById("priv8strings"), this._browser);

    let self = this;
    this._browser.contentDocument.getElementById('create').addEventListener('click', function() {
      self.createSandbox();
    }, false);

    let dom = this._browser.contentDocument.getElementById('sandboxes-list');
    while (dom.hasChildNodes()) {
      dom.removeChild(dom.lastChild);
    }

    let sandboxes = priv8.getSandboxes();
    for (let i in sandboxes) {
      this.createElementSandbox(dom, sandboxes[i]);
    }
  },

  createElementSandbox: function(aDom, aSandbox) {
    let self = this;

    let strbundle = this._document.getElementById("priv8strings");

    // Title:
    let title = this._browser.contentDocument.createElement('h2');
    title.appendChild(this._browser.contentDocument.createTextNode(aSandbox.name));
    aDom.appendChild(title);

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.sandboxes.delete"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.deleteSandbox(aSandbox);
      }, false);
    }

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.sandboxes.rename"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.renameSandbox(aSandbox);
      }, false);
    }

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.sandboxes.open"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.openSandbox(aSandbox);
      }, false);
    }

    let obj = this._browser.contentDocument.createElement('ul');
    aDom.appendChild(obj);

    // URL
    let li = this._browser.contentDocument.createElement('li');
    obj.appendChild(li);

    let info;
    info = this._browser.contentDocument.createElement('strong');
    info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.sandboxes.url")));
    li.appendChild(info);

    let urlInput = this._browser.contentDocument.createElement('input');
    urlInput.setAttribute('type', 'text');
    urlInput.setAttribute('value', typeof(aSandbox.url) == "string" ? aSandbox.url : '');
    urlInput.setAttribute('placeholder', strbundle.getString("Manager.sandboxes.urlDescription"));
    li.appendChild(urlInput);

    // Color
    li = this._browser.contentDocument.createElement('li');
    obj.appendChild(li);

    info = this._browser.contentDocument.createElement('strong');
    info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.sandboxes.color")));
    li.appendChild(info);

    let colorInput = this._browser.contentDocument.createElement('select');
    for (let color in priv8colors) {
      let option = this._browser.contentDocument.createElement('option');
      option.setAttribute('value', color);
      option.setAttribute('style', 'background-color: ' + color);
      option.appendChild(this._browser.contentDocument.createTextNode(color));
      colorInput.appendChild(option);

      if (typeof(aSandbox.color) == "string" && aSandbox.color == color) {
        option.setAttribute('selected', 'selected');
      }
    }

    li.appendChild(colorInput);

    urlInput.addEventListener('change', function() {
      priv8.updateSandbox(aSandbox.id, urlInput.value, colorInput.value);
    }, false);

    colorInput.addEventListener('change', function() {
      priv8.updateSandbox(aSandbox.id, urlInput.value, colorInput.value);
    }, false);
  },

  createSandbox: function() {
    this.needPrompt();

    let strbundle = this._document.getElementById("priv8strings");

    let name = {value: ''};

    if (this._prompt.prompt(this._window,
                            strbundle.getString('Manager.sandboxes.createSandboxTitle'),
                            strbundle.getString('Manager.sandboxes.createSandbox'),
                            name, null, {value: 0})) {
      if (name.value.length == 0) {
        this._prompt.alert(this._window,
                           strbundle.getString('Manager.sandboxes.errorCreateTitle'),
                           strbundle.getString('Manager.sandboxes.errorCreateLength'));
        return;           
      }

      if (!priv8.createSandbox(name.value)) {
        this._prompt.alert(this._window,
                           strbundle.getString('Manager.sandboxes.errorCreateTitle'),
                           strbundle.getString('Manager.sandboxes.errorCreateDup'));
      }

      this.show();
    }
  },

  openSandbox: function(aSandbox) {
    priv8.openSandbox(this._window, aSandbox.id);
  },

  renameSandbox: function(aSandbox) {
    this.needPrompt();

    let strbundle = this._document.getElementById("priv8strings");

    let newName = {value: aSandbox.name};

    if (this._prompt.prompt(this._window,
                            strbundle.getString('Manager.sandboxes.renameSandboxTitle'),
                            strbundle.getFormattedString('Manager.sandboxes.renameSandbox', [aSandbox.name]),
                            newName, null, {value:0})) {
      newName = newName.value;

      if (newName == aSandbox.name) {
        return false;
      }

      priv8.renameSandbox(aSandbox.id, newName);
      this.show();
    }
  },

  deleteSandbox: function(aSandbox) {
    let deleteFiles = false;

    let strbundle = this._document.getElementById("priv8strings");


    this.needPrompt();

    if (!this._prompt.confirm(this._window,
                              strbundle.getString('Manager.sandboxes.deleteSandboxTitle'),
                              strbundle.getString('Manager.sandboxes.deleteSandboxConfirm'))) {
      return;
    }

    priv8.deleteSandbox(aSandbox.id);
    this.show();
  },

  needPrompt: function() {
    if (!this._prompt) {
      this._prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                       .getService(Ci.nsIPromptService);
    }
  },

  onStatusChange: function() {},

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                       Ci.nsISupportsWeakReference])
};

// Object for the 'about' view:
function Priv8ManagerAbout(aWindow, aDocument) {
  this.initialize(aWindow, aDocument);
}
Priv8ManagerAbout.prototype = {
  _browser: null,

  _document: null,
  _window: null,

  initialize: function(aWindow, aDocument) {
    debug("about initialize");

    this._window = aWindow;
    this._document = aDocument;

    this._browser = this._document.getElementById('about-browser');
    this._browser.addProgressListener(this, Ci.nsIWebProgress.NOTIFY_ALL |
                                            Ci.nsIWebProgress.NOTIFY_STATE_ALL);
  },

  shutdown: function() {
    debug("about shutdown");

    this._browser = null;

    this._document = null;
    this._window = null;
  },

  show: function() {
    debug("about show");

    this._browser.loadURIWithFlags('chrome://priv8/content/manager/about.html',
                                   Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
  },

  // For progress listener
  onLocationChange: function(aWebProgress, aRequest, aLocation) {},

  onProgressChange: function() {},

  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Don't care about state but window
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_IS_WINDOW))) {
      return;
    }

    // Only when the operation is concluded
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_STOP))) {
      return;
    }

    // Translate
    priv8Translate(this._document.getElementById("priv8strings"), this._browser);
  },

  onStatusChange: function() {},

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference])
};

// Object for the 'help' view:
function Priv8ManagerHelp(aWindow, aDocument) {
  this.initialize(aWindow, aDocument);
}
Priv8ManagerHelp.prototype = {
  _browser: null,

  _document: null,
  _window: null,

  initialize: function(aWindow, aDocument) {
    debug("help initialize");

    this._window = aWindow;
    this._document = aDocument;

    this._browser = this._document.getElementById('help-browser');
    this._browser.addProgressListener(this, Ci.nsIWebProgress.NOTIFY_ALL |
                                            Ci.nsIWebProgress.NOTIFY_STATE_ALL);
  },

  shutdown: function() {
    debug("help shutdown");

    this._browser = null;

    this._document = null;
    this._window = null;
  },

  show: function() {
    debug("help show");

    this._browser.loadURIWithFlags('chrome://priv8/content/manager/help.html',
                                   Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
  },

  // For progress listener
  onLocationChange: function(aWebProgress, aRequest, aLocation) {},

  onProgressChange: function() {},

  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Don't care about state but window
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_IS_WINDOW))) {
      return;
    }

    // Only when the operation is concluded
    if (!(aStateFlags & (Ci.nsIWebProgressListener.STATE_STOP))) {
      return;
    }

    // Translate
    priv8Translate(this._document.getElementById("priv8strings"), this._browser);

    this._browser.contentDocument.getElementById("priv8help").addEventListener("click", () => {
      let mainWindow = this._window.QueryInterface(Ci.nsIInterfaceRequestor)
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

      let tab = browser.addTab("https://testpilot.firefox.com/experiments/containers");
      browser.selectedTab = tab;
    });
  },

  onStatusChange: function() {},

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference])
};

// Object data
this.Priv8ManagerData = function(aWindow, document) {
  this.initialize(aWindow, document);
}

this.Priv8ManagerData.prototype = {
  document : null,

  node : null,
  pages : null,

  initialize : function(aWindow, aDocument) {
    debug("data initialize");

    this.document = aDocument;

    this.node = aDocument.getElementById("categories");
    this.pages = [
      { funcName: 'pageSettings', id: 'category-settings', page_id: 'settings-view', obj: new Priv8ManagerSettings(aWindow, aDocument) },
      { funcName: 'pageAbout',  id: 'category-about',  page_id: 'about-view',  obj: new Priv8ManagerAbout(aWindow, aDocument)  },
      { funcName: 'pageHelp',  id: 'category-help',  page_id: 'help-view',  obj: new Priv8ManagerHelp(aWindow, aDocument)  }
    ];

    for (let i = 0; i < this.pages.length; ++i) {
      this[this.pages[i].funcName] = () => {
        this.node.selectItem(this.document.getElementById(this.pages[i].id));
      };
    }

    // Event listener:
    let self = this;
    this.node.addEventListener("select", function() { self._pageSelected(); }, false);

    // Select a view:
    this.node.selectItem(aDocument.getElementById(this.pages[0].id));
    this._pageSelected();
  },

  shutdown : function() {
    debug("data shutdown");

    // Shutdown any object:
    for (let i = 0; i < this.pages.length; ++i) {
      this.pages[i].obj.shutdown();
    }

    this.document = null;
  },

  _pageSelected : function() {
    for (let i = 0; i < this.pages.length; ++i) {
      if (this.pages[i].id == this.node.selectedItem.id) {
        this.document.getElementById(this.pages[i].page_id).hidden = false;
        this.pages[i].obj.show();
      } else {
        this.document.getElementById(this.pages[i].page_id).hidden = true;
      }
    }
  }
};
