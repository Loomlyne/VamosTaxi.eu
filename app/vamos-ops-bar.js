/* Vamos Taxi — dashboard phone bar (260930-dash-design, owner decision 2026-10-01).

   On a phone the console's top bar is one compact row: menu, the page title (or the wordmark),
   and one Actions button. A screen that has its own buttons hands them to the bar here; at phone
   width the screen hides those buttons (it wraps them in [data-ops-fold]) and the bar lists them.
   Tablet and desktop keep the screen's own buttons.

     VamosOpsBar.set(owner, { title, label, items, onPick })  owner: a string per screen
     VamosOpsBar.clear(owner)                                  on unmount
     VamosOpsBar.get()          -> { title, label, items, onPick } or null
     VamosOpsBar.onChange(fn)   -> unsubscribe

   items: [{ value, label, icon?, tone?: 'danger', disabled? }]. The handler is looked up when an
   item is picked, so a new handler never needs a new broadcast; only a change a person can see
   (title, labels, order, tone, disabled) re-renders the bar. Listeners run after the current
   render, never inside it. */
(function () {
  // The shell's helmet can run this file twice (parser, then the dc-runtime). A second store would
  // drop the listeners the first one holds, so the bar would never hear a screen again.
  if (window.VamosOpsBar) return;
  var current = null;
  var sig = "";
  var listeners = [];
  var queued = false;

  function signature(entry) {
    if (!entry) return "";
    var items = Array.isArray(entry.items) ? entry.items : [];
    return JSON.stringify([
      entry.owner || "",
      entry.title || "",
      entry.label || "",
      items.map(function (i) {
        return [i && i.value, i && i.label, i && i.icon, i && i.tone, !!(i && i.disabled)];
      }),
    ]);
  }

  function notify() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(function () {
      queued = false;
      listeners.slice().forEach(function (fn) {
        try { fn(current); } catch (e) {}
      });
    });
  }

  function set(owner, entry) {
    var next = {
      owner: String(owner || ""),
      title: entry && entry.title ? String(entry.title) : "",
      label: entry && entry.label ? String(entry.label) : "",
      items: entry && Array.isArray(entry.items) ? entry.items.filter(Boolean) : [],
      onPick: entry && typeof entry.onPick === "function" ? entry.onPick : null,
    };
    var nextSig = signature(next);
    current = next;
    if (nextSig !== sig) {
      sig = nextSig;
      notify();
    }
  }

  function clear(owner) {
    if (!current || current.owner !== String(owner || "")) return;
    current = null;
    sig = "";
    notify();
  }

  function get() {
    return current;
  }

  function pick(value) {
    if (!current || !current.onPick) return;
    var items = current.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].value === value) {
        if (items[i].disabled) return;
        current.onPick(value);
        return;
      }
    }
  }

  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  window.VamosOpsBar = { set: set, clear: clear, get: get, pick: pick, onChange: onChange };
})();
