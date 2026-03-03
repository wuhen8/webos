import { c as h, l as s } from "./main-39xG571D.js";
import { C as c, H as u, D as p, a as m, R as f, b as _, c as w, d as k, F as v, e as D, S as P, f as R, g as I } from "./lspLanguageFeatures-CHW-g27O.js";
import { h as b, i as H, j as U, t as y, k as T } from "./lspLanguageFeatures-CHW-g27O.js";
const C = 2 * 60 * 1e3;
class A {
  constructor(o) {
    this._defaults = o, this._worker = null, this._client = null, this._idleCheckInterval = window.setInterval(() => this._checkIfIdle(), 30 * 1e3), this._lastUsedTime = 0, this._configChangeListener = this._defaults.onDidChange(() => this._stopWorker());
  }
  _stopWorker() {
    this._worker && (this._worker.dispose(), this._worker = null), this._client = null;
  }
  dispose() {
    clearInterval(this._idleCheckInterval), this._configChangeListener.dispose(), this._stopWorker();
  }
  _checkIfIdle() {
    if (!this._worker)
      return;
    Date.now() - this._lastUsedTime > C && this._stopWorker();
  }
  _getClient() {
    return this._lastUsedTime = Date.now(), this._client || (this._worker = h({
      // module that exports the create() method and returns a `CSSWorker` instance
      moduleId: "vs/language/css/cssWorker",
      createWorker: () => new Worker(new URL(
        /* @vite-ignore */
        "" + new URL("css.worker-BA8COv31.js", import.meta.url).href,
        import.meta.url
      ), { type: "module" }),
      label: this._defaults.languageId,
      // passed in to the create() method
      createData: {
        options: this._defaults.options,
        languageId: this._defaults.languageId
      }
    }), this._client = this._worker.getProxy()), this._client;
  }
  getLanguageServiceWorker(...o) {
    let e;
    return this._getClient().then((a) => {
      e = a;
    }).then((a) => {
      if (this._worker)
        return this._worker.withSyncedResources(o);
    }).then((a) => e);
  }
}
function F(n) {
  const o = [], e = [], a = new A(n);
  o.push(a);
  const r = (...t) => a.getLanguageServiceWorker(...t);
  function l() {
    const { languageId: t, modeConfiguration: i } = n;
    g(e), i.completionItems && e.push(
      s.registerCompletionItemProvider(
        t,
        new c(r, ["/", "-", ":"])
      )
    ), i.hovers && e.push(
      s.registerHoverProvider(t, new u(r))
    ), i.documentHighlights && e.push(
      s.registerDocumentHighlightProvider(
        t,
        new p(r)
      )
    ), i.definitions && e.push(
      s.registerDefinitionProvider(
        t,
        new m(r)
      )
    ), i.references && e.push(
      s.registerReferenceProvider(
        t,
        new f(r)
      )
    ), i.documentSymbols && e.push(
      s.registerDocumentSymbolProvider(
        t,
        new _(r)
      )
    ), i.rename && e.push(
      s.registerRenameProvider(t, new w(r))
    ), i.colors && e.push(
      s.registerColorProvider(
        t,
        new k(r)
      )
    ), i.foldingRanges && e.push(
      s.registerFoldingRangeProvider(
        t,
        new v(r)
      )
    ), i.diagnostics && e.push(
      new D(t, r, n.onDidChange)
    ), i.selectionRanges && e.push(
      s.registerSelectionRangeProvider(
        t,
        new P(r)
      )
    ), i.documentFormattingEdits && e.push(
      s.registerDocumentFormattingEditProvider(
        t,
        new R(r)
      )
    ), i.documentRangeFormattingEdits && e.push(
      s.registerDocumentRangeFormattingEditProvider(
        t,
        new I(r)
      )
    );
  }
  return l(), o.push(d(e)), d(o);
}
function d(n) {
  return { dispose: () => g(n) };
}
function g(n) {
  for (; n.length; )
    n.pop().dispose();
}
export {
  c as CompletionAdapter,
  m as DefinitionAdapter,
  D as DiagnosticsAdapter,
  k as DocumentColorAdapter,
  R as DocumentFormattingEditProvider,
  p as DocumentHighlightAdapter,
  b as DocumentLinkAdapter,
  I as DocumentRangeFormattingEditProvider,
  _ as DocumentSymbolAdapter,
  v as FoldingRangeAdapter,
  u as HoverAdapter,
  f as ReferenceAdapter,
  w as RenameAdapter,
  P as SelectionRangeAdapter,
  A as WorkerManager,
  H as fromPosition,
  U as fromRange,
  F as setupMode,
  y as toRange,
  T as toTextEdit
};
