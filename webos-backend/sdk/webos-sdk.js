/**
 * WebOS Static App SDK v3 — JSON-RPC 2.0
 *
 * FM.request('domain.action', params) — call any backend method
 * FM.on(event, handler) / FM.off(event, handler) — listen for push events
 *
 * Wire format:
 *   Request:      { jsonrpc: "2.0", method: "fs.list", params: { nodeId, path }, id: "sdk_1" }
 *   Response:     { jsonrpc: "2.0", result: [...], id: "sdk_1" }
 *   Error:        { jsonrpc: "2.0", error: { code: -32000, message: "..." }, id: "sdk_1" }
 *   Notification: { jsonrpc: "2.0", method: "fs.watch", params: { ... } }
 */
(function () {
  'use strict';

  var SOURCE = 'webos-static-app';
  var RESPONSE_SOURCE = 'webos-host';
  var TIMEOUT = 30000;
  var reqSeq = 0;
  var pending = {};
  var eventHandlers = {};

  function genId() {
    return 'sdk_' + (++reqSeq) + '_' + Date.now();
  }

  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = genId();
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error('FM SDK request timeout: ' + method));
      }, TIMEOUT);
      pending[id] = {
        resolve: function (data) { clearTimeout(timer); delete pending[id]; resolve(data); },
        reject: function (err) { clearTimeout(timer); delete pending[id]; reject(err); }
      };
      window.parent.postMessage({
        source: SOURCE,
        jsonrpc: '2.0',
        method: method,
        params: params || {},
        id: id
      }, '*');
    });
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== RESPONSE_SOURCE || msg.jsonrpc !== '2.0') return;

    // Response (has id)
    if (msg.id && pending[msg.id]) {
      if (msg.error) {
        pending[msg.id].reject(new Error(msg.error.message || 'Request failed'));
      } else {
        pending[msg.id].resolve(msg.result);
      }
      return;
    }

    // Notification (has method, no id)
    if (msg.method && !msg.id) {
      var handlers = eventHandlers[msg.method];
      if (handlers) {
        for (var i = 0; i < handlers.length; i++) {
          try { handlers[i](msg.params); } catch (e) { console.error('FM event handler error:', e); }
        }
      }
      var wildcard = eventHandlers['*'];
      if (wildcard) {
        for (var j = 0; j < wildcard.length; j++) {
          try { wildcard[j](msg.method, msg.params); } catch (e) { console.error('FM event handler error:', e); }
        }
      }
    }
  });

  window.FM = {
    request: request,
    on: function (event, handler) {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
      return function () {
        var arr = eventHandlers[event];
        if (arr) { var idx = arr.indexOf(handler); if (idx >= 0) arr.splice(idx, 1); }
      };
    },
    off: function (event, handler) {
      var arr = eventHandlers[event];
      if (arr) {
        if (handler) { var idx = arr.indexOf(handler); if (idx >= 0) arr.splice(idx, 1); }
        else delete eventHandlers[event];
      }
    },
    version: '3.0.0'
  };

  window.parent.postMessage({ source: SOURCE, type: 'sdk_ready' }, '*');
})();
