/**
 * WebOS Static App SDK
 *
 * Include this script in your static app to communicate with the host system.
 * All APIs are available via the global `FM` object.
 *
 * Usage:
 *   <script src="/webos-sdk.js"></script>
 *   FM.fs.list('local', '/').then(files => console.log(files))
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

  function sendRequest(method, params) {
    return new Promise(function (resolve, reject) {
      var reqId = genReqId();
      var timer = setTimeout(function () {
        delete pending[reqId];
        reject(new Error('FM SDK request timeout: ' + method));
      }, TIMEOUT);

      pending[reqId] = {
        resolve: function (data) {
          clearTimeout(timer);
          delete pending[reqId];
          resolve(data);
        },
        reject: function (err) {
          clearTimeout(timer);
          delete pending[reqId];
          reject(err);
        }
      };

      window.parent.postMessage({
        source: SOURCE,
        type: 'request',
        reqId: reqId,
        method: method,
        params: params || {}
      }, '*');
    });
  }

  // Listen for responses from host
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
      // Also fire wildcard handlers
      var wildcard = eventHandlers['*'];
      if (wildcard) {
        for (var j = 0; j < wildcard.length; j++) {
          try { wildcard[j](msg.event, msg.data); } catch (e) { console.error('FM event handler error:', e); }
        }
      }
    }
  });

  var FM = {
    // File system operations
    fs: {
      list: function (nodeId, path) {
        return sendRequest('fs_list', { nodeId: nodeId, path: path || '/' });
      },
      read: function (nodeId, path) {
        return sendRequest('fs_read', { nodeId: nodeId, path: path });
      },
      write: function (nodeId, path, content) {
        return sendRequest('fs_write', { nodeId: nodeId, path: path, content: content });
      },
      mkdir: function (nodeId, path, name) {
        return sendRequest('fs_mkdir', { nodeId: nodeId, path: path, name: name });
      },
      create: function (nodeId, path, name) {
        return sendRequest('fs_create', { nodeId: nodeId, path: path, name: name });
      },
      delete: function (nodeId, paths) {
        if (typeof paths === 'string') paths = [paths];
        return sendRequest('fs_delete', { nodeId: nodeId, paths: paths });
      },
      rename: function (nodeId, path, oldName, newName) {
        return sendRequest('fs_rename', { nodeId: nodeId, path: path, oldName: oldName, newName: newName });
      },
      copy: function (nodeId, paths, to, dstNodeId) {
        if (typeof paths === 'string') paths = [paths];
        return sendRequest('fs_copy', { nodeId: nodeId, paths: paths, to: to, dstNodeId: dstNodeId });
      },
      move: function (nodeId, paths, to, dstNodeId) {
        if (typeof paths === 'string') paths = [paths];
        return sendRequest('fs_move', { nodeId: nodeId, paths: paths, to: to, dstNodeId: dstNodeId });
      },
      search: function (nodeId, path, keyword) {
        return sendRequest('fs_search', { nodeId: nodeId, path: path, keyword: keyword });
      }
    },

    // Terminal operations
    terminal: {
      open: function () {
        return sendRequest('terminal_open', {});
      },
      input: function (sid, data) {
        return sendRequest('terminal_input', { sid: sid, data: data });
      },
      resize: function (sid, cols, rows) {
        return sendRequest('terminal_resize', { sid: sid, cols: cols, rows: rows });
      },
      close: function (sid) {
        return sendRequest('terminal_close', { sid: sid });
      }
    },

    // Docker operations
    docker: {
      containers: function () {
        return sendRequest('docker_containers', {});
      },
      images: function () {
        return sendRequest('docker_images', {});
      },
      composeProjects: function () {
        return sendRequest('docker_compose', {});
      },
      composeLogs: function (projectDir, tail) {
        return sendRequest('docker_compose_logs', { projectDir: projectDir, tail: tail || '100' });
      },
      containerLogs: function (containerId, tail) {
        return sendRequest('docker_container_logs', { data: containerId, tail: tail || '200' });
      }
    },

    // Execute command
    exec: function (command) {
      return sendRequest('exec', { command: command });
    },

    // Window operations
    window: {
      setTitle: function (title) {
        return sendRequest('window_setTitle', { title: title });
      },
      close: function () {
        return sendRequest('window_close', {});
      },
      getInfo: function () {
        return sendRequest('window_getInfo', {});
      }
    },

    // Wasm process management
    wasm: {
      start: function (appId) {
        return sendRequest('wasm_start', { appId: appId });
      },
      stop: function (appId) {
        return sendRequest('wasm_stop', { appId: appId });
      },
      restart: function (appId) {
        return sendRequest('wasm_restart', { appId: appId });
      },
      list: function () {
        return sendRequest('wasm_list', {});
      }
    },

    // Event system
    on: function (event, handler) {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
      return function () {
        var arr = eventHandlers[event];
        if (arr) {
          var idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    },

    off: function (event, handler) {
      var arr = eventHandlers[event];
      if (arr) {
        if (handler) {
          var idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        } else {
          delete eventHandlers[event];
        }
      }
    },

    // Version info
    version: '1.0.0'
  };

  // Expose globally
  window.FM = FM;

  // Notify host that SDK is ready
  window.parent.postMessage({
    source: SOURCE,
    type: 'sdk_ready'
  }, '*');
})();
