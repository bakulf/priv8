/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("chrome://priv8/content/modules/priv8.jsm");

function debug(msg) {
  dump("Priv8-manager.jsm - " + msg + "\n");
}

this.EXPORTED_SYMBOLS = ["Priv8ManagerData"];

// Translate a page
function priv8Translate(aStrbundle, aBrowser) {
  let list = aBrowser.contentDocument.getElementsByClassName('trans');
  for (let i = 0; i < list.length; ++i) {
     list[i].innerHTML = aStrbundle.getString(list[i].innerHTML);
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
    this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                            Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
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
                                   Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
  },

  // For progress listener
  onLocationChange: function(aWebProgress, aRequest, aLocation) {},

  onProgressChange: function() {},

  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Don't care about state but window
    if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW))) {
      return;
    }

    // Only when the operation is concluded
    if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_STOP))) {
      return;
    }

    // Translate
    priv8Translate(this._document.getElementById("priv8strings"), this._browser);

    let self = this;
    this._browser.contentDocument.getElementById('create').addEventListener('click', function() {
      self.createCookieJar();
    }, false);

    let dom = this._browser.contentDocument.getElementById('cookieJars-list');
    dom.innerHTML = ''; // Fastest way to remove all the content

    let jars = priv8.getCookieJars();
    for (let i in jars) {
      this.createElementCookieJar(dom, jars[i]);
    }
  },

  createElementCookieJar: function(aDom, aJar) {
    let self = this;

    let strbundle = this._document.getElementById("priv8strings");

    // Title:
    let title = this._browser.contentDocument.createElement('h2');
    title.appendChild(this._browser.contentDocument.createTextNode(aJar.name));
    aDom.appendChild(title);

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.cookieJars.delete"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.deleteCookieJar(aJar);
      }, false);
    }

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.cookieJars.rename"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.renameCookieJar(aJar);
      }, false);
    }

    {
      let button = this._browser.contentDocument.createElement('input');
      button.setAttribute('class', 'right');
      button.setAttribute('type', 'button');
      button.setAttribute('value', strbundle.getString("Manager.cookieJars.open"));
      title.appendChild(button);

      button.addEventListener('click', function() {
        self.openCookieJar(aJar);
      }, false);
    }

    let obj = this._browser.contentDocument.createElement('ul');
    aDom.appendChild(obj);

    // URL
    let li = this._browser.contentDocument.createElement('li');
    obj.appendChild(li);

    let info;
    info = this._browser.contentDocument.createElement('strong');
    info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.cookieJars.url")));
    li.appendChild(info);

    let urlInput = this._browser.contentDocument.createElement('input');
    urlInput.setAttribute('type', 'text');
    urlInput.setAttribute('value', typeof(aJar.url) == "string" ? aJar.url : '');
    li.appendChild(urlInput);

    // Color
    info = this._browser.contentDocument.createElement('strong');
    info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.cookieJars.color")));
    li.appendChild(info);

    let colorInput = this._browser.contentDocument.createElement('input');
    colorInput.setAttribute('type', 'text');
    colorInput.setAttribute('value', typeof(aJar.color) == "string" ? aJar.color : '');
    li.appendChild(colorInput);

    urlInput.addEventListener('change', function() {
      priv8.updateCookieJar(aJar.id, urlInput.value, colorInput.value);
    }, false);

    colorInput.addEventListener('change', function() {
      priv8.updateCookieJar(aJar.id, urlInput.value, colorInput.value);
    }, false);
  },

  createCookieJar: function() {
    this.needPrompt();

    let strbundle = this._document.getElementById("priv8strings");

    let name = {value: ''};

    if (this._prompt.prompt(this._window,
                            strbundle.getString('Manager.cookieJars.createCookieJarTitle'),
                            strbundle.getString('Manager.cookieJars.createCookieJar'),
                            name, null, {value: 0})) {
      priv8.createCookieJar(name.value);
      this.show();
    }
  },

  openCookieJar: function(aJar) {
    priv8.openCookieJar(this._window, aJar.id);
  },

  renameCookieJar: function(aJar) {
    this.needPrompt();

    let strbundle = this._document.getElementById("priv8strings");

    let newName = {value: aJar.name};

    if (this._prompt.prompt(this._window,
                            strbundle.getString('Manager.cookieJars.renameCookieJarTitle'),
                            strbundle.getFormattedString('Manager.cookieJars.renameCookieJar', [aJar.name]),
                            newName, null, {value:0})) {
      newName = newName.value;

      if (newName == aJar.name) {
        return false;
      }

      priv8.renameCookieJar(aJar.id, newName);
      this.show();
    }
  },

  deleteCookieJar: function(aJar) {
    let deleteFiles = false;

    let strbundle = this._document.getElementById("priv8strings");


    this.needPrompt();

    if (!this._prompt.confirm(this._window,
                              strbundle.getString('Manager.cookieJars.deleteCookieJarTitle'),
                              strbundle.getString('Manager.cookieJars.deleteCookieJarConfirm'))) {
      return;
    }

    priv8.deleteCookieJar(aJar.id);
    this.show();
  },

  needPrompt: function() {
    if (!this._prompt) {
      this._prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                               .getService(Components.interfaces.nsIPromptService);
    }
  },

  onStatusChange: function() {},

  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                       Components.interfaces.nsISupportsWeakReference])
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
    this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                            Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
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
                                   Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
  },

  // For progress listener
  onLocationChange: function(aWebProgress, aRequest, aLocation) {},

  onProgressChange: function() {},

  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
    // Don't care about state but window
    if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW))) {
      return;
    }

    // Only when the operation is concluded
    if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_STOP))) {
      return;
    }

    // Translate
    priv8Translate(this._document.getElementById("priv8strings"), this._browser);
  },

  onStatusChange: function() {},

  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                         Components.interfaces.nsISupportsWeakReference])
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
      { funcName: 'pageAbout',  id: 'category-about',  page_id: 'about-view',  obj: new Priv8ManagerAbout(aWindow, aDocument)  }
    ];

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
  },

  __noSuchMethod__ : function(aId, aArgs) {
    for (let i = 0; i < this.pages.length; ++i) {
      if (aId == this.pages[i].funcName) {
        this.node.selectItem(this.document.getElementById(this.pages[i].id));
        break;
      }
    }
  }
};
