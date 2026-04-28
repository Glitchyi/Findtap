(function () {
  'use strict';

  const tracked = new WeakSet();
  const trackedElements = [];
  const TRACKED_EVENTS = new Set(['click', 'mousedown', 'mouseup']);

  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    if (TRACKED_EVENTS.has(type) && this instanceof Element && !tracked.has(this)) {
      tracked.add(this);
      trackedElements.push(this);
    }
    return origAdd.call(this, type, listener, options);
  };

  document.addEventListener('findtap:requestListeners', function () {
    const live = trackedElements.filter(function (el) { return document.contains(el); });
    document.dispatchEvent(new CustomEvent('findtap:listenerMap', {
      detail: { elements: live },
    }));
  });
})();
