/**
 * WebOS Static App SDK v2
 *
 * FM.request('domain.action', params) — call any backend method
 * FM.on(event, handler) / FM.off(event, handler) — listen for push events
 *
 * Examples:
 *   FM.request('fs.list', { nodeId: 'local', path: '/' })
 *   FM.request('docker.containers')
 *   FM.request('system.exec', { command: 'ls' })
 *   FM.on('system.notify', data => console.log(data))
 */
(function () {
  'use strict';

  var SOURCE = 'webos-static-app';
  var RESPONSE_SOURCE = 'webos-host';
  var TIMEOUT = 30000;
  var reqSeq = 0;
  var pending = {};
  var eventHandlers = {};

  function genReqId() {
    return 'sdk_' + (++reqSeq) + '_' + Date.now();
  }

  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var reqId = genReqId();
      var timer = setTimeout(function () {
        delete pending[reqId];
        reject(new Error('FM SDK request timeout: ' + method));
      }, TIMEOUT);
      pending[reqId] = {
        resolve: function (data) { clearTimeout(timer); delete pending[reqId]; resolve(data); },
        reject: function (err) { clearTimeout(timer); delete pending[reqId]; reject(err); }
      };
      window.parent.postMessage({
        source: SOURCE, type: 'request', reqId: reqId,
        method: method, params: params || {}
      }, '*');
    });
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== RESPONSE_SOURCE) return;

    if (msg.type === 'response' && msg.reqId && pending[msg.reqId]) {
      if (msg.error) {
        pending[msg.reqId].reject(new Error(msg.error));
      } else {
        pending[msg.reqId].resolve(msg.data);
      }
    }

    if (msg.type === 'event' && msg.event) {
      var handlers = eventHandlers[msg.event];
      if (handlers) {
        for (var i = 0; i < handlers.length; i++) {
          try { handlers[i](msg.data); } catch (e) { console.error('FM event handler error:', e); }
        }
      }
      var wildcard = eventHandlers['*'];
      if (wildcard) {
        for (var j = 0; j < wildcard.length; j++) {
          try { wildcard[j](msg.event, msg.data); } catch (e) { console.error('FM event handler error:', e); }
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
    version: '2.0.0'
  };

  window.parent.postMessage({ source: SOURCE, type: 'sdk_ready' }, '*');
})();
