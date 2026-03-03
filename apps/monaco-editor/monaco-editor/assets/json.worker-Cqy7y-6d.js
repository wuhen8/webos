var Go = Object.defineProperty;
var Jo = (e, t, n) => t in e ? Go(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var ze = (e, t, n) => Jo(e, typeof t != "symbol" ? t + "" : t, n);
class Xo {
  constructor() {
    this.listeners = [], this.unexpectedErrorHandler = function(t) {
      setTimeout(() => {
        throw t.stack ? Ct.isErrorNoTelemetry(t) ? new Ct(t.message + `

` + t.stack) : new Error(t.message + `

` + t.stack) : t;
      }, 0);
    };
  }
  emit(t) {
    this.listeners.forEach((n) => {
      n(t);
    });
  }
  onUnexpectedError(t) {
    this.unexpectedErrorHandler(t), this.emit(t);
  }
  // For external errors, we don't want the listeners to be called
  onUnexpectedExternalError(t) {
    this.unexpectedErrorHandler(t);
  }
}
const Qo = new Xo();
function bn(e) {
  Zo(e) || Qo.onUnexpectedError(e);
}
function nr(e) {
  if (e instanceof Error) {
    const { name: t, message: n, cause: r } = e, i = e.stacktrace || e.stack;
    return {
      $isError: !0,
      name: t,
      message: n,
      stack: i,
      noTelemetry: Ct.isErrorNoTelemetry(e),
      cause: r ? nr(r) : void 0,
      code: e.code
    };
  }
  return e;
}
const rr = "Canceled";
function Zo(e) {
  return e instanceof co ? !0 : e instanceof Error && e.name === rr && e.message === rr;
}
class co extends Error {
  constructor() {
    super(rr), this.name = this.message;
  }
}
class Ct extends Error {
  constructor(t) {
    super(t), this.name = "CodeExpectedError";
  }
  static fromError(t) {
    if (t instanceof Ct)
      return t;
    const n = new Ct();
    return n.message = t.message, n.stack = t.stack, n;
  }
  static isErrorNoTelemetry(t) {
    return t.name === "CodeExpectedError";
  }
}
class ue extends Error {
  constructor(t) {
    super(t || "An unexpected bug occurred."), Object.setPrototypeOf(this, ue.prototype);
  }
}
function Yo(e, t = "Unreachable") {
  throw new Error(t);
}
function Ko(e, t = "unexpected state") {
  if (!e)
    throw typeof t == "string" ? new ue(`Assertion Failed: ${t}`) : t;
}
function Ln(e) {
  if (!e()) {
    debugger;
    e(), bn(new ue("Assertion Failed"));
  }
}
function fo(e, t) {
  let n = 0;
  for (; n < e.length - 1; ) {
    const r = e[n], i = e[n + 1];
    if (!t(r, i))
      return !1;
    n++;
  }
  return !0;
}
function el(e) {
  return typeof e == "string";
}
function tl(e) {
  return !!e && typeof e[Symbol.iterator] == "function";
}
var Nn;
(function(e) {
  function t(v) {
    return !!v && typeof v == "object" && typeof v[Symbol.iterator] == "function";
  }
  e.is = t;
  const n = Object.freeze([]);
  function r() {
    return n;
  }
  e.empty = r;
  function* i(v) {
    yield v;
  }
  e.single = i;
  function s(v) {
    return t(v) ? v : i(v);
  }
  e.wrap = s;
  function a(v) {
    return v || n;
  }
  e.from = a;
  function* o(v) {
    for (let k = v.length - 1; k >= 0; k--)
      yield v[k];
  }
  e.reverse = o;
  function u(v) {
    return !v || v[Symbol.iterator]().next().done === !0;
  }
  e.isEmpty = u;
  function l(v) {
    return v[Symbol.iterator]().next().value;
  }
  e.first = l;
  function h(v, k) {
    let M = 0;
    for (const V of v)
      if (k(V, M++))
        return !0;
    return !1;
  }
  e.some = h;
  function f(v, k) {
    let M = 0;
    for (const V of v)
      if (!k(V, M++))
        return !1;
    return !0;
  }
  e.every = f;
  function d(v, k) {
    for (const M of v)
      if (k(M))
        return M;
  }
  e.find = d;
  function* m(v, k) {
    for (const M of v)
      k(M) && (yield M);
  }
  e.filter = m;
  function* g(v, k) {
    let M = 0;
    for (const V of v)
      yield k(V, M++);
  }
  e.map = g;
  function* p(v, k) {
    let M = 0;
    for (const V of v)
      yield* k(V, M++);
  }
  e.flatMap = p;
  function* w(...v) {
    for (const k of v)
      tl(k) ? yield* k : yield k;
  }
  e.concat = w;
  function y(v, k, M) {
    let V = M;
    for (const T of v)
      V = k(V, T);
    return V;
  }
  e.reduce = y;
  function N(v) {
    let k = 0;
    for (const M of v)
      k++;
    return k;
  }
  e.length = N;
  function* b(v, k, M = v.length) {
    for (k < -v.length && (k = 0), k < 0 && (k += v.length), M < 0 ? M += v.length : M > v.length && (M = v.length); k < M; k++)
      yield v[k];
  }
  e.slice = b;
  function _(v, k = Number.POSITIVE_INFINITY) {
    const M = [];
    if (k === 0)
      return [M, v];
    const V = v[Symbol.iterator]();
    for (let T = 0; T < k; T++) {
      const x = V.next();
      if (x.done)
        return [M, e.empty()];
      M.push(x.value);
    }
    return [M, { [Symbol.iterator]() {
      return V;
    } }];
  }
  e.consume = _;
  async function L(v) {
    const k = [];
    for await (const M of v)
      k.push(M);
    return k;
  }
  e.asyncToArray = L;
  async function S(v) {
    let k = [];
    for await (const M of v)
      k = k.concat(M);
    return k;
  }
  e.asyncToArrayFlat = S;
})(Nn || (Nn = {}));
function ho(e) {
  if (Nn.is(e)) {
    const t = [];
    for (const n of e)
      if (n)
        try {
          n.dispose();
        } catch (r) {
          t.push(r);
        }
    if (t.length === 1)
      throw t[0];
    if (t.length > 1)
      throw new AggregateError(t, "Encountered errors while disposing of store");
    return Array.isArray(e) ? [] : e;
  } else if (e)
    return e.dispose(), e;
}
function nl(...e) {
  return _n(() => ho(e));
}
class rl {
  constructor(t) {
    this._isDisposed = !1, this._fn = t;
  }
  dispose() {
    if (!this._isDisposed) {
      if (!this._fn)
        throw new Error("Unbound disposable context: Need to use an arrow function to preserve the value of this");
      this._isDisposed = !0, this._fn();
    }
  }
}
function _n(e) {
  return new rl(e);
}
const $n = class $n {
  constructor() {
    this._toDispose = /* @__PURE__ */ new Set(), this._isDisposed = !1;
  }
  /**
   * Dispose of all registered disposables and mark this object as disposed.
   *
   * Any future disposables added to this object will be disposed of on `add`.
   */
  dispose() {
    this._isDisposed || (this._isDisposed = !0, this.clear());
  }
  /**
   * @return `true` if this object has been disposed of.
   */
  get isDisposed() {
    return this._isDisposed;
  }
  /**
   * Dispose of all registered disposables but do not mark this object as disposed.
   */
  clear() {
    if (this._toDispose.size !== 0)
      try {
        ho(this._toDispose);
      } finally {
        this._toDispose.clear();
      }
  }
  /**
   * Add a new {@link IDisposable disposable} to the collection.
   */
  add(t) {
    if (!t || t === ct.None)
      return t;
    if (t === this)
      throw new Error("Cannot register a disposable on itself!");
    return this._isDisposed ? $n.DISABLE_DISPOSED_WARNING || console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack) : this._toDispose.add(t), t;
  }
  /**
   * Deletes a disposable from store and disposes of it. This will not throw or warn and proceed to dispose the
   * disposable even when the disposable is not part in the store.
   */
  delete(t) {
    if (t) {
      if (t === this)
        throw new Error("Cannot dispose a disposable on itself!");
      this._toDispose.delete(t), t.dispose();
    }
  }
};
$n.DISABLE_DISPOSED_WARNING = !1;
let Kt = $n;
const ii = class ii {
  constructor() {
    this._store = new Kt(), this._store;
  }
  dispose() {
    this._store.dispose();
  }
  /**
   * Adds `o` to the collection of disposables managed by this object.
   */
  _register(t) {
    if (t === this)
      throw new Error("Cannot register a disposable on itself!");
    return this._store.add(t);
  }
};
ii.None = Object.freeze({ dispose() {
} });
let ct = ii;
const _t = class _t {
  constructor(t) {
    this.element = t, this.next = _t.Undefined, this.prev = _t.Undefined;
  }
};
_t.Undefined = new _t(void 0);
let Y = _t;
class il {
  constructor() {
    this._first = Y.Undefined, this._last = Y.Undefined, this._size = 0;
  }
  get size() {
    return this._size;
  }
  isEmpty() {
    return this._first === Y.Undefined;
  }
  clear() {
    let t = this._first;
    for (; t !== Y.Undefined; ) {
      const n = t.next;
      t.prev = Y.Undefined, t.next = Y.Undefined, t = n;
    }
    this._first = Y.Undefined, this._last = Y.Undefined, this._size = 0;
  }
  unshift(t) {
    return this._insert(t, !1);
  }
  push(t) {
    return this._insert(t, !0);
  }
  _insert(t, n) {
    const r = new Y(t);
    if (this._first === Y.Undefined)
      this._first = r, this._last = r;
    else if (n) {
      const s = this._last;
      this._last = r, r.prev = s, s.next = r;
    } else {
      const s = this._first;
      this._first = r, r.next = s, s.prev = r;
    }
    this._size += 1;
    let i = !1;
    return () => {
      i || (i = !0, this._remove(r));
    };
  }
  shift() {
    if (this._first !== Y.Undefined) {
      const t = this._first.element;
      return this._remove(this._first), t;
    }
  }
  pop() {
    if (this._last !== Y.Undefined) {
      const t = this._last.element;
      return this._remove(this._last), t;
    }
  }
  _remove(t) {
    if (t.prev !== Y.Undefined && t.next !== Y.Undefined) {
      const n = t.prev;
      n.next = t.next, t.next.prev = n;
    } else t.prev === Y.Undefined && t.next === Y.Undefined ? (this._first = Y.Undefined, this._last = Y.Undefined) : t.next === Y.Undefined ? (this._last = this._last.prev, this._last.next = Y.Undefined) : t.prev === Y.Undefined && (this._first = this._first.next, this._first.prev = Y.Undefined);
    this._size -= 1;
  }
  *[Symbol.iterator]() {
    let t = this._first;
    for (; t !== Y.Undefined; )
      yield t.element, t = t.next;
  }
}
const sl = globalThis.performance.now.bind(globalThis.performance);
class Wn {
  static create(t) {
    return new Wn(t);
  }
  constructor(t) {
    this._now = t === !1 ? Date.now : sl, this._startTime = this._now(), this._stopTime = -1;
  }
  stop() {
    this._stopTime = this._now();
  }
  reset() {
    this._startTime = this._now(), this._stopTime = -1;
  }
  elapsed() {
    return this._stopTime !== -1 ? this._stopTime - this._startTime : this._now() - this._startTime;
  }
}
var ir;
(function(e) {
  e.None = () => ct.None;
  function t(x, A) {
    return d(x, () => {
    }, 0, void 0, !0, void 0, A);
  }
  e.defer = t;
  function n(x) {
    return (A, C = null, I) => {
      let F = !1, D;
      return D = x((B) => {
        if (!F)
          return D ? D.dispose() : F = !0, A.call(C, B);
      }, null, I), F && D.dispose(), D;
    };
  }
  e.once = n;
  function r(x, A) {
    return e.once(e.filter(x, A));
  }
  e.onceIf = r;
  function i(x, A, C) {
    return h((I, F = null, D) => x((B) => I.call(F, A(B)), null, D), C);
  }
  e.map = i;
  function s(x, A, C) {
    return h((I, F = null, D) => x((B) => {
      A(B), I.call(F, B);
    }, null, D), C);
  }
  e.forEach = s;
  function a(x, A, C) {
    return h((I, F = null, D) => x((B) => A(B) && I.call(F, B), null, D), C);
  }
  e.filter = a;
  function o(x) {
    return x;
  }
  e.signal = o;
  function u(...x) {
    return (A, C = null, I) => {
      const F = nl(...x.map((D) => D((B) => A.call(C, B))));
      return f(F, I);
    };
  }
  e.any = u;
  function l(x, A, C, I) {
    let F = C;
    return i(x, (D) => (F = A(F, D), F), I);
  }
  e.reduce = l;
  function h(x, A) {
    let C;
    const I = {
      onWillAddFirstListener() {
        C = x(F.fire, F);
      },
      onDidRemoveLastListener() {
        C == null || C.dispose();
      }
    }, F = new Fe(I);
    return A == null || A.add(F), F.event;
  }
  function f(x, A) {
    return A instanceof Array ? A.push(x) : A && A.add(x), x;
  }
  function d(x, A, C = 100, I = !1, F = !1, D, B) {
    let X, H, Le, un = 0, tt;
    const Wo = {
      leakWarningThreshold: D,
      onWillAddFirstListener() {
        X = x((Ho) => {
          un++, H = A(H, Ho), I && !Le && (cn.fire(H), H = void 0), tt = () => {
            const zo = H;
            H = void 0, Le = void 0, (!I || un > 1) && cn.fire(zo), un = 0;
          }, typeof C == "number" ? (Le && clearTimeout(Le), Le = setTimeout(tt, C)) : Le === void 0 && (Le = null, queueMicrotask(tt));
        });
      },
      onWillRemoveListener() {
        F && un > 0 && (tt == null || tt());
      },
      onDidRemoveLastListener() {
        tt = void 0, X.dispose();
      }
    }, cn = new Fe(Wo);
    return B == null || B.add(cn), cn.event;
  }
  e.debounce = d;
  function m(x, A = 0, C) {
    return e.debounce(x, (I, F) => I ? (I.push(F), I) : [F], A, void 0, !0, void 0, C);
  }
  e.accumulate = m;
  function g(x, A = (I, F) => I === F, C) {
    let I = !0, F;
    return a(x, (D) => {
      const B = I || !A(D, F);
      return I = !1, F = D, B;
    }, C);
  }
  e.latch = g;
  function p(x, A, C) {
    return [
      e.filter(x, A, C),
      e.filter(x, (I) => !A(I), C)
    ];
  }
  e.split = p;
  function w(x, A = !1, C = [], I) {
    let F = C.slice(), D = x((H) => {
      F ? F.push(H) : X.fire(H);
    });
    I && I.add(D);
    const B = () => {
      F == null || F.forEach((H) => X.fire(H)), F = null;
    }, X = new Fe({
      onWillAddFirstListener() {
        D || (D = x((H) => X.fire(H)), I && I.add(D));
      },
      onDidAddFirstListener() {
        F && (A ? setTimeout(B) : B());
      },
      onDidRemoveLastListener() {
        D && D.dispose(), D = null;
      }
    });
    return I && I.add(X), X.event;
  }
  e.buffer = w;
  function y(x, A) {
    return (I, F, D) => {
      const B = A(new b());
      return x(function(X) {
        const H = B.evaluate(X);
        H !== N && I.call(F, H);
      }, void 0, D);
    };
  }
  e.chain = y;
  const N = Symbol("HaltChainable");
  class b {
    constructor() {
      this.steps = [];
    }
    map(A) {
      return this.steps.push(A), this;
    }
    forEach(A) {
      return this.steps.push((C) => (A(C), C)), this;
    }
    filter(A) {
      return this.steps.push((C) => A(C) ? C : N), this;
    }
    reduce(A, C) {
      let I = C;
      return this.steps.push((F) => (I = A(I, F), I)), this;
    }
    latch(A = (C, I) => C === I) {
      let C = !0, I;
      return this.steps.push((F) => {
        const D = C || !A(F, I);
        return C = !1, I = F, D ? F : N;
      }), this;
    }
    evaluate(A) {
      for (const C of this.steps)
        if (A = C(A), A === N)
          break;
      return A;
    }
  }
  function _(x, A, C = (I) => I) {
    const I = (...X) => B.fire(C(...X)), F = () => x.on(A, I), D = () => x.removeListener(A, I), B = new Fe({ onWillAddFirstListener: F, onDidRemoveLastListener: D });
    return B.event;
  }
  e.fromNodeEventEmitter = _;
  function L(x, A, C = (I) => I) {
    const I = (...X) => B.fire(C(...X)), F = () => x.addEventListener(A, I), D = () => x.removeEventListener(A, I), B = new Fe({ onWillAddFirstListener: F, onDidRemoveLastListener: D });
    return B.event;
  }
  e.fromDOMEventEmitter = L;
  function S(x, A) {
    let C;
    const I = new Promise((F, D) => {
      const B = n(x)(F, null, A);
      C = () => B.dispose();
    });
    return I.cancel = C, I;
  }
  e.toPromise = S;
  function v(x, A) {
    return x((C) => A.fire(C));
  }
  e.forward = v;
  function k(x, A, C) {
    return A(C), x((I) => A(I));
  }
  e.runAndSubscribe = k;
  class M {
    constructor(A, C) {
      this._observable = A, this._counter = 0, this._hasChanged = !1;
      const I = {
        onWillAddFirstListener: () => {
          A.addObserver(this), this._observable.reportChanges();
        },
        onDidRemoveLastListener: () => {
          A.removeObserver(this);
        }
      };
      this.emitter = new Fe(I), C && C.add(this.emitter);
    }
    beginUpdate(A) {
      this._counter++;
    }
    handlePossibleChange(A) {
    }
    handleChange(A, C) {
      this._hasChanged = !0;
    }
    endUpdate(A) {
      this._counter--, this._counter === 0 && (this._observable.reportChanges(), this._hasChanged && (this._hasChanged = !1, this.emitter.fire(this._observable.get())));
    }
  }
  function V(x, A) {
    return new M(x, A).emitter.event;
  }
  e.fromObservable = V;
  function T(x) {
    return (A, C, I) => {
      let F = 0, D = !1;
      const B = {
        beginUpdate() {
          F++;
        },
        endUpdate() {
          F--, F === 0 && (x.reportChanges(), D && (D = !1, A.call(C)));
        },
        handlePossibleChange() {
        },
        handleChange() {
          D = !0;
        }
      };
      x.addObserver(B), x.reportChanges();
      const X = {
        dispose() {
          x.removeObserver(B);
        }
      };
      return I instanceof Kt ? I.add(X) : Array.isArray(I) && I.push(X), X;
    };
  }
  e.fromObservableLight = T;
})(ir || (ir = {}));
const St = class St {
  constructor(t) {
    this.listenerCount = 0, this.invocationCount = 0, this.elapsedOverall = 0, this.durations = [], this.name = `${t}_${St._idPool++}`, St.all.add(this);
  }
  start(t) {
    this._stopWatch = new Wn(), this.listenerCount = t;
  }
  stop() {
    if (this._stopWatch) {
      const t = this._stopWatch.elapsed();
      this.durations.push(t), this.elapsedOverall += t, this.invocationCount += 1, this._stopWatch = void 0;
    }
  }
};
St.all = /* @__PURE__ */ new Set(), St._idPool = 0;
let sr = St, al = -1;
const Bn = class Bn {
  constructor(t, n, r = (Bn._idPool++).toString(16).padStart(3, "0")) {
    this._errorHandler = t, this.threshold = n, this.name = r, this._warnCountdown = 0;
  }
  dispose() {
    var t;
    (t = this._stacks) == null || t.clear();
  }
  check(t, n) {
    const r = this.threshold;
    if (r <= 0 || n < r)
      return;
    this._stacks || (this._stacks = /* @__PURE__ */ new Map());
    const i = this._stacks.get(t.value) || 0;
    if (this._stacks.set(t.value, i + 1), this._warnCountdown -= 1, this._warnCountdown <= 0) {
      this._warnCountdown = r * 0.5;
      const [s, a] = this.getMostFrequentStack(), o = `[${this.name}] potential listener LEAK detected, having ${n} listeners already. MOST frequent listener (${a}):`;
      console.warn(o), console.warn(s);
      const u = new ol(o, s);
      this._errorHandler(u);
    }
    return () => {
      const s = this._stacks.get(t.value) || 0;
      this._stacks.set(t.value, s - 1);
    };
  }
  getMostFrequentStack() {
    if (!this._stacks)
      return;
    let t, n = 0;
    for (const [r, i] of this._stacks)
      (!t || n < i) && (t = [r, i], n = i);
    return t;
  }
};
Bn._idPool = 1;
let ar = Bn;
class Qr {
  static create() {
    const t = new Error();
    return new Qr(t.stack ?? "");
  }
  constructor(t) {
    this.value = t;
  }
  print() {
    console.warn(this.value.split(`
`).slice(2).join(`
`));
  }
}
class ol extends Error {
  constructor(t, n) {
    super(t), this.name = "ListenerLeakError", this.stack = n;
  }
}
class ll extends Error {
  constructor(t, n) {
    super(t), this.name = "ListenerRefusalError", this.stack = n;
  }
}
class Hn {
  constructor(t) {
    this.value = t;
  }
}
const ul = 2;
class Fe {
  constructor(t) {
    var n, r, i, s;
    this._size = 0, this._options = t, this._leakageMon = (n = this._options) != null && n.leakWarningThreshold ? new ar((t == null ? void 0 : t.onListenerError) ?? bn, ((r = this._options) == null ? void 0 : r.leakWarningThreshold) ?? al) : void 0, this._perfMon = (i = this._options) != null && i._profName ? new sr(this._options._profName) : void 0, this._deliveryQueue = (s = this._options) == null ? void 0 : s.deliveryQueue;
  }
  dispose() {
    var t, n, r, i;
    this._disposed || (this._disposed = !0, ((t = this._deliveryQueue) == null ? void 0 : t.current) === this && this._deliveryQueue.reset(), this._listeners && (this._listeners = void 0, this._size = 0), (r = (n = this._options) == null ? void 0 : n.onDidRemoveLastListener) == null || r.call(n), (i = this._leakageMon) == null || i.dispose());
  }
  /**
   * For the public to allow to subscribe
   * to events from this Emitter
   */
  get event() {
    return this._event ?? (this._event = (t, n, r) => {
      var o, u, l, h, f, d, m;
      if (this._leakageMon && this._size > this._leakageMon.threshold ** 2) {
        const g = `[${this._leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${this._leakageMon.threshold})`;
        console.warn(g);
        const p = this._leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1], w = new ll(`${g}. HINT: Stack shows most frequent listener (${p[1]}-times)`, p[0]);
        return (((o = this._options) == null ? void 0 : o.onListenerError) || bn)(w), ct.None;
      }
      if (this._disposed)
        return ct.None;
      n && (t = t.bind(n));
      const i = new Hn(t);
      let s;
      this._leakageMon && this._size >= Math.ceil(this._leakageMon.threshold * 0.2) && (i.stack = Qr.create(), s = this._leakageMon.check(i.stack, this._size + 1)), this._listeners ? this._listeners instanceof Hn ? (this._deliveryQueue ?? (this._deliveryQueue = new cl()), this._listeners = [this._listeners, i]) : this._listeners.push(i) : ((l = (u = this._options) == null ? void 0 : u.onWillAddFirstListener) == null || l.call(u, this), this._listeners = i, (f = (h = this._options) == null ? void 0 : h.onDidAddFirstListener) == null || f.call(h, this)), (m = (d = this._options) == null ? void 0 : d.onDidAddListener) == null || m.call(d, this), this._size++;
      const a = _n(() => {
        s == null || s(), this._removeListener(i);
      });
      return r instanceof Kt ? r.add(a) : Array.isArray(r) && r.push(a), a;
    }), this._event;
  }
  _removeListener(t) {
    var s, a, o, u;
    if ((a = (s = this._options) == null ? void 0 : s.onWillRemoveListener) == null || a.call(s, this), !this._listeners)
      return;
    if (this._size === 1) {
      this._listeners = void 0, (u = (o = this._options) == null ? void 0 : o.onDidRemoveLastListener) == null || u.call(o, this), this._size = 0;
      return;
    }
    const n = this._listeners, r = n.indexOf(t);
    if (r === -1)
      throw console.log("disposed?", this._disposed), console.log("size?", this._size), console.log("arr?", JSON.stringify(this._listeners)), new Error("Attempted to dispose unknown listener");
    this._size--, n[r] = void 0;
    const i = this._deliveryQueue.current === this;
    if (this._size * ul <= n.length) {
      let l = 0;
      for (let h = 0; h < n.length; h++)
        n[h] ? n[l++] = n[h] : i && l < this._deliveryQueue.end && (this._deliveryQueue.end--, l < this._deliveryQueue.i && this._deliveryQueue.i--);
      n.length = l;
    }
  }
  _deliver(t, n) {
    var i;
    if (!t)
      return;
    const r = ((i = this._options) == null ? void 0 : i.onListenerError) || bn;
    if (!r) {
      t.value(n);
      return;
    }
    try {
      t.value(n);
    } catch (s) {
      r(s);
    }
  }
  /** Delivers items in the queue. Assumes the queue is ready to go. */
  _deliverQueue(t) {
    const n = t.current._listeners;
    for (; t.i < t.end; )
      this._deliver(n[t.i++], t.value);
    t.reset();
  }
  /**
   * To be kept private to fire an event to
   * subscribers
   */
  fire(t) {
    var n, r, i, s;
    if ((n = this._deliveryQueue) != null && n.current && (this._deliverQueue(this._deliveryQueue), (r = this._perfMon) == null || r.stop()), (i = this._perfMon) == null || i.start(this._size), this._listeners) if (this._listeners instanceof Hn)
      this._deliver(this._listeners, t);
    else {
      const a = this._deliveryQueue;
      a.enqueue(this, t, this._listeners.length), this._deliverQueue(a);
    }
    (s = this._perfMon) == null || s.stop();
  }
  hasListeners() {
    return this._size > 0;
  }
}
class cl {
  constructor() {
    this.i = -1, this.end = 0;
  }
  enqueue(t, n, r) {
    this.i = 0, this.end = r, this.current = t, this.value = n;
  }
  reset() {
    this.i = this.end, this.current = void 0, this.value = void 0;
  }
}
function fl() {
  return globalThis._VSCODE_NLS_MESSAGES;
}
function go() {
  return globalThis._VSCODE_NLS_LANGUAGE;
}
const hl = go() === "pseudo" || typeof document < "u" && document.location && typeof document.location.hash == "string" && document.location.hash.indexOf("pseudo=true") >= 0;
function ai(e, t) {
  let n;
  return t.length === 0 ? n = e : n = e.replace(/\{(\d+)\}/g, (r, i) => {
    const s = i[0], a = t[s];
    let o = r;
    return typeof a == "string" ? o = a : (typeof a == "number" || typeof a == "boolean" || a === void 0 || a === null) && (o = String(a)), o;
  }), hl && (n = "［" + n.replace(/[aouei]/g, "$&$&") + "］"), n;
}
function $(e, t, ...n) {
  return ai(typeof e == "number" ? dl(e, t) : t, n);
}
function dl(e, t) {
  var r;
  const n = (r = fl()) == null ? void 0 : r[e];
  if (typeof n != "string") {
    if (typeof t == "string")
      return t;
    throw new Error(`!!! NLS MISSING: ${e} !!!`);
  }
  return n;
}
const Lt = "en";
let or = !1, lr = !1, zn = !1, fn, Gn = Lt, oi = Lt, gl, ke;
const at = globalThis;
let le;
var ao;
typeof at.vscode < "u" && typeof at.vscode.process < "u" ? le = at.vscode.process : typeof process < "u" && typeof ((ao = process == null ? void 0 : process.versions) == null ? void 0 : ao.node) == "string" && (le = process);
var oo;
const ml = typeof ((oo = le == null ? void 0 : le.versions) == null ? void 0 : oo.electron) == "string", pl = ml && (le == null ? void 0 : le.type) === "renderer";
var lo;
if (typeof le == "object") {
  or = le.platform === "win32", lr = le.platform === "darwin", zn = le.platform === "linux", zn && le.env.SNAP && le.env.SNAP_REVISION, le.env.CI || le.env.BUILD_ARTIFACTSTAGINGDIRECTORY || le.env.GITHUB_WORKSPACE, fn = Lt, Gn = Lt;
  const e = le.env.VSCODE_NLS_CONFIG;
  if (e)
    try {
      const t = JSON.parse(e);
      fn = t.userLocale, oi = t.osLocale, Gn = t.resolvedLanguage || Lt, gl = (lo = t.languagePack) == null ? void 0 : lo.translationsConfigFile;
    } catch {
    }
} else typeof navigator == "object" && !pl ? (ke = navigator.userAgent, or = ke.indexOf("Windows") >= 0, lr = ke.indexOf("Macintosh") >= 0, (ke.indexOf("Macintosh") >= 0 || ke.indexOf("iPad") >= 0 || ke.indexOf("iPhone") >= 0) && navigator.maxTouchPoints && navigator.maxTouchPoints > 0, zn = ke.indexOf("Linux") >= 0, (ke == null ? void 0 : ke.indexOf("Mobi")) >= 0, Gn = go() || Lt, fn = navigator.language.toLowerCase(), oi = fn) : console.error("Unable to resolve platform.");
const en = or, bl = lr, Oe = ke, wl = typeof at.postMessage == "function" && !at.importScripts;
(() => {
  if (wl) {
    const e = [];
    at.addEventListener("message", (n) => {
      if (n.data && n.data.vscodeScheduleAsyncWork)
        for (let r = 0, i = e.length; r < i; r++) {
          const s = e[r];
          if (s.id === n.data.vscodeScheduleAsyncWork) {
            e.splice(r, 1), s.callback();
            return;
          }
        }
    });
    let t = 0;
    return (n) => {
      const r = ++t;
      e.push({
        id: r,
        callback: n
      }), at.postMessage({ vscodeScheduleAsyncWork: r }, "*");
    };
  }
  return (e) => setTimeout(e);
})();
const xl = !!(Oe && Oe.indexOf("Chrome") >= 0);
Oe && Oe.indexOf("Firefox") >= 0;
!xl && Oe && Oe.indexOf("Safari") >= 0;
Oe && Oe.indexOf("Edg/") >= 0;
Oe && Oe.indexOf("Android") >= 0;
function vl(e) {
  return e;
}
class yl {
  constructor(t, n) {
    this.lastCache = void 0, this.lastArgKey = void 0, typeof t == "function" ? (this._fn = t, this._computeKey = vl) : (this._fn = n, this._computeKey = t.getCacheKey);
  }
  get(t) {
    const n = this._computeKey(t);
    return this.lastArgKey !== n && (this.lastArgKey = n, this.lastCache = this._fn(t)), this.lastCache;
  }
}
var rt;
(function(e) {
  e[e.Uninitialized = 0] = "Uninitialized", e[e.Running = 1] = "Running", e[e.Completed = 2] = "Completed";
})(rt || (rt = {}));
class ur {
  constructor(t) {
    this.executor = t, this._state = rt.Uninitialized;
  }
  /**
   * Get the wrapped value.
   *
   * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
   * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
   */
  get value() {
    if (this._state === rt.Uninitialized) {
      this._state = rt.Running;
      try {
        this._value = this.executor();
      } catch (t) {
        this._error = t;
      } finally {
        this._state = rt.Completed;
      }
    } else if (this._state === rt.Running)
      throw new Error("Cannot read the value of a lazy that is being initialized");
    if (this._error)
      throw this._error;
    return this._value;
  }
  /**
   * Get the wrapped value without forcing evaluation.
   */
  get rawValue() {
    return this._value;
  }
}
function Ll(e) {
  return e.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, "\\$&");
}
function Nl(e) {
  return e.source === "^" || e.source === "^$" || e.source === "$" || e.source === "^\\s*$" ? !1 : !!(e.exec("") && e.lastIndex === 0);
}
function _l(e) {
  return e.split(/\r\n|\r|\n/);
}
function Sl(e) {
  for (let t = 0, n = e.length; t < n; t++) {
    const r = e.charCodeAt(t);
    if (r !== 32 && r !== 9)
      return t;
  }
  return -1;
}
function Al(e, t = e.length - 1) {
  for (let n = t; n >= 0; n--) {
    const r = e.charCodeAt(n);
    if (r !== 32 && r !== 9)
      return n;
  }
  return -1;
}
function mo(e) {
  return e >= 65 && e <= 90;
}
function kl(e, t) {
  const n = Math.min(e.length, t.length);
  let r;
  for (r = 0; r < n; r++)
    if (e.charCodeAt(r) !== t.charCodeAt(r))
      return r;
  return n;
}
function Rl(e, t) {
  const n = Math.min(e.length, t.length);
  let r;
  const i = e.length - 1, s = t.length - 1;
  for (r = 0; r < n; r++)
    if (e.charCodeAt(i - r) !== t.charCodeAt(s - r))
      return r;
  return n;
}
function cr(e) {
  return 55296 <= e && e <= 56319;
}
function El(e) {
  return 56320 <= e && e <= 57343;
}
function Ml(e, t) {
  return (e - 55296 << 10) + (t - 56320) + 65536;
}
function Tl(e, t, n) {
  const r = e.charCodeAt(n);
  if (cr(r) && n + 1 < t) {
    const i = e.charCodeAt(n + 1);
    if (El(i))
      return Ml(r, i);
  }
  return r;
}
const Pl = /^[\t\n\r\x20-\x7E]*$/;
function Cl(e) {
  return Pl.test(e);
}
const Ie = class Ie {
  static getInstance(t) {
    return Ie.cache.get(Array.from(t));
  }
  static getLocales() {
    return Ie._locales.value;
  }
  constructor(t) {
    this.confusableDictionary = t;
  }
  isAmbiguous(t) {
    return this.confusableDictionary.has(t);
  }
  /**
   * Returns the non basic ASCII code point that the given code point can be confused,
   * or undefined if such code point does note exist.
   */
  getPrimaryConfusable(t) {
    return this.confusableDictionary.get(t);
  }
  getConfusableCodePoints() {
    return new Set(this.confusableDictionary.keys());
  }
};
Ie.ambiguousCharacterData = new ur(() => JSON.parse('{"_common":[8232,32,8233,32,5760,32,8192,32,8193,32,8194,32,8195,32,8196,32,8197,32,8198,32,8200,32,8201,32,8202,32,8287,32,8199,32,8239,32,2042,95,65101,95,65102,95,65103,95,8208,45,8209,45,8210,45,65112,45,1748,45,8259,45,727,45,8722,45,10134,45,11450,45,1549,44,1643,44,184,44,42233,44,894,59,2307,58,2691,58,1417,58,1795,58,1796,58,5868,58,65072,58,6147,58,6153,58,8282,58,1475,58,760,58,42889,58,8758,58,720,58,42237,58,451,33,11601,33,660,63,577,63,2429,63,5038,63,42731,63,119149,46,8228,46,1793,46,1794,46,42510,46,68176,46,1632,46,1776,46,42232,46,1373,96,65287,96,8219,96,1523,96,8242,96,1370,96,8175,96,65344,96,900,96,8189,96,8125,96,8127,96,8190,96,697,96,884,96,712,96,714,96,715,96,756,96,699,96,701,96,700,96,702,96,42892,96,1497,96,2036,96,2037,96,5194,96,5836,96,94033,96,94034,96,65339,91,10088,40,10098,40,12308,40,64830,40,65341,93,10089,41,10099,41,12309,41,64831,41,10100,123,119060,123,10101,125,65342,94,8270,42,1645,42,8727,42,66335,42,5941,47,8257,47,8725,47,8260,47,9585,47,10187,47,10744,47,119354,47,12755,47,12339,47,11462,47,20031,47,12035,47,65340,92,65128,92,8726,92,10189,92,10741,92,10745,92,119311,92,119355,92,12756,92,20022,92,12034,92,42872,38,708,94,710,94,5869,43,10133,43,66203,43,8249,60,10094,60,706,60,119350,60,5176,60,5810,60,5120,61,11840,61,12448,61,42239,61,8250,62,10095,62,707,62,119351,62,5171,62,94015,62,8275,126,732,126,8128,126,8764,126,65372,124,65293,45,118002,50,120784,50,120794,50,120804,50,120814,50,120824,50,130034,50,42842,50,423,50,1000,50,42564,50,5311,50,42735,50,119302,51,118003,51,120785,51,120795,51,120805,51,120815,51,120825,51,130035,51,42923,51,540,51,439,51,42858,51,11468,51,1248,51,94011,51,71882,51,118004,52,120786,52,120796,52,120806,52,120816,52,120826,52,130036,52,5070,52,71855,52,118005,53,120787,53,120797,53,120807,53,120817,53,120827,53,130037,53,444,53,71867,53,118006,54,120788,54,120798,54,120808,54,120818,54,120828,54,130038,54,11474,54,5102,54,71893,54,119314,55,118007,55,120789,55,120799,55,120809,55,120819,55,120829,55,130039,55,66770,55,71878,55,2819,56,2538,56,2666,56,125131,56,118008,56,120790,56,120800,56,120810,56,120820,56,120830,56,130040,56,547,56,546,56,66330,56,2663,57,2920,57,2541,57,3437,57,118009,57,120791,57,120801,57,120811,57,120821,57,120831,57,130041,57,42862,57,11466,57,71884,57,71852,57,71894,57,9082,97,65345,97,119834,97,119886,97,119938,97,119990,97,120042,97,120094,97,120146,97,120198,97,120250,97,120302,97,120354,97,120406,97,120458,97,593,97,945,97,120514,97,120572,97,120630,97,120688,97,120746,97,65313,65,117974,65,119808,65,119860,65,119912,65,119964,65,120016,65,120068,65,120120,65,120172,65,120224,65,120276,65,120328,65,120380,65,120432,65,913,65,120488,65,120546,65,120604,65,120662,65,120720,65,5034,65,5573,65,42222,65,94016,65,66208,65,119835,98,119887,98,119939,98,119991,98,120043,98,120095,98,120147,98,120199,98,120251,98,120303,98,120355,98,120407,98,120459,98,388,98,5071,98,5234,98,5551,98,65314,66,8492,66,117975,66,119809,66,119861,66,119913,66,120017,66,120069,66,120121,66,120173,66,120225,66,120277,66,120329,66,120381,66,120433,66,42932,66,914,66,120489,66,120547,66,120605,66,120663,66,120721,66,5108,66,5623,66,42192,66,66178,66,66209,66,66305,66,65347,99,8573,99,119836,99,119888,99,119940,99,119992,99,120044,99,120096,99,120148,99,120200,99,120252,99,120304,99,120356,99,120408,99,120460,99,7428,99,1010,99,11429,99,43951,99,66621,99,128844,67,71913,67,71922,67,65315,67,8557,67,8450,67,8493,67,117976,67,119810,67,119862,67,119914,67,119966,67,120018,67,120174,67,120226,67,120278,67,120330,67,120382,67,120434,67,1017,67,11428,67,5087,67,42202,67,66210,67,66306,67,66581,67,66844,67,8574,100,8518,100,119837,100,119889,100,119941,100,119993,100,120045,100,120097,100,120149,100,120201,100,120253,100,120305,100,120357,100,120409,100,120461,100,1281,100,5095,100,5231,100,42194,100,8558,68,8517,68,117977,68,119811,68,119863,68,119915,68,119967,68,120019,68,120071,68,120123,68,120175,68,120227,68,120279,68,120331,68,120383,68,120435,68,5024,68,5598,68,5610,68,42195,68,8494,101,65349,101,8495,101,8519,101,119838,101,119890,101,119942,101,120046,101,120098,101,120150,101,120202,101,120254,101,120306,101,120358,101,120410,101,120462,101,43826,101,1213,101,8959,69,65317,69,8496,69,117978,69,119812,69,119864,69,119916,69,120020,69,120072,69,120124,69,120176,69,120228,69,120280,69,120332,69,120384,69,120436,69,917,69,120492,69,120550,69,120608,69,120666,69,120724,69,11577,69,5036,69,42224,69,71846,69,71854,69,66182,69,119839,102,119891,102,119943,102,119995,102,120047,102,120099,102,120151,102,120203,102,120255,102,120307,102,120359,102,120411,102,120463,102,43829,102,42905,102,383,102,7837,102,1412,102,119315,70,8497,70,117979,70,119813,70,119865,70,119917,70,120021,70,120073,70,120125,70,120177,70,120229,70,120281,70,120333,70,120385,70,120437,70,42904,70,988,70,120778,70,5556,70,42205,70,71874,70,71842,70,66183,70,66213,70,66853,70,65351,103,8458,103,119840,103,119892,103,119944,103,120048,103,120100,103,120152,103,120204,103,120256,103,120308,103,120360,103,120412,103,120464,103,609,103,7555,103,397,103,1409,103,117980,71,119814,71,119866,71,119918,71,119970,71,120022,71,120074,71,120126,71,120178,71,120230,71,120282,71,120334,71,120386,71,120438,71,1292,71,5056,71,5107,71,42198,71,65352,104,8462,104,119841,104,119945,104,119997,104,120049,104,120101,104,120153,104,120205,104,120257,104,120309,104,120361,104,120413,104,120465,104,1211,104,1392,104,5058,104,65320,72,8459,72,8460,72,8461,72,117981,72,119815,72,119867,72,119919,72,120023,72,120179,72,120231,72,120283,72,120335,72,120387,72,120439,72,919,72,120494,72,120552,72,120610,72,120668,72,120726,72,11406,72,5051,72,5500,72,42215,72,66255,72,731,105,9075,105,65353,105,8560,105,8505,105,8520,105,119842,105,119894,105,119946,105,119998,105,120050,105,120102,105,120154,105,120206,105,120258,105,120310,105,120362,105,120414,105,120466,105,120484,105,618,105,617,105,953,105,8126,105,890,105,120522,105,120580,105,120638,105,120696,105,120754,105,1110,105,42567,105,1231,105,43893,105,5029,105,71875,105,65354,106,8521,106,119843,106,119895,106,119947,106,119999,106,120051,106,120103,106,120155,106,120207,106,120259,106,120311,106,120363,106,120415,106,120467,106,1011,106,1112,106,65322,74,117983,74,119817,74,119869,74,119921,74,119973,74,120025,74,120077,74,120129,74,120181,74,120233,74,120285,74,120337,74,120389,74,120441,74,42930,74,895,74,1032,74,5035,74,5261,74,42201,74,119844,107,119896,107,119948,107,120000,107,120052,107,120104,107,120156,107,120208,107,120260,107,120312,107,120364,107,120416,107,120468,107,8490,75,65323,75,117984,75,119818,75,119870,75,119922,75,119974,75,120026,75,120078,75,120130,75,120182,75,120234,75,120286,75,120338,75,120390,75,120442,75,922,75,120497,75,120555,75,120613,75,120671,75,120729,75,11412,75,5094,75,5845,75,42199,75,66840,75,1472,108,8739,73,9213,73,65512,73,1633,108,1777,73,66336,108,125127,108,118001,108,120783,73,120793,73,120803,73,120813,73,120823,73,130033,73,65321,73,8544,73,8464,73,8465,73,117982,108,119816,73,119868,73,119920,73,120024,73,120128,73,120180,73,120232,73,120284,73,120336,73,120388,73,120440,73,65356,108,8572,73,8467,108,119845,108,119897,108,119949,108,120001,108,120053,108,120105,73,120157,73,120209,73,120261,73,120313,73,120365,73,120417,73,120469,73,448,73,120496,73,120554,73,120612,73,120670,73,120728,73,11410,73,1030,73,1216,73,1493,108,1503,108,1575,108,126464,108,126592,108,65166,108,65165,108,1994,108,11599,73,5825,73,42226,73,93992,73,66186,124,66313,124,119338,76,8556,76,8466,76,117985,76,119819,76,119871,76,119923,76,120027,76,120079,76,120131,76,120183,76,120235,76,120287,76,120339,76,120391,76,120443,76,11472,76,5086,76,5290,76,42209,76,93974,76,71843,76,71858,76,66587,76,66854,76,65325,77,8559,77,8499,77,117986,77,119820,77,119872,77,119924,77,120028,77,120080,77,120132,77,120184,77,120236,77,120288,77,120340,77,120392,77,120444,77,924,77,120499,77,120557,77,120615,77,120673,77,120731,77,1018,77,11416,77,5047,77,5616,77,5846,77,42207,77,66224,77,66321,77,119847,110,119899,110,119951,110,120003,110,120055,110,120107,110,120159,110,120211,110,120263,110,120315,110,120367,110,120419,110,120471,110,1400,110,1404,110,65326,78,8469,78,117987,78,119821,78,119873,78,119925,78,119977,78,120029,78,120081,78,120185,78,120237,78,120289,78,120341,78,120393,78,120445,78,925,78,120500,78,120558,78,120616,78,120674,78,120732,78,11418,78,42208,78,66835,78,3074,111,3202,111,3330,111,3458,111,2406,111,2662,111,2790,111,3046,111,3174,111,3302,111,3430,111,3664,111,3792,111,4160,111,1637,111,1781,111,65359,111,8500,111,119848,111,119900,111,119952,111,120056,111,120108,111,120160,111,120212,111,120264,111,120316,111,120368,111,120420,111,120472,111,7439,111,7441,111,43837,111,959,111,120528,111,120586,111,120644,111,120702,111,120760,111,963,111,120532,111,120590,111,120648,111,120706,111,120764,111,11423,111,4351,111,1413,111,1505,111,1607,111,126500,111,126564,111,126596,111,65259,111,65260,111,65258,111,65257,111,1726,111,64428,111,64429,111,64427,111,64426,111,1729,111,64424,111,64425,111,64423,111,64422,111,1749,111,3360,111,4125,111,66794,111,71880,111,71895,111,66604,111,1984,79,2534,79,2918,79,12295,79,70864,79,71904,79,118000,79,120782,79,120792,79,120802,79,120812,79,120822,79,130032,79,65327,79,117988,79,119822,79,119874,79,119926,79,119978,79,120030,79,120082,79,120134,79,120186,79,120238,79,120290,79,120342,79,120394,79,120446,79,927,79,120502,79,120560,79,120618,79,120676,79,120734,79,11422,79,1365,79,11604,79,4816,79,2848,79,66754,79,42227,79,71861,79,66194,79,66219,79,66564,79,66838,79,9076,112,65360,112,119849,112,119901,112,119953,112,120005,112,120057,112,120109,112,120161,112,120213,112,120265,112,120317,112,120369,112,120421,112,120473,112,961,112,120530,112,120544,112,120588,112,120602,112,120646,112,120660,112,120704,112,120718,112,120762,112,120776,112,11427,112,65328,80,8473,80,117989,80,119823,80,119875,80,119927,80,119979,80,120031,80,120083,80,120187,80,120239,80,120291,80,120343,80,120395,80,120447,80,929,80,120504,80,120562,80,120620,80,120678,80,120736,80,11426,80,5090,80,5229,80,42193,80,66197,80,119850,113,119902,113,119954,113,120006,113,120058,113,120110,113,120162,113,120214,113,120266,113,120318,113,120370,113,120422,113,120474,113,1307,113,1379,113,1382,113,8474,81,117990,81,119824,81,119876,81,119928,81,119980,81,120032,81,120084,81,120188,81,120240,81,120292,81,120344,81,120396,81,120448,81,11605,81,119851,114,119903,114,119955,114,120007,114,120059,114,120111,114,120163,114,120215,114,120267,114,120319,114,120371,114,120423,114,120475,114,43847,114,43848,114,7462,114,11397,114,43905,114,119318,82,8475,82,8476,82,8477,82,117991,82,119825,82,119877,82,119929,82,120033,82,120189,82,120241,82,120293,82,120345,82,120397,82,120449,82,422,82,5025,82,5074,82,66740,82,5511,82,42211,82,94005,82,65363,115,119852,115,119904,115,119956,115,120008,115,120060,115,120112,115,120164,115,120216,115,120268,115,120320,115,120372,115,120424,115,120476,115,42801,115,445,115,1109,115,43946,115,71873,115,66632,115,65331,83,117992,83,119826,83,119878,83,119930,83,119982,83,120034,83,120086,83,120138,83,120190,83,120242,83,120294,83,120346,83,120398,83,120450,83,1029,83,1359,83,5077,83,5082,83,42210,83,94010,83,66198,83,66592,83,119853,116,119905,116,119957,116,120009,116,120061,116,120113,116,120165,116,120217,116,120269,116,120321,116,120373,116,120425,116,120477,116,8868,84,10201,84,128872,84,65332,84,117993,84,119827,84,119879,84,119931,84,119983,84,120035,84,120087,84,120139,84,120191,84,120243,84,120295,84,120347,84,120399,84,120451,84,932,84,120507,84,120565,84,120623,84,120681,84,120739,84,11430,84,5026,84,42196,84,93962,84,71868,84,66199,84,66225,84,66325,84,119854,117,119906,117,119958,117,120010,117,120062,117,120114,117,120166,117,120218,117,120270,117,120322,117,120374,117,120426,117,120478,117,42911,117,7452,117,43854,117,43858,117,651,117,965,117,120534,117,120592,117,120650,117,120708,117,120766,117,1405,117,66806,117,71896,117,8746,85,8899,85,117994,85,119828,85,119880,85,119932,85,119984,85,120036,85,120088,85,120140,85,120192,85,120244,85,120296,85,120348,85,120400,85,120452,85,1357,85,4608,85,66766,85,5196,85,42228,85,94018,85,71864,85,8744,118,8897,118,65366,118,8564,118,119855,118,119907,118,119959,118,120011,118,120063,118,120115,118,120167,118,120219,118,120271,118,120323,118,120375,118,120427,118,120479,118,7456,118,957,118,120526,118,120584,118,120642,118,120700,118,120758,118,1141,118,1496,118,71430,118,43945,118,71872,118,119309,86,1639,86,1783,86,8548,86,117995,86,119829,86,119881,86,119933,86,119985,86,120037,86,120089,86,120141,86,120193,86,120245,86,120297,86,120349,86,120401,86,120453,86,1140,86,11576,86,5081,86,5167,86,42719,86,42214,86,93960,86,71840,86,66845,86,623,119,119856,119,119908,119,119960,119,120012,119,120064,119,120116,119,120168,119,120220,119,120272,119,120324,119,120376,119,120428,119,120480,119,7457,119,1121,119,1309,119,1377,119,71434,119,71438,119,71439,119,43907,119,71910,87,71919,87,117996,87,119830,87,119882,87,119934,87,119986,87,120038,87,120090,87,120142,87,120194,87,120246,87,120298,87,120350,87,120402,87,120454,87,1308,87,5043,87,5076,87,42218,87,5742,120,10539,120,10540,120,10799,120,65368,120,8569,120,119857,120,119909,120,119961,120,120013,120,120065,120,120117,120,120169,120,120221,120,120273,120,120325,120,120377,120,120429,120,120481,120,5441,120,5501,120,5741,88,9587,88,66338,88,71916,88,65336,88,8553,88,117997,88,119831,88,119883,88,119935,88,119987,88,120039,88,120091,88,120143,88,120195,88,120247,88,120299,88,120351,88,120403,88,120455,88,42931,88,935,88,120510,88,120568,88,120626,88,120684,88,120742,88,11436,88,11613,88,5815,88,42219,88,66192,88,66228,88,66327,88,66855,88,611,121,7564,121,65369,121,119858,121,119910,121,119962,121,120014,121,120066,121,120118,121,120170,121,120222,121,120274,121,120326,121,120378,121,120430,121,120482,121,655,121,7935,121,43866,121,947,121,8509,121,120516,121,120574,121,120632,121,120690,121,120748,121,1199,121,4327,121,71900,121,65337,89,117998,89,119832,89,119884,89,119936,89,119988,89,120040,89,120092,89,120144,89,120196,89,120248,89,120300,89,120352,89,120404,89,120456,89,933,89,978,89,120508,89,120566,89,120624,89,120682,89,120740,89,11432,89,1198,89,5033,89,5053,89,42220,89,94019,89,71844,89,66226,89,119859,122,119911,122,119963,122,120015,122,120067,122,120119,122,120171,122,120223,122,120275,122,120327,122,120379,122,120431,122,120483,122,7458,122,43923,122,71876,122,71909,90,66293,90,65338,90,8484,90,8488,90,117999,90,119833,90,119885,90,119937,90,119989,90,120041,90,120197,90,120249,90,120301,90,120353,90,120405,90,120457,90,918,90,120493,90,120551,90,120609,90,120667,90,120725,90,5059,90,42204,90,71849,90,65282,34,65283,35,65284,36,65285,37,65286,38,65290,42,65291,43,65294,46,65295,47,65296,48,65298,50,65299,51,65300,52,65301,53,65302,54,65303,55,65304,56,65305,57,65308,60,65309,61,65310,62,65312,64,65316,68,65318,70,65319,71,65324,76,65329,81,65330,82,65333,85,65334,86,65335,87,65343,95,65346,98,65348,100,65350,102,65355,107,65357,109,65358,110,65361,113,65362,114,65364,116,65365,117,65367,119,65370,122,65371,123,65373,125,119846,109],"_default":[160,32,8211,45,65374,126,8218,44,65306,58,65281,33,8216,96,8217,96,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"cs":[65374,126,8218,44,65306,58,65281,33,8216,96,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"de":[65374,126,65306,58,65281,33,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"es":[8211,45,65374,126,8218,44,65306,58,65281,33,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"fr":[65374,126,8218,44,65306,58,65281,33,8216,96,8245,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"it":[160,32,8211,45,65374,126,8218,44,65306,58,65281,33,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"ja":[8211,45,8218,44,65281,33,8216,96,8245,96,180,96,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65292,44,65297,49,65307,59],"ko":[8211,45,65374,126,8218,44,65306,58,65281,33,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"pl":[65374,126,65306,58,65281,33,8216,96,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"pt-BR":[65374,126,8218,44,65306,58,65281,33,8216,96,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"qps-ploc":[160,32,8211,45,65374,126,8218,44,65306,58,65281,33,8216,96,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"ru":[65374,126,8218,44,65306,58,65281,33,8216,96,8245,96,180,96,12494,47,305,105,921,73,1009,112,215,120,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"tr":[160,32,8211,45,65374,126,8218,44,65306,58,65281,33,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65288,40,65289,41,65292,44,65297,49,65307,59,65311,63],"zh-hans":[160,32,65374,126,8218,44,8245,96,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89,65297,49],"zh-hant":[8211,45,65374,126,8218,44,180,96,12494,47,1047,51,1073,54,1072,97,1040,65,1068,98,1042,66,1089,99,1057,67,1077,101,1045,69,1053,72,305,105,1050,75,921,73,1052,77,1086,111,1054,79,1009,112,1088,112,1056,80,1075,114,1058,84,215,120,1093,120,1061,88,1091,121,1059,89]}')), Ie.cache = new yl({ getCacheKey: JSON.stringify }, (t) => {
  function n(h) {
    const f = /* @__PURE__ */ new Map();
    for (let d = 0; d < h.length; d += 2)
      f.set(h[d], h[d + 1]);
    return f;
  }
  function r(h, f) {
    const d = new Map(h);
    for (const [m, g] of f)
      d.set(m, g);
    return d;
  }
  function i(h, f) {
    if (!h)
      return f;
    const d = /* @__PURE__ */ new Map();
    for (const [m, g] of h)
      f.has(m) && d.set(m, g);
    return d;
  }
  const s = Ie.ambiguousCharacterData.value;
  let a = t.filter((h) => !h.startsWith("_") && Object.hasOwn(s, h));
  a.length === 0 && (a = ["_default"]);
  let o;
  for (const h of a) {
    const f = n(s[h]);
    o = i(o, f);
  }
  const u = n(s._common), l = r(u, o);
  return new Ie(l);
}), Ie._locales = new ur(() => Object.keys(Ie.ambiguousCharacterData.value).filter((t) => !t.startsWith("_")));
let tn = Ie;
const At = class At {
  static getRawData() {
    return JSON.parse('{"_common":[11,12,13,127,847,1564,4447,4448,6068,6069,6155,6156,6157,6158,7355,7356,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8204,8205,8206,8207,8234,8235,8236,8237,8238,8239,8287,8288,8289,8290,8291,8292,8293,8294,8295,8296,8297,8298,8299,8300,8301,8302,8303,10240,12644,65024,65025,65026,65027,65028,65029,65030,65031,65032,65033,65034,65035,65036,65037,65038,65039,65279,65440,65520,65521,65522,65523,65524,65525,65526,65527,65528,65532,78844,119155,119156,119157,119158,119159,119160,119161,119162,917504,917505,917506,917507,917508,917509,917510,917511,917512,917513,917514,917515,917516,917517,917518,917519,917520,917521,917522,917523,917524,917525,917526,917527,917528,917529,917530,917531,917532,917533,917534,917535,917536,917537,917538,917539,917540,917541,917542,917543,917544,917545,917546,917547,917548,917549,917550,917551,917552,917553,917554,917555,917556,917557,917558,917559,917560,917561,917562,917563,917564,917565,917566,917567,917568,917569,917570,917571,917572,917573,917574,917575,917576,917577,917578,917579,917580,917581,917582,917583,917584,917585,917586,917587,917588,917589,917590,917591,917592,917593,917594,917595,917596,917597,917598,917599,917600,917601,917602,917603,917604,917605,917606,917607,917608,917609,917610,917611,917612,917613,917614,917615,917616,917617,917618,917619,917620,917621,917622,917623,917624,917625,917626,917627,917628,917629,917630,917631,917760,917761,917762,917763,917764,917765,917766,917767,917768,917769,917770,917771,917772,917773,917774,917775,917776,917777,917778,917779,917780,917781,917782,917783,917784,917785,917786,917787,917788,917789,917790,917791,917792,917793,917794,917795,917796,917797,917798,917799,917800,917801,917802,917803,917804,917805,917806,917807,917808,917809,917810,917811,917812,917813,917814,917815,917816,917817,917818,917819,917820,917821,917822,917823,917824,917825,917826,917827,917828,917829,917830,917831,917832,917833,917834,917835,917836,917837,917838,917839,917840,917841,917842,917843,917844,917845,917846,917847,917848,917849,917850,917851,917852,917853,917854,917855,917856,917857,917858,917859,917860,917861,917862,917863,917864,917865,917866,917867,917868,917869,917870,917871,917872,917873,917874,917875,917876,917877,917878,917879,917880,917881,917882,917883,917884,917885,917886,917887,917888,917889,917890,917891,917892,917893,917894,917895,917896,917897,917898,917899,917900,917901,917902,917903,917904,917905,917906,917907,917908,917909,917910,917911,917912,917913,917914,917915,917916,917917,917918,917919,917920,917921,917922,917923,917924,917925,917926,917927,917928,917929,917930,917931,917932,917933,917934,917935,917936,917937,917938,917939,917940,917941,917942,917943,917944,917945,917946,917947,917948,917949,917950,917951,917952,917953,917954,917955,917956,917957,917958,917959,917960,917961,917962,917963,917964,917965,917966,917967,917968,917969,917970,917971,917972,917973,917974,917975,917976,917977,917978,917979,917980,917981,917982,917983,917984,917985,917986,917987,917988,917989,917990,917991,917992,917993,917994,917995,917996,917997,917998,917999],"cs":[173,8203,12288],"de":[173,8203,12288],"es":[8203,12288],"fr":[173,8203,12288],"it":[160,173,12288],"ja":[173],"ko":[173,12288],"pl":[173,8203,12288],"pt-BR":[173,8203,12288],"qps-ploc":[160,173,8203,12288],"ru":[173,12288],"tr":[160,173,8203,12288],"zh-hans":[160,173,8203,12288],"zh-hant":[173,12288]}');
  }
  static getData() {
    return this._data || (this._data = new Set([...Object.values(At.getRawData())].flat())), this._data;
  }
  static isInvisibleCharacter(t) {
    return At.getData().has(t);
  }
  static get codePoints() {
    return At.getData();
  }
};
At._data = void 0;
let zt = At;
const Jn = "default", Il = "$initialize";
class Fl {
  constructor(t, n, r, i, s) {
    this.vsWorker = t, this.req = n, this.channel = r, this.method = i, this.args = s, this.type = 0;
  }
}
class li {
  constructor(t, n, r, i) {
    this.vsWorker = t, this.seq = n, this.res = r, this.err = i, this.type = 1;
  }
}
class Vl {
  constructor(t, n, r, i, s) {
    this.vsWorker = t, this.req = n, this.channel = r, this.eventName = i, this.arg = s, this.type = 2;
  }
}
class Dl {
  constructor(t, n, r) {
    this.vsWorker = t, this.req = n, this.event = r, this.type = 3;
  }
}
class Ol {
  constructor(t, n) {
    this.vsWorker = t, this.req = n, this.type = 4;
  }
}
class $l {
  constructor(t) {
    this._workerId = -1, this._handler = t, this._lastSentReq = 0, this._pendingReplies = /* @__PURE__ */ Object.create(null), this._pendingEmitters = /* @__PURE__ */ new Map(), this._pendingEvents = /* @__PURE__ */ new Map();
  }
  setWorkerId(t) {
    this._workerId = t;
  }
  async sendMessage(t, n, r) {
    const i = String(++this._lastSentReq);
    return new Promise((s, a) => {
      this._pendingReplies[i] = {
        resolve: s,
        reject: a
      }, this._send(new Fl(this._workerId, i, t, n, r));
    });
  }
  listen(t, n, r) {
    let i = null;
    const s = new Fe({
      onWillAddFirstListener: () => {
        i = String(++this._lastSentReq), this._pendingEmitters.set(i, s), this._send(new Vl(this._workerId, i, t, n, r));
      },
      onDidRemoveLastListener: () => {
        this._pendingEmitters.delete(i), this._send(new Ol(this._workerId, i)), i = null;
      }
    });
    return s.event;
  }
  handleMessage(t) {
    !t || !t.vsWorker || this._workerId !== -1 && t.vsWorker !== this._workerId || this._handleMessage(t);
  }
  createProxyToRemoteChannel(t, n) {
    const r = {
      get: (i, s) => (typeof s == "string" && !i[s] && (bo(s) ? i[s] = (a) => this.listen(t, s, a) : po(s) ? i[s] = this.listen(t, s, void 0) : s.charCodeAt(0) === 36 && (i[s] = async (...a) => (await (n == null ? void 0 : n()), this.sendMessage(t, s, a)))), i[s])
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), r);
  }
  _handleMessage(t) {
    switch (t.type) {
      case 1:
        return this._handleReplyMessage(t);
      case 0:
        return this._handleRequestMessage(t);
      case 2:
        return this._handleSubscribeEventMessage(t);
      case 3:
        return this._handleEventMessage(t);
      case 4:
        return this._handleUnsubscribeEventMessage(t);
    }
  }
  _handleReplyMessage(t) {
    if (!this._pendingReplies[t.seq]) {
      console.warn("Got reply to unknown seq");
      return;
    }
    const n = this._pendingReplies[t.seq];
    if (delete this._pendingReplies[t.seq], t.err) {
      let r = t.err;
      if (t.err.$isError) {
        const i = new Error();
        i.name = t.err.name, i.message = t.err.message, i.stack = t.err.stack, r = i;
      }
      n.reject(r);
      return;
    }
    n.resolve(t.res);
  }
  _handleRequestMessage(t) {
    const n = t.req;
    this._handler.handleMessage(t.channel, t.method, t.args).then((i) => {
      this._send(new li(this._workerId, n, i, void 0));
    }, (i) => {
      i.detail instanceof Error && (i.detail = nr(i.detail)), this._send(new li(this._workerId, n, void 0, nr(i)));
    });
  }
  _handleSubscribeEventMessage(t) {
    const n = t.req, r = this._handler.handleEvent(t.channel, t.eventName, t.arg)((i) => {
      this._send(new Dl(this._workerId, n, i));
    });
    this._pendingEvents.set(n, r);
  }
  _handleEventMessage(t) {
    if (!this._pendingEmitters.has(t.req)) {
      console.warn("Got event for unknown req");
      return;
    }
    this._pendingEmitters.get(t.req).fire(t.event);
  }
  _handleUnsubscribeEventMessage(t) {
    if (!this._pendingEvents.has(t.req)) {
      console.warn("Got unsubscribe for unknown req");
      return;
    }
    this._pendingEvents.get(t.req).dispose(), this._pendingEvents.delete(t.req);
  }
  _send(t) {
    const n = [];
    if (t.type === 0)
      for (let r = 0; r < t.args.length; r++) {
        const i = t.args[r];
        i instanceof ArrayBuffer && n.push(i);
      }
    else t.type === 1 && t.res instanceof ArrayBuffer && n.push(t.res);
    this._handler.sendMessage(t, n);
  }
}
function po(e) {
  return e[0] === "o" && e[1] === "n" && mo(e.charCodeAt(2));
}
function bo(e) {
  return /^onDynamic/.test(e) && mo(e.charCodeAt(9));
}
class Bl {
  constructor(t, n) {
    this._localChannels = /* @__PURE__ */ new Map(), this._remoteChannels = /* @__PURE__ */ new Map(), this._protocol = new $l({
      sendMessage: (r, i) => {
        t(r, i);
      },
      handleMessage: (r, i, s) => this._handleMessage(r, i, s),
      handleEvent: (r, i, s) => this._handleEvent(r, i, s)
    }), this.requestHandler = n(this);
  }
  onmessage(t) {
    this._protocol.handleMessage(t);
  }
  _handleMessage(t, n, r) {
    if (t === Jn && n === Il)
      return this.initialize(r[0]);
    const i = t === Jn ? this.requestHandler : this._localChannels.get(t);
    if (!i)
      return Promise.reject(new Error(`Missing channel ${t} on worker thread`));
    const s = i[n];
    if (typeof s != "function")
      return Promise.reject(new Error(`Missing method ${n} on worker thread channel ${t}`));
    try {
      return Promise.resolve(s.apply(i, r));
    } catch (a) {
      return Promise.reject(a);
    }
  }
  _handleEvent(t, n, r) {
    const i = t === Jn ? this.requestHandler : this._localChannels.get(t);
    if (!i)
      throw new Error(`Missing channel ${t} on worker thread`);
    if (bo(n)) {
      const s = i[n];
      if (typeof s != "function")
        throw new Error(`Missing dynamic event ${n} on request handler.`);
      const a = s.call(i, r);
      if (typeof a != "function")
        throw new Error(`Missing dynamic event ${n} on request handler.`);
      return a;
    }
    if (po(n)) {
      const s = i[n];
      if (typeof s != "function")
        throw new Error(`Missing event ${n} on request handler.`);
      return s;
    }
    throw new Error(`Malformed event name ${n}`);
  }
  getChannel(t) {
    if (!this._remoteChannels.has(t)) {
      const n = this._protocol.createProxyToRemoteChannel(t);
      this._remoteChannels.set(t, n);
    }
    return this._remoteChannels.get(t);
  }
  async initialize(t) {
    this._protocol.setWorkerId(t);
  }
}
let ui = !1;
function Ul(e) {
  if (ui)
    throw new Error("WebWorker already initialized!");
  ui = !0;
  const t = new Bl((n) => globalThis.postMessage(n), (n) => e(n));
  return globalThis.onmessage = (n) => {
    t.onmessage(n.data);
  }, t;
}
class Xe {
  /**
   * Constructs a new DiffChange with the given sequence information
   * and content.
   */
  constructor(t, n, r, i) {
    this.originalStart = t, this.originalLength = n, this.modifiedStart = r, this.modifiedLength = i;
  }
  /**
   * The end point (exclusive) of the change in the original sequence.
   */
  getOriginalEnd() {
    return this.originalStart + this.originalLength;
  }
  /**
   * The end point (exclusive) of the change in the modified sequence.
   */
  getModifiedEnd() {
    return this.modifiedStart + this.modifiedLength;
  }
}
new ur(() => new Uint8Array(256));
function ci(e, t) {
  return (t << 5) - t + e | 0;
}
function ql(e, t) {
  t = ci(149417, t);
  for (let n = 0, r = e.length; n < r; n++)
    t = ci(e.charCodeAt(n), t);
  return t;
}
class fi {
  constructor(t) {
    this.source = t;
  }
  getElements() {
    const t = this.source, n = new Int32Array(t.length);
    for (let r = 0, i = t.length; r < i; r++)
      n[r] = t.charCodeAt(r);
    return n;
  }
}
function jl(e, t, n) {
  return new Ye(new fi(e), new fi(t)).ComputeDiff(n).changes;
}
class dt {
  static Assert(t, n) {
    if (!t)
      throw new Error(n);
  }
}
class gt {
  /**
   * Copies a range of elements from an Array starting at the specified source index and pastes
   * them to another Array starting at the specified destination index. The length and the indexes
   * are specified as 64-bit integers.
   * sourceArray:
   *		The Array that contains the data to copy.
   * sourceIndex:
   *		A 64-bit integer that represents the index in the sourceArray at which copying begins.
   * destinationArray:
   *		The Array that receives the data.
   * destinationIndex:
   *		A 64-bit integer that represents the index in the destinationArray at which storing begins.
   * length:
   *		A 64-bit integer that represents the number of elements to copy.
   */
  static Copy(t, n, r, i, s) {
    for (let a = 0; a < s; a++)
      r[i + a] = t[n + a];
  }
  static Copy2(t, n, r, i, s) {
    for (let a = 0; a < s; a++)
      r[i + a] = t[n + a];
  }
}
class hi {
  /**
   * Constructs a new DiffChangeHelper for the given DiffSequences.
   */
  constructor() {
    this.m_changes = [], this.m_originalStart = 1073741824, this.m_modifiedStart = 1073741824, this.m_originalCount = 0, this.m_modifiedCount = 0;
  }
  /**
   * Marks the beginning of the next change in the set of differences.
   */
  MarkNextChange() {
    (this.m_originalCount > 0 || this.m_modifiedCount > 0) && this.m_changes.push(new Xe(this.m_originalStart, this.m_originalCount, this.m_modifiedStart, this.m_modifiedCount)), this.m_originalCount = 0, this.m_modifiedCount = 0, this.m_originalStart = 1073741824, this.m_modifiedStart = 1073741824;
  }
  /**
   * Adds the original element at the given position to the elements
   * affected by the current change. The modified index gives context
   * to the change position with respect to the original sequence.
   * @param originalIndex The index of the original element to add.
   * @param modifiedIndex The index of the modified element that provides corresponding position in the modified sequence.
   */
  AddOriginalElement(t, n) {
    this.m_originalStart = Math.min(this.m_originalStart, t), this.m_modifiedStart = Math.min(this.m_modifiedStart, n), this.m_originalCount++;
  }
  /**
   * Adds the modified element at the given position to the elements
   * affected by the current change. The original index gives context
   * to the change position with respect to the modified sequence.
   * @param originalIndex The index of the original element that provides corresponding position in the original sequence.
   * @param modifiedIndex The index of the modified element to add.
   */
  AddModifiedElement(t, n) {
    this.m_originalStart = Math.min(this.m_originalStart, t), this.m_modifiedStart = Math.min(this.m_modifiedStart, n), this.m_modifiedCount++;
  }
  /**
   * Retrieves all of the changes marked by the class.
   */
  getChanges() {
    return (this.m_originalCount > 0 || this.m_modifiedCount > 0) && this.MarkNextChange(), this.m_changes;
  }
  /**
   * Retrieves all of the changes marked by the class in the reverse order
   */
  getReverseChanges() {
    return (this.m_originalCount > 0 || this.m_modifiedCount > 0) && this.MarkNextChange(), this.m_changes.reverse(), this.m_changes;
  }
}
class Ye {
  /**
   * Constructs the DiffFinder
   */
  constructor(t, n, r = null) {
    this.ContinueProcessingPredicate = r, this._originalSequence = t, this._modifiedSequence = n;
    const [i, s, a] = Ye._getElements(t), [o, u, l] = Ye._getElements(n);
    this._hasStrings = a && l, this._originalStringElements = i, this._originalElementsOrHash = s, this._modifiedStringElements = o, this._modifiedElementsOrHash = u, this.m_forwardHistory = [], this.m_reverseHistory = [];
  }
  static _isStringArray(t) {
    return t.length > 0 && typeof t[0] == "string";
  }
  static _getElements(t) {
    const n = t.getElements();
    if (Ye._isStringArray(n)) {
      const r = new Int32Array(n.length);
      for (let i = 0, s = n.length; i < s; i++)
        r[i] = ql(n[i], 0);
      return [n, r, !0];
    }
    return n instanceof Int32Array ? [[], n, !1] : [[], new Int32Array(n), !1];
  }
  ElementsAreEqual(t, n) {
    return this._originalElementsOrHash[t] !== this._modifiedElementsOrHash[n] ? !1 : this._hasStrings ? this._originalStringElements[t] === this._modifiedStringElements[n] : !0;
  }
  ElementsAreStrictEqual(t, n) {
    if (!this.ElementsAreEqual(t, n))
      return !1;
    const r = Ye._getStrictElement(this._originalSequence, t), i = Ye._getStrictElement(this._modifiedSequence, n);
    return r === i;
  }
  static _getStrictElement(t, n) {
    return typeof t.getStrictElement == "function" ? t.getStrictElement(n) : null;
  }
  OriginalElementsAreEqual(t, n) {
    return this._originalElementsOrHash[t] !== this._originalElementsOrHash[n] ? !1 : this._hasStrings ? this._originalStringElements[t] === this._originalStringElements[n] : !0;
  }
  ModifiedElementsAreEqual(t, n) {
    return this._modifiedElementsOrHash[t] !== this._modifiedElementsOrHash[n] ? !1 : this._hasStrings ? this._modifiedStringElements[t] === this._modifiedStringElements[n] : !0;
  }
  ComputeDiff(t) {
    return this._ComputeDiff(0, this._originalElementsOrHash.length - 1, 0, this._modifiedElementsOrHash.length - 1, t);
  }
  /**
   * Computes the differences between the original and modified input
   * sequences on the bounded range.
   * @returns An array of the differences between the two input sequences.
   */
  _ComputeDiff(t, n, r, i, s) {
    const a = [!1];
    let o = this.ComputeDiffRecursive(t, n, r, i, a);
    return s && (o = this.PrettifyChanges(o)), {
      quitEarly: a[0],
      changes: o
    };
  }
  /**
   * Private helper method which computes the differences on the bounded range
   * recursively.
   * @returns An array of the differences between the two input sequences.
   */
  ComputeDiffRecursive(t, n, r, i, s) {
    for (s[0] = !1; t <= n && r <= i && this.ElementsAreEqual(t, r); )
      t++, r++;
    for (; n >= t && i >= r && this.ElementsAreEqual(n, i); )
      n--, i--;
    if (t > n || r > i) {
      let f;
      return r <= i ? (dt.Assert(t === n + 1, "originalStart should only be one more than originalEnd"), f = [
        new Xe(t, 0, r, i - r + 1)
      ]) : t <= n ? (dt.Assert(r === i + 1, "modifiedStart should only be one more than modifiedEnd"), f = [
        new Xe(t, n - t + 1, r, 0)
      ]) : (dt.Assert(t === n + 1, "originalStart should only be one more than originalEnd"), dt.Assert(r === i + 1, "modifiedStart should only be one more than modifiedEnd"), f = []), f;
    }
    const a = [0], o = [0], u = this.ComputeRecursionPoint(t, n, r, i, a, o, s), l = a[0], h = o[0];
    if (u !== null)
      return u;
    if (!s[0]) {
      const f = this.ComputeDiffRecursive(t, l, r, h, s);
      let d = [];
      return s[0] ? d = [
        new Xe(l + 1, n - (l + 1) + 1, h + 1, i - (h + 1) + 1)
      ] : d = this.ComputeDiffRecursive(l + 1, n, h + 1, i, s), this.ConcatenateChanges(f, d);
    }
    return [
      new Xe(t, n - t + 1, r, i - r + 1)
    ];
  }
  WALKTRACE(t, n, r, i, s, a, o, u, l, h, f, d, m, g, p, w, y, N) {
    let b = null, _ = null, L = new hi(), S = n, v = r, k = m[0] - w[0] - i, M = -1073741824, V = this.m_forwardHistory.length - 1;
    do {
      const T = k + t;
      T === S || T < v && l[T - 1] < l[T + 1] ? (f = l[T + 1], g = f - k - i, f < M && L.MarkNextChange(), M = f, L.AddModifiedElement(f + 1, g), k = T + 1 - t) : (f = l[T - 1] + 1, g = f - k - i, f < M && L.MarkNextChange(), M = f - 1, L.AddOriginalElement(f, g + 1), k = T - 1 - t), V >= 0 && (l = this.m_forwardHistory[V], t = l[0], S = 1, v = l.length - 1);
    } while (--V >= -1);
    if (b = L.getReverseChanges(), N[0]) {
      let T = m[0] + 1, x = w[0] + 1;
      if (b !== null && b.length > 0) {
        const A = b[b.length - 1];
        T = Math.max(T, A.getOriginalEnd()), x = Math.max(x, A.getModifiedEnd());
      }
      _ = [
        new Xe(T, d - T + 1, x, p - x + 1)
      ];
    } else {
      L = new hi(), S = a, v = o, k = m[0] - w[0] - u, M = 1073741824, V = y ? this.m_reverseHistory.length - 1 : this.m_reverseHistory.length - 2;
      do {
        const T = k + s;
        T === S || T < v && h[T - 1] >= h[T + 1] ? (f = h[T + 1] - 1, g = f - k - u, f > M && L.MarkNextChange(), M = f + 1, L.AddOriginalElement(f + 1, g + 1), k = T + 1 - s) : (f = h[T - 1], g = f - k - u, f > M && L.MarkNextChange(), M = f, L.AddModifiedElement(f + 1, g + 1), k = T - 1 - s), V >= 0 && (h = this.m_reverseHistory[V], s = h[0], S = 1, v = h.length - 1);
      } while (--V >= -1);
      _ = L.getChanges();
    }
    return this.ConcatenateChanges(b, _);
  }
  /**
   * Given the range to compute the diff on, this method finds the point:
   * (midOriginal, midModified)
   * that exists in the middle of the LCS of the two sequences and
   * is the point at which the LCS problem may be broken down recursively.
   * This method will try to keep the LCS trace in memory. If the LCS recursion
   * point is calculated and the full trace is available in memory, then this method
   * will return the change list.
   * @param originalStart The start bound of the original sequence range
   * @param originalEnd The end bound of the original sequence range
   * @param modifiedStart The start bound of the modified sequence range
   * @param modifiedEnd The end bound of the modified sequence range
   * @param midOriginal The middle point of the original sequence range
   * @param midModified The middle point of the modified sequence range
   * @returns The diff changes, if available, otherwise null
   */
  ComputeRecursionPoint(t, n, r, i, s, a, o) {
    let u = 0, l = 0, h = 0, f = 0, d = 0, m = 0;
    t--, r--, s[0] = 0, a[0] = 0, this.m_forwardHistory = [], this.m_reverseHistory = [];
    const g = n - t + (i - r), p = g + 1, w = new Int32Array(p), y = new Int32Array(p), N = i - r, b = n - t, _ = t - r, L = n - i, v = (b - N) % 2 === 0;
    w[N] = t, y[b] = n, o[0] = !1;
    for (let k = 1; k <= g / 2 + 1; k++) {
      let M = 0, V = 0;
      h = this.ClipDiagonalBound(N - k, k, N, p), f = this.ClipDiagonalBound(N + k, k, N, p);
      for (let x = h; x <= f; x += 2) {
        x === h || x < f && w[x - 1] < w[x + 1] ? u = w[x + 1] : u = w[x - 1] + 1, l = u - (x - N) - _;
        const A = u;
        for (; u < n && l < i && this.ElementsAreEqual(u + 1, l + 1); )
          u++, l++;
        if (w[x] = u, u + l > M + V && (M = u, V = l), !v && Math.abs(x - b) <= k - 1 && u >= y[x])
          return s[0] = u, a[0] = l, A <= y[x] && k <= 1448 ? this.WALKTRACE(N, h, f, _, b, d, m, L, w, y, u, n, s, l, i, a, v, o) : null;
      }
      const T = (M - t + (V - r) - k) / 2;
      if (this.ContinueProcessingPredicate !== null && !this.ContinueProcessingPredicate(M, T))
        return o[0] = !0, s[0] = M, a[0] = V, T > 0 && k <= 1448 ? this.WALKTRACE(N, h, f, _, b, d, m, L, w, y, u, n, s, l, i, a, v, o) : (t++, r++, [
          new Xe(t, n - t + 1, r, i - r + 1)
        ]);
      d = this.ClipDiagonalBound(b - k, k, b, p), m = this.ClipDiagonalBound(b + k, k, b, p);
      for (let x = d; x <= m; x += 2) {
        x === d || x < m && y[x - 1] >= y[x + 1] ? u = y[x + 1] - 1 : u = y[x - 1], l = u - (x - b) - L;
        const A = u;
        for (; u > t && l > r && this.ElementsAreEqual(u, l); )
          u--, l--;
        if (y[x] = u, v && Math.abs(x - N) <= k && u <= w[x])
          return s[0] = u, a[0] = l, A >= w[x] && k <= 1448 ? this.WALKTRACE(N, h, f, _, b, d, m, L, w, y, u, n, s, l, i, a, v, o) : null;
      }
      if (k <= 1447) {
        let x = new Int32Array(f - h + 2);
        x[0] = N - h + 1, gt.Copy2(w, h, x, 1, f - h + 1), this.m_forwardHistory.push(x), x = new Int32Array(m - d + 2), x[0] = b - d + 1, gt.Copy2(y, d, x, 1, m - d + 1), this.m_reverseHistory.push(x);
      }
    }
    return this.WALKTRACE(N, h, f, _, b, d, m, L, w, y, u, n, s, l, i, a, v, o);
  }
  /**
   * Shifts the given changes to provide a more intuitive diff.
   * While the first element in a diff matches the first element after the diff,
   * we shift the diff down.
   *
   * @param changes The list of changes to shift
   * @returns The shifted changes
   */
  PrettifyChanges(t) {
    for (let n = 0; n < t.length; n++) {
      const r = t[n], i = n < t.length - 1 ? t[n + 1].originalStart : this._originalElementsOrHash.length, s = n < t.length - 1 ? t[n + 1].modifiedStart : this._modifiedElementsOrHash.length, a = r.originalLength > 0, o = r.modifiedLength > 0;
      for (; r.originalStart + r.originalLength < i && r.modifiedStart + r.modifiedLength < s && (!a || this.OriginalElementsAreEqual(r.originalStart, r.originalStart + r.originalLength)) && (!o || this.ModifiedElementsAreEqual(r.modifiedStart, r.modifiedStart + r.modifiedLength)); ) {
        const l = this.ElementsAreStrictEqual(r.originalStart, r.modifiedStart);
        if (this.ElementsAreStrictEqual(r.originalStart + r.originalLength, r.modifiedStart + r.modifiedLength) && !l)
          break;
        r.originalStart++, r.modifiedStart++;
      }
      const u = [null];
      if (n < t.length - 1 && this.ChangesOverlap(t[n], t[n + 1], u)) {
        t[n] = u[0], t.splice(n + 1, 1), n--;
        continue;
      }
    }
    for (let n = t.length - 1; n >= 0; n--) {
      const r = t[n];
      let i = 0, s = 0;
      if (n > 0) {
        const f = t[n - 1];
        i = f.originalStart + f.originalLength, s = f.modifiedStart + f.modifiedLength;
      }
      const a = r.originalLength > 0, o = r.modifiedLength > 0;
      let u = 0, l = this._boundaryScore(r.originalStart, r.originalLength, r.modifiedStart, r.modifiedLength);
      for (let f = 1; ; f++) {
        const d = r.originalStart - f, m = r.modifiedStart - f;
        if (d < i || m < s || a && !this.OriginalElementsAreEqual(d, d + r.originalLength) || o && !this.ModifiedElementsAreEqual(m, m + r.modifiedLength))
          break;
        const p = (d === i && m === s ? 5 : 0) + this._boundaryScore(d, r.originalLength, m, r.modifiedLength);
        p > l && (l = p, u = f);
      }
      r.originalStart -= u, r.modifiedStart -= u;
      const h = [null];
      if (n > 0 && this.ChangesOverlap(t[n - 1], t[n], h)) {
        t[n - 1] = h[0], t.splice(n, 1), n++;
        continue;
      }
    }
    if (this._hasStrings)
      for (let n = 1, r = t.length; n < r; n++) {
        const i = t[n - 1], s = t[n], a = s.originalStart - i.originalStart - i.originalLength, o = i.originalStart, u = s.originalStart + s.originalLength, l = u - o, h = i.modifiedStart, f = s.modifiedStart + s.modifiedLength, d = f - h;
        if (a < 5 && l < 20 && d < 20) {
          const m = this._findBetterContiguousSequence(o, l, h, d, a);
          if (m) {
            const [g, p] = m;
            (g !== i.originalStart + i.originalLength || p !== i.modifiedStart + i.modifiedLength) && (i.originalLength = g - i.originalStart, i.modifiedLength = p - i.modifiedStart, s.originalStart = g + a, s.modifiedStart = p + a, s.originalLength = u - s.originalStart, s.modifiedLength = f - s.modifiedStart);
          }
        }
      }
    return t;
  }
  _findBetterContiguousSequence(t, n, r, i, s) {
    if (n < s || i < s)
      return null;
    const a = t + n - s + 1, o = r + i - s + 1;
    let u = 0, l = 0, h = 0;
    for (let f = t; f < a; f++)
      for (let d = r; d < o; d++) {
        const m = this._contiguousSequenceScore(f, d, s);
        m > 0 && m > u && (u = m, l = f, h = d);
      }
    return u > 0 ? [l, h] : null;
  }
  _contiguousSequenceScore(t, n, r) {
    let i = 0;
    for (let s = 0; s < r; s++) {
      if (!this.ElementsAreEqual(t + s, n + s))
        return 0;
      i += this._originalStringElements[t + s].length;
    }
    return i;
  }
  _OriginalIsBoundary(t) {
    return t <= 0 || t >= this._originalElementsOrHash.length - 1 ? !0 : this._hasStrings && /^\s*$/.test(this._originalStringElements[t]);
  }
  _OriginalRegionIsBoundary(t, n) {
    if (this._OriginalIsBoundary(t) || this._OriginalIsBoundary(t - 1))
      return !0;
    if (n > 0) {
      const r = t + n;
      if (this._OriginalIsBoundary(r - 1) || this._OriginalIsBoundary(r))
        return !0;
    }
    return !1;
  }
  _ModifiedIsBoundary(t) {
    return t <= 0 || t >= this._modifiedElementsOrHash.length - 1 ? !0 : this._hasStrings && /^\s*$/.test(this._modifiedStringElements[t]);
  }
  _ModifiedRegionIsBoundary(t, n) {
    if (this._ModifiedIsBoundary(t) || this._ModifiedIsBoundary(t - 1))
      return !0;
    if (n > 0) {
      const r = t + n;
      if (this._ModifiedIsBoundary(r - 1) || this._ModifiedIsBoundary(r))
        return !0;
    }
    return !1;
  }
  _boundaryScore(t, n, r, i) {
    const s = this._OriginalRegionIsBoundary(t, n) ? 1 : 0, a = this._ModifiedRegionIsBoundary(r, i) ? 1 : 0;
    return s + a;
  }
  /**
   * Concatenates the two input DiffChange lists and returns the resulting
   * list.
   * @param The left changes
   * @param The right changes
   * @returns The concatenated list
   */
  ConcatenateChanges(t, n) {
    const r = [];
    if (t.length === 0 || n.length === 0)
      return n.length > 0 ? n : t;
    if (this.ChangesOverlap(t[t.length - 1], n[0], r)) {
      const i = new Array(t.length + n.length - 1);
      return gt.Copy(t, 0, i, 0, t.length - 1), i[t.length - 1] = r[0], gt.Copy(n, 1, i, t.length, n.length - 1), i;
    } else {
      const i = new Array(t.length + n.length);
      return gt.Copy(t, 0, i, 0, t.length), gt.Copy(n, 0, i, t.length, n.length), i;
    }
  }
  /**
   * Returns true if the two changes overlap and can be merged into a single
   * change
   * @param left The left change
   * @param right The right change
   * @param mergedChange The merged change if the two overlap, null otherwise
   * @returns True if the two changes overlap
   */
  ChangesOverlap(t, n, r) {
    if (dt.Assert(t.originalStart <= n.originalStart, "Left change is not less than or equal to right change"), dt.Assert(t.modifiedStart <= n.modifiedStart, "Left change is not less than or equal to right change"), t.originalStart + t.originalLength >= n.originalStart || t.modifiedStart + t.modifiedLength >= n.modifiedStart) {
      const i = t.originalStart;
      let s = t.originalLength;
      const a = t.modifiedStart;
      let o = t.modifiedLength;
      return t.originalStart + t.originalLength >= n.originalStart && (s = n.originalStart + n.originalLength - t.originalStart), t.modifiedStart + t.modifiedLength >= n.modifiedStart && (o = n.modifiedStart + n.modifiedLength - t.modifiedStart), r[0] = new Xe(i, s, a, o), !0;
    } else
      return r[0] = null, !1;
  }
  /**
   * Helper method used to clip a diagonal index to the range of valid
   * diagonals. This also decides whether or not the diagonal index,
   * if it exceeds the boundary, should be clipped to the boundary or clipped
   * one inside the boundary depending on the Even/Odd status of the boundary
   * and numDifferences.
   * @param diagonal The index of the diagonal to clip.
   * @param numDifferences The current number of differences being iterated upon.
   * @param diagonalBaseIndex The base reference diagonal.
   * @param numDiagonals The total number of diagonals.
   * @returns The clipped diagonal index.
   */
  ClipDiagonalBound(t, n, r, i) {
    if (t >= 0 && t < i)
      return t;
    const s = r, a = i - r - 1, o = n % 2 === 0;
    if (t < 0) {
      const u = s % 2 === 0;
      return o === u ? 0 : 1;
    } else {
      const u = a % 2 === 0;
      return o === u ? i - 1 : i - 2;
    }
  }
}
let Q = class nt {
  constructor(t, n) {
    this.lineNumber = t, this.column = n;
  }
  /**
   * Create a new position from this position.
   *
   * @param newLineNumber new line number
   * @param newColumn new column
   */
  with(t = this.lineNumber, n = this.column) {
    return t === this.lineNumber && n === this.column ? this : new nt(t, n);
  }
  /**
   * Derive a new position from this position.
   *
   * @param deltaLineNumber line number delta
   * @param deltaColumn column delta
   */
  delta(t = 0, n = 0) {
    return this.with(Math.max(1, this.lineNumber + t), Math.max(1, this.column + n));
  }
  /**
   * Test if this position equals other position
   */
  equals(t) {
    return nt.equals(this, t);
  }
  /**
   * Test if position `a` equals position `b`
   */
  static equals(t, n) {
    return !t && !n ? !0 : !!t && !!n && t.lineNumber === n.lineNumber && t.column === n.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be false.
   */
  isBefore(t) {
    return nt.isBefore(this, t);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be false.
   */
  static isBefore(t, n) {
    return t.lineNumber < n.lineNumber ? !0 : n.lineNumber < t.lineNumber ? !1 : t.column < n.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be true.
   */
  isBeforeOrEqual(t) {
    return nt.isBeforeOrEqual(this, t);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be true.
   */
  static isBeforeOrEqual(t, n) {
    return t.lineNumber < n.lineNumber ? !0 : n.lineNumber < t.lineNumber ? !1 : t.column <= n.column;
  }
  /**
   * A function that compares positions, useful for sorting
   */
  static compare(t, n) {
    const r = t.lineNumber | 0, i = n.lineNumber | 0;
    if (r === i) {
      const s = t.column | 0, a = n.column | 0;
      return s - a;
    }
    return r - i;
  }
  /**
   * Clone this position.
   */
  clone() {
    return new nt(this.lineNumber, this.column);
  }
  /**
   * Convert to a human-readable representation.
   */
  toString() {
    return "(" + this.lineNumber + "," + this.column + ")";
  }
  // ---
  /**
   * Create a `Position` from an `IPosition`.
   */
  static lift(t) {
    return new nt(t.lineNumber, t.column);
  }
  /**
   * Test if `obj` is an `IPosition`.
   */
  static isIPosition(t) {
    return !!t && typeof t.lineNumber == "number" && typeof t.column == "number";
  }
  toJSON() {
    return {
      lineNumber: this.lineNumber,
      column: this.column
    };
  }
}, q = class re {
  constructor(t, n, r, i) {
    t > r || t === r && n > i ? (this.startLineNumber = r, this.startColumn = i, this.endLineNumber = t, this.endColumn = n) : (this.startLineNumber = t, this.startColumn = n, this.endLineNumber = r, this.endColumn = i);
  }
  /**
   * Test if this range is empty.
   */
  isEmpty() {
    return re.isEmpty(this);
  }
  /**
   * Test if `range` is empty.
   */
  static isEmpty(t) {
    return t.startLineNumber === t.endLineNumber && t.startColumn === t.endColumn;
  }
  /**
   * Test if position is in this range. If the position is at the edges, will return true.
   */
  containsPosition(t) {
    return re.containsPosition(this, t);
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return true.
   */
  static containsPosition(t, n) {
    return !(n.lineNumber < t.startLineNumber || n.lineNumber > t.endLineNumber || n.lineNumber === t.startLineNumber && n.column < t.startColumn || n.lineNumber === t.endLineNumber && n.column > t.endColumn);
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return false.
   * @internal
   */
  static strictContainsPosition(t, n) {
    return !(n.lineNumber < t.startLineNumber || n.lineNumber > t.endLineNumber || n.lineNumber === t.startLineNumber && n.column <= t.startColumn || n.lineNumber === t.endLineNumber && n.column >= t.endColumn);
  }
  /**
   * Test if range is in this range. If the range is equal to this range, will return true.
   */
  containsRange(t) {
    return re.containsRange(this, t);
  }
  /**
   * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
   */
  static containsRange(t, n) {
    return !(n.startLineNumber < t.startLineNumber || n.endLineNumber < t.startLineNumber || n.startLineNumber > t.endLineNumber || n.endLineNumber > t.endLineNumber || n.startLineNumber === t.startLineNumber && n.startColumn < t.startColumn || n.endLineNumber === t.endLineNumber && n.endColumn > t.endColumn);
  }
  /**
   * Test if `range` is strictly in this range. `range` must start after and end before this range for the result to be true.
   */
  strictContainsRange(t) {
    return re.strictContainsRange(this, t);
  }
  /**
   * Test if `otherRange` is strictly in `range` (must start after, and end before). If the ranges are equal, will return false.
   */
  static strictContainsRange(t, n) {
    return !(n.startLineNumber < t.startLineNumber || n.endLineNumber < t.startLineNumber || n.startLineNumber > t.endLineNumber || n.endLineNumber > t.endLineNumber || n.startLineNumber === t.startLineNumber && n.startColumn <= t.startColumn || n.endLineNumber === t.endLineNumber && n.endColumn >= t.endColumn);
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  plusRange(t) {
    return re.plusRange(this, t);
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  static plusRange(t, n) {
    let r, i, s, a;
    return n.startLineNumber < t.startLineNumber ? (r = n.startLineNumber, i = n.startColumn) : n.startLineNumber === t.startLineNumber ? (r = n.startLineNumber, i = Math.min(n.startColumn, t.startColumn)) : (r = t.startLineNumber, i = t.startColumn), n.endLineNumber > t.endLineNumber ? (s = n.endLineNumber, a = n.endColumn) : n.endLineNumber === t.endLineNumber ? (s = n.endLineNumber, a = Math.max(n.endColumn, t.endColumn)) : (s = t.endLineNumber, a = t.endColumn), new re(r, i, s, a);
  }
  /**
   * A intersection of the two ranges.
   */
  intersectRanges(t) {
    return re.intersectRanges(this, t);
  }
  /**
   * A intersection of the two ranges.
   */
  static intersectRanges(t, n) {
    let r = t.startLineNumber, i = t.startColumn, s = t.endLineNumber, a = t.endColumn;
    const o = n.startLineNumber, u = n.startColumn, l = n.endLineNumber, h = n.endColumn;
    return r < o ? (r = o, i = u) : r === o && (i = Math.max(i, u)), s > l ? (s = l, a = h) : s === l && (a = Math.min(a, h)), r > s || r === s && i > a ? null : new re(r, i, s, a);
  }
  /**
   * Test if this range equals other.
   */
  equalsRange(t) {
    return re.equalsRange(this, t);
  }
  /**
   * Test if range `a` equals `b`.
   */
  static equalsRange(t, n) {
    return !t && !n ? !0 : !!t && !!n && t.startLineNumber === n.startLineNumber && t.startColumn === n.startColumn && t.endLineNumber === n.endLineNumber && t.endColumn === n.endColumn;
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  getEndPosition() {
    return re.getEndPosition(this);
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  static getEndPosition(t) {
    return new Q(t.endLineNumber, t.endColumn);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  getStartPosition() {
    return re.getStartPosition(this);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  static getStartPosition(t) {
    return new Q(t.startLineNumber, t.startColumn);
  }
  /**
   * Transform to a user presentable string representation.
   */
  toString() {
    return "[" + this.startLineNumber + "," + this.startColumn + " -> " + this.endLineNumber + "," + this.endColumn + "]";
  }
  /**
   * Create a new range using this range's start position, and using endLineNumber and endColumn as the end position.
   */
  setEndPosition(t, n) {
    return new re(this.startLineNumber, this.startColumn, t, n);
  }
  /**
   * Create a new range using this range's end position, and using startLineNumber and startColumn as the start position.
   */
  setStartPosition(t, n) {
    return new re(t, n, this.endLineNumber, this.endColumn);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  collapseToStart() {
    return re.collapseToStart(this);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  static collapseToStart(t) {
    return new re(t.startLineNumber, t.startColumn, t.startLineNumber, t.startColumn);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  collapseToEnd() {
    return re.collapseToEnd(this);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  static collapseToEnd(t) {
    return new re(t.endLineNumber, t.endColumn, t.endLineNumber, t.endColumn);
  }
  /**
   * Moves the range by the given amount of lines.
   */
  delta(t) {
    return new re(this.startLineNumber + t, this.startColumn, this.endLineNumber + t, this.endColumn);
  }
  isSingleLine() {
    return this.startLineNumber === this.endLineNumber;
  }
  // ---
  static fromPositions(t, n = t) {
    return new re(t.lineNumber, t.column, n.lineNumber, n.column);
  }
  static lift(t) {
    return t ? new re(t.startLineNumber, t.startColumn, t.endLineNumber, t.endColumn) : null;
  }
  /**
   * Test if `obj` is an `IRange`.
   */
  static isIRange(t) {
    return !!t && typeof t.startLineNumber == "number" && typeof t.startColumn == "number" && typeof t.endLineNumber == "number" && typeof t.endColumn == "number";
  }
  /**
   * Test if the two ranges are touching in any way.
   */
  static areIntersectingOrTouching(t, n) {
    return !(t.endLineNumber < n.startLineNumber || t.endLineNumber === n.startLineNumber && t.endColumn < n.startColumn || n.endLineNumber < t.startLineNumber || n.endLineNumber === t.startLineNumber && n.endColumn < t.startColumn);
  }
  /**
   * Test if the two ranges are intersecting. If the ranges are touching it returns true.
   */
  static areIntersecting(t, n) {
    return !(t.endLineNumber < n.startLineNumber || t.endLineNumber === n.startLineNumber && t.endColumn <= n.startColumn || n.endLineNumber < t.startLineNumber || n.endLineNumber === t.startLineNumber && n.endColumn <= t.startColumn);
  }
  /**
   * Test if the two ranges are intersecting, but not touching at all.
   */
  static areOnlyIntersecting(t, n) {
    return !(t.endLineNumber < n.startLineNumber - 1 || t.endLineNumber === n.startLineNumber && t.endColumn < n.startColumn - 1 || n.endLineNumber < t.startLineNumber - 1 || n.endLineNumber === t.startLineNumber && n.endColumn < t.startColumn - 1);
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the startPosition and then on the endPosition
   */
  static compareRangesUsingStarts(t, n) {
    if (t && n) {
      const s = t.startLineNumber | 0, a = n.startLineNumber | 0;
      if (s === a) {
        const o = t.startColumn | 0, u = n.startColumn | 0;
        if (o === u) {
          const l = t.endLineNumber | 0, h = n.endLineNumber | 0;
          if (l === h) {
            const f = t.endColumn | 0, d = n.endColumn | 0;
            return f - d;
          }
          return l - h;
        }
        return o - u;
      }
      return s - a;
    }
    return (t ? 1 : 0) - (n ? 1 : 0);
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the endPosition and then on the startPosition
   */
  static compareRangesUsingEnds(t, n) {
    return t.endLineNumber === n.endLineNumber ? t.endColumn === n.endColumn ? t.startLineNumber === n.startLineNumber ? t.startColumn - n.startColumn : t.startLineNumber - n.startLineNumber : t.endColumn - n.endColumn : t.endLineNumber - n.endLineNumber;
  }
  /**
   * Test if the range spans multiple lines.
   */
  static spansMultipleLines(t) {
    return t.endLineNumber > t.startLineNumber;
  }
  toJSON() {
    return this;
  }
};
function di(e) {
  return e < 0 ? 0 : e > 255 ? 255 : e | 0;
}
function mt(e) {
  return e < 0 ? 0 : e > 4294967295 ? 4294967295 : e | 0;
}
class Zr {
  constructor(t) {
    const n = di(t);
    this._defaultValue = n, this._asciiMap = Zr._createAsciiMap(n), this._map = /* @__PURE__ */ new Map();
  }
  static _createAsciiMap(t) {
    const n = new Uint8Array(256);
    return n.fill(t), n;
  }
  set(t, n) {
    const r = di(n);
    t >= 0 && t < 256 ? this._asciiMap[t] = r : this._map.set(t, r);
  }
  get(t) {
    return t >= 0 && t < 256 ? this._asciiMap[t] : this._map.get(t) || this._defaultValue;
  }
  clear() {
    this._asciiMap.fill(this._defaultValue), this._map.clear();
  }
}
class Wl {
  constructor(t, n, r) {
    const i = new Uint8Array(t * n);
    for (let s = 0, a = t * n; s < a; s++)
      i[s] = r;
    this._data = i, this.rows = t, this.cols = n;
  }
  get(t, n) {
    return this._data[t * this.cols + n];
  }
  set(t, n, r) {
    this._data[t * this.cols + n] = r;
  }
}
class Hl {
  constructor(t) {
    let n = 0, r = 0;
    for (let s = 0, a = t.length; s < a; s++) {
      const [o, u, l] = t[s];
      u > n && (n = u), o > r && (r = o), l > r && (r = l);
    }
    n++, r++;
    const i = new Wl(
      r,
      n,
      0
      /* State.Invalid */
    );
    for (let s = 0, a = t.length; s < a; s++) {
      const [o, u, l] = t[s];
      i.set(o, u, l);
    }
    this._states = i, this._maxCharCode = n;
  }
  nextState(t, n) {
    return n < 0 || n >= this._maxCharCode ? 0 : this._states.get(t, n);
  }
}
let Xn = null;
function zl() {
  return Xn === null && (Xn = new Hl([
    [
      1,
      104,
      2
      /* State.H */
    ],
    [
      1,
      72,
      2
      /* State.H */
    ],
    [
      1,
      102,
      6
      /* State.F */
    ],
    [
      1,
      70,
      6
      /* State.F */
    ],
    [
      2,
      116,
      3
      /* State.HT */
    ],
    [
      2,
      84,
      3
      /* State.HT */
    ],
    [
      3,
      116,
      4
      /* State.HTT */
    ],
    [
      3,
      84,
      4
      /* State.HTT */
    ],
    [
      4,
      112,
      5
      /* State.HTTP */
    ],
    [
      4,
      80,
      5
      /* State.HTTP */
    ],
    [
      5,
      115,
      9
      /* State.BeforeColon */
    ],
    [
      5,
      83,
      9
      /* State.BeforeColon */
    ],
    [
      5,
      58,
      10
      /* State.AfterColon */
    ],
    [
      6,
      105,
      7
      /* State.FI */
    ],
    [
      6,
      73,
      7
      /* State.FI */
    ],
    [
      7,
      108,
      8
      /* State.FIL */
    ],
    [
      7,
      76,
      8
      /* State.FIL */
    ],
    [
      8,
      101,
      9
      /* State.BeforeColon */
    ],
    [
      8,
      69,
      9
      /* State.BeforeColon */
    ],
    [
      9,
      58,
      10
      /* State.AfterColon */
    ],
    [
      10,
      47,
      11
      /* State.AlmostThere */
    ],
    [
      11,
      47,
      12
      /* State.End */
    ]
  ])), Xn;
}
let Bt = null;
function Gl() {
  if (Bt === null) {
    Bt = new Zr(
      0
      /* CharacterClass.None */
    );
    const e = ` 	<>'"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…|`;
    for (let n = 0; n < e.length; n++)
      Bt.set(
        e.charCodeAt(n),
        1
        /* CharacterClass.ForceTermination */
      );
    const t = ".,;:";
    for (let n = 0; n < t.length; n++)
      Bt.set(
        t.charCodeAt(n),
        2
        /* CharacterClass.CannotEndIn */
      );
  }
  return Bt;
}
class Sn {
  static _createLink(t, n, r, i, s) {
    let a = s - 1;
    do {
      const o = n.charCodeAt(a);
      if (t.get(o) !== 2)
        break;
      a--;
    } while (a > i);
    if (i > 0) {
      const o = n.charCodeAt(i - 1), u = n.charCodeAt(a);
      (o === 40 && u === 41 || o === 91 && u === 93 || o === 123 && u === 125) && a--;
    }
    return {
      range: {
        startLineNumber: r,
        startColumn: i + 1,
        endLineNumber: r,
        endColumn: a + 2
      },
      url: n.substring(i, a + 1)
    };
  }
  static computeLinks(t, n = zl()) {
    const r = Gl(), i = [];
    for (let s = 1, a = t.getLineCount(); s <= a; s++) {
      const o = t.getLineContent(s), u = o.length;
      let l = 0, h = 0, f = 0, d = 1, m = !1, g = !1, p = !1, w = !1;
      for (; l < u; ) {
        let y = !1;
        const N = o.charCodeAt(l);
        if (d === 13) {
          let b;
          switch (N) {
            case 40:
              m = !0, b = 0;
              break;
            case 41:
              b = m ? 0 : 1;
              break;
            case 91:
              p = !0, g = !0, b = 0;
              break;
            case 93:
              p = !1, b = g ? 0 : 1;
              break;
            case 123:
              w = !0, b = 0;
              break;
            case 125:
              b = w ? 0 : 1;
              break;
            case 39:
            case 34:
            case 96:
              f === N ? b = 1 : f === 39 || f === 34 || f === 96 ? b = 0 : b = 1;
              break;
            case 42:
              b = f === 42 ? 1 : 0;
              break;
            case 32:
              b = p ? 0 : 1;
              break;
            default:
              b = r.get(N);
          }
          b === 1 && (i.push(Sn._createLink(r, o, s, h, l)), y = !0);
        } else if (d === 12) {
          let b;
          N === 91 ? (g = !0, b = 0) : b = r.get(N), b === 1 ? y = !0 : d = 13;
        } else
          d = n.nextState(d, N), d === 0 && (y = !0);
        y && (d = 1, m = !1, g = !1, w = !1, h = l + 1, f = N), l++;
      }
      d === 13 && i.push(Sn._createLink(r, o, s, h, u));
    }
    return i;
  }
}
function Jl(e) {
  return !e || typeof e.getLineCount != "function" || typeof e.getLineContent != "function" ? [] : Sn.computeLinks(e);
}
const Un = class Un {
  constructor() {
    this._defaultValueSet = [
      ["true", "false"],
      ["True", "False"],
      ["Private", "Public", "Friend", "ReadOnly", "Partial", "Protected", "WriteOnly"],
      ["public", "protected", "private"]
    ];
  }
  navigateValueSet(t, n, r, i, s) {
    if (t && n) {
      const a = this.doNavigateValueSet(n, s);
      if (a)
        return {
          range: t,
          value: a
        };
    }
    if (r && i) {
      const a = this.doNavigateValueSet(i, s);
      if (a)
        return {
          range: r,
          value: a
        };
    }
    return null;
  }
  doNavigateValueSet(t, n) {
    const r = this.numberReplace(t, n);
    return r !== null ? r : this.textReplace(t, n);
  }
  numberReplace(t, n) {
    const r = Math.pow(10, t.length - (t.lastIndexOf(".") + 1));
    let i = Number(t);
    const s = parseFloat(t);
    return !isNaN(i) && !isNaN(s) && i === s ? i === 0 && !n ? null : (i = Math.floor(i * r), i += n ? r : -r, String(i / r)) : null;
  }
  textReplace(t, n) {
    return this.valueSetsReplace(this._defaultValueSet, t, n);
  }
  valueSetsReplace(t, n, r) {
    let i = null;
    for (let s = 0, a = t.length; i === null && s < a; s++)
      i = this.valueSetReplace(t[s], n, r);
    return i;
  }
  valueSetReplace(t, n, r) {
    let i = t.indexOf(n);
    return i >= 0 ? (i += r ? 1 : -1, i < 0 ? i = t.length - 1 : i %= t.length, t[i]) : null;
  }
};
Un.INSTANCE = new Un();
let fr = Un;
const wo = Object.freeze(function(e, t) {
  const n = setTimeout(e.bind(t), 0);
  return { dispose() {
    clearTimeout(n);
  } };
});
var An;
(function(e) {
  function t(n) {
    return n === e.None || n === e.Cancelled || n instanceof wn ? !0 : !n || typeof n != "object" ? !1 : typeof n.isCancellationRequested == "boolean" && typeof n.onCancellationRequested == "function";
  }
  e.isCancellationToken = t, e.None = Object.freeze({
    isCancellationRequested: !1,
    onCancellationRequested: ir.None
  }), e.Cancelled = Object.freeze({
    isCancellationRequested: !0,
    onCancellationRequested: wo
  });
})(An || (An = {}));
class wn {
  constructor() {
    this._isCancelled = !1, this._emitter = null;
  }
  cancel() {
    this._isCancelled || (this._isCancelled = !0, this._emitter && (this._emitter.fire(void 0), this.dispose()));
  }
  get isCancellationRequested() {
    return this._isCancelled;
  }
  get onCancellationRequested() {
    return this._isCancelled ? wo : (this._emitter || (this._emitter = new Fe()), this._emitter.event);
  }
  dispose() {
    this._emitter && (this._emitter.dispose(), this._emitter = null);
  }
}
class Xl {
  constructor(t) {
    this._token = void 0, this._parentListener = void 0, this._parentListener = t && t.onCancellationRequested(this.cancel, this);
  }
  get token() {
    return this._token || (this._token = new wn()), this._token;
  }
  cancel() {
    this._token ? this._token instanceof wn && this._token.cancel() : this._token = An.Cancelled;
  }
  dispose(t = !1) {
    var n;
    t && this.cancel(), (n = this._parentListener) == null || n.dispose(), this._token ? this._token instanceof wn && this._token.dispose() : this._token = An.None;
  }
}
class Yr {
  constructor() {
    this._keyCodeToStr = [], this._strToKeyCode = /* @__PURE__ */ Object.create(null);
  }
  define(t, n) {
    this._keyCodeToStr[t] = n, this._strToKeyCode[n.toLowerCase()] = t;
  }
  keyCodeToStr(t) {
    return this._keyCodeToStr[t];
  }
  strToKeyCode(t) {
    return this._strToKeyCode[t.toLowerCase()] || 0;
  }
}
const xn = new Yr(), hr = new Yr(), dr = new Yr(), Ql = new Array(230), Zl = /* @__PURE__ */ Object.create(null), Yl = /* @__PURE__ */ Object.create(null);
(function() {
  const e = "", t = [
    // immutable, scanCode, scanCodeStr, keyCode, keyCodeStr, eventKeyCode, vkey, usUserSettingsLabel, generalUserSettingsLabel
    [1, 0, "None", 0, "unknown", 0, "VK_UNKNOWN", e, e],
    [1, 1, "Hyper", 0, e, 0, e, e, e],
    [1, 2, "Super", 0, e, 0, e, e, e],
    [1, 3, "Fn", 0, e, 0, e, e, e],
    [1, 4, "FnLock", 0, e, 0, e, e, e],
    [1, 5, "Suspend", 0, e, 0, e, e, e],
    [1, 6, "Resume", 0, e, 0, e, e, e],
    [1, 7, "Turbo", 0, e, 0, e, e, e],
    [1, 8, "Sleep", 0, e, 0, "VK_SLEEP", e, e],
    [1, 9, "WakeUp", 0, e, 0, e, e, e],
    [0, 10, "KeyA", 31, "A", 65, "VK_A", e, e],
    [0, 11, "KeyB", 32, "B", 66, "VK_B", e, e],
    [0, 12, "KeyC", 33, "C", 67, "VK_C", e, e],
    [0, 13, "KeyD", 34, "D", 68, "VK_D", e, e],
    [0, 14, "KeyE", 35, "E", 69, "VK_E", e, e],
    [0, 15, "KeyF", 36, "F", 70, "VK_F", e, e],
    [0, 16, "KeyG", 37, "G", 71, "VK_G", e, e],
    [0, 17, "KeyH", 38, "H", 72, "VK_H", e, e],
    [0, 18, "KeyI", 39, "I", 73, "VK_I", e, e],
    [0, 19, "KeyJ", 40, "J", 74, "VK_J", e, e],
    [0, 20, "KeyK", 41, "K", 75, "VK_K", e, e],
    [0, 21, "KeyL", 42, "L", 76, "VK_L", e, e],
    [0, 22, "KeyM", 43, "M", 77, "VK_M", e, e],
    [0, 23, "KeyN", 44, "N", 78, "VK_N", e, e],
    [0, 24, "KeyO", 45, "O", 79, "VK_O", e, e],
    [0, 25, "KeyP", 46, "P", 80, "VK_P", e, e],
    [0, 26, "KeyQ", 47, "Q", 81, "VK_Q", e, e],
    [0, 27, "KeyR", 48, "R", 82, "VK_R", e, e],
    [0, 28, "KeyS", 49, "S", 83, "VK_S", e, e],
    [0, 29, "KeyT", 50, "T", 84, "VK_T", e, e],
    [0, 30, "KeyU", 51, "U", 85, "VK_U", e, e],
    [0, 31, "KeyV", 52, "V", 86, "VK_V", e, e],
    [0, 32, "KeyW", 53, "W", 87, "VK_W", e, e],
    [0, 33, "KeyX", 54, "X", 88, "VK_X", e, e],
    [0, 34, "KeyY", 55, "Y", 89, "VK_Y", e, e],
    [0, 35, "KeyZ", 56, "Z", 90, "VK_Z", e, e],
    [0, 36, "Digit1", 22, "1", 49, "VK_1", e, e],
    [0, 37, "Digit2", 23, "2", 50, "VK_2", e, e],
    [0, 38, "Digit3", 24, "3", 51, "VK_3", e, e],
    [0, 39, "Digit4", 25, "4", 52, "VK_4", e, e],
    [0, 40, "Digit5", 26, "5", 53, "VK_5", e, e],
    [0, 41, "Digit6", 27, "6", 54, "VK_6", e, e],
    [0, 42, "Digit7", 28, "7", 55, "VK_7", e, e],
    [0, 43, "Digit8", 29, "8", 56, "VK_8", e, e],
    [0, 44, "Digit9", 30, "9", 57, "VK_9", e, e],
    [0, 45, "Digit0", 21, "0", 48, "VK_0", e, e],
    [1, 46, "Enter", 3, "Enter", 13, "VK_RETURN", e, e],
    [1, 47, "Escape", 9, "Escape", 27, "VK_ESCAPE", e, e],
    [1, 48, "Backspace", 1, "Backspace", 8, "VK_BACK", e, e],
    [1, 49, "Tab", 2, "Tab", 9, "VK_TAB", e, e],
    [1, 50, "Space", 10, "Space", 32, "VK_SPACE", e, e],
    [0, 51, "Minus", 88, "-", 189, "VK_OEM_MINUS", "-", "OEM_MINUS"],
    [0, 52, "Equal", 86, "=", 187, "VK_OEM_PLUS", "=", "OEM_PLUS"],
    [0, 53, "BracketLeft", 92, "[", 219, "VK_OEM_4", "[", "OEM_4"],
    [0, 54, "BracketRight", 94, "]", 221, "VK_OEM_6", "]", "OEM_6"],
    [0, 55, "Backslash", 93, "\\", 220, "VK_OEM_5", "\\", "OEM_5"],
    [0, 56, "IntlHash", 0, e, 0, e, e, e],
    // has been dropped from the w3c spec
    [0, 57, "Semicolon", 85, ";", 186, "VK_OEM_1", ";", "OEM_1"],
    [0, 58, "Quote", 95, "'", 222, "VK_OEM_7", "'", "OEM_7"],
    [0, 59, "Backquote", 91, "`", 192, "VK_OEM_3", "`", "OEM_3"],
    [0, 60, "Comma", 87, ",", 188, "VK_OEM_COMMA", ",", "OEM_COMMA"],
    [0, 61, "Period", 89, ".", 190, "VK_OEM_PERIOD", ".", "OEM_PERIOD"],
    [0, 62, "Slash", 90, "/", 191, "VK_OEM_2", "/", "OEM_2"],
    [1, 63, "CapsLock", 8, "CapsLock", 20, "VK_CAPITAL", e, e],
    [1, 64, "F1", 59, "F1", 112, "VK_F1", e, e],
    [1, 65, "F2", 60, "F2", 113, "VK_F2", e, e],
    [1, 66, "F3", 61, "F3", 114, "VK_F3", e, e],
    [1, 67, "F4", 62, "F4", 115, "VK_F4", e, e],
    [1, 68, "F5", 63, "F5", 116, "VK_F5", e, e],
    [1, 69, "F6", 64, "F6", 117, "VK_F6", e, e],
    [1, 70, "F7", 65, "F7", 118, "VK_F7", e, e],
    [1, 71, "F8", 66, "F8", 119, "VK_F8", e, e],
    [1, 72, "F9", 67, "F9", 120, "VK_F9", e, e],
    [1, 73, "F10", 68, "F10", 121, "VK_F10", e, e],
    [1, 74, "F11", 69, "F11", 122, "VK_F11", e, e],
    [1, 75, "F12", 70, "F12", 123, "VK_F12", e, e],
    [1, 76, "PrintScreen", 0, e, 0, e, e, e],
    [1, 77, "ScrollLock", 84, "ScrollLock", 145, "VK_SCROLL", e, e],
    [1, 78, "Pause", 7, "PauseBreak", 19, "VK_PAUSE", e, e],
    [1, 79, "Insert", 19, "Insert", 45, "VK_INSERT", e, e],
    [1, 80, "Home", 14, "Home", 36, "VK_HOME", e, e],
    [1, 81, "PageUp", 11, "PageUp", 33, "VK_PRIOR", e, e],
    [1, 82, "Delete", 20, "Delete", 46, "VK_DELETE", e, e],
    [1, 83, "End", 13, "End", 35, "VK_END", e, e],
    [1, 84, "PageDown", 12, "PageDown", 34, "VK_NEXT", e, e],
    [1, 85, "ArrowRight", 17, "RightArrow", 39, "VK_RIGHT", "Right", e],
    [1, 86, "ArrowLeft", 15, "LeftArrow", 37, "VK_LEFT", "Left", e],
    [1, 87, "ArrowDown", 18, "DownArrow", 40, "VK_DOWN", "Down", e],
    [1, 88, "ArrowUp", 16, "UpArrow", 38, "VK_UP", "Up", e],
    [1, 89, "NumLock", 83, "NumLock", 144, "VK_NUMLOCK", e, e],
    [1, 90, "NumpadDivide", 113, "NumPad_Divide", 111, "VK_DIVIDE", e, e],
    [1, 91, "NumpadMultiply", 108, "NumPad_Multiply", 106, "VK_MULTIPLY", e, e],
    [1, 92, "NumpadSubtract", 111, "NumPad_Subtract", 109, "VK_SUBTRACT", e, e],
    [1, 93, "NumpadAdd", 109, "NumPad_Add", 107, "VK_ADD", e, e],
    [1, 94, "NumpadEnter", 3, e, 0, e, e, e],
    [1, 95, "Numpad1", 99, "NumPad1", 97, "VK_NUMPAD1", e, e],
    [1, 96, "Numpad2", 100, "NumPad2", 98, "VK_NUMPAD2", e, e],
    [1, 97, "Numpad3", 101, "NumPad3", 99, "VK_NUMPAD3", e, e],
    [1, 98, "Numpad4", 102, "NumPad4", 100, "VK_NUMPAD4", e, e],
    [1, 99, "Numpad5", 103, "NumPad5", 101, "VK_NUMPAD5", e, e],
    [1, 100, "Numpad6", 104, "NumPad6", 102, "VK_NUMPAD6", e, e],
    [1, 101, "Numpad7", 105, "NumPad7", 103, "VK_NUMPAD7", e, e],
    [1, 102, "Numpad8", 106, "NumPad8", 104, "VK_NUMPAD8", e, e],
    [1, 103, "Numpad9", 107, "NumPad9", 105, "VK_NUMPAD9", e, e],
    [1, 104, "Numpad0", 98, "NumPad0", 96, "VK_NUMPAD0", e, e],
    [1, 105, "NumpadDecimal", 112, "NumPad_Decimal", 110, "VK_DECIMAL", e, e],
    [0, 106, "IntlBackslash", 97, "OEM_102", 226, "VK_OEM_102", e, e],
    [1, 107, "ContextMenu", 58, "ContextMenu", 93, e, e, e],
    [1, 108, "Power", 0, e, 0, e, e, e],
    [1, 109, "NumpadEqual", 0, e, 0, e, e, e],
    [1, 110, "F13", 71, "F13", 124, "VK_F13", e, e],
    [1, 111, "F14", 72, "F14", 125, "VK_F14", e, e],
    [1, 112, "F15", 73, "F15", 126, "VK_F15", e, e],
    [1, 113, "F16", 74, "F16", 127, "VK_F16", e, e],
    [1, 114, "F17", 75, "F17", 128, "VK_F17", e, e],
    [1, 115, "F18", 76, "F18", 129, "VK_F18", e, e],
    [1, 116, "F19", 77, "F19", 130, "VK_F19", e, e],
    [1, 117, "F20", 78, "F20", 131, "VK_F20", e, e],
    [1, 118, "F21", 79, "F21", 132, "VK_F21", e, e],
    [1, 119, "F22", 80, "F22", 133, "VK_F22", e, e],
    [1, 120, "F23", 81, "F23", 134, "VK_F23", e, e],
    [1, 121, "F24", 82, "F24", 135, "VK_F24", e, e],
    [1, 122, "Open", 0, e, 0, e, e, e],
    [1, 123, "Help", 0, e, 0, e, e, e],
    [1, 124, "Select", 0, e, 0, e, e, e],
    [1, 125, "Again", 0, e, 0, e, e, e],
    [1, 126, "Undo", 0, e, 0, e, e, e],
    [1, 127, "Cut", 0, e, 0, e, e, e],
    [1, 128, "Copy", 0, e, 0, e, e, e],
    [1, 129, "Paste", 0, e, 0, e, e, e],
    [1, 130, "Find", 0, e, 0, e, e, e],
    [1, 131, "AudioVolumeMute", 117, "AudioVolumeMute", 173, "VK_VOLUME_MUTE", e, e],
    [1, 132, "AudioVolumeUp", 118, "AudioVolumeUp", 175, "VK_VOLUME_UP", e, e],
    [1, 133, "AudioVolumeDown", 119, "AudioVolumeDown", 174, "VK_VOLUME_DOWN", e, e],
    [1, 134, "NumpadComma", 110, "NumPad_Separator", 108, "VK_SEPARATOR", e, e],
    [0, 135, "IntlRo", 115, "ABNT_C1", 193, "VK_ABNT_C1", e, e],
    [1, 136, "KanaMode", 0, e, 0, e, e, e],
    [0, 137, "IntlYen", 0, e, 0, e, e, e],
    [1, 138, "Convert", 0, e, 0, e, e, e],
    [1, 139, "NonConvert", 0, e, 0, e, e, e],
    [1, 140, "Lang1", 0, e, 0, e, e, e],
    [1, 141, "Lang2", 0, e, 0, e, e, e],
    [1, 142, "Lang3", 0, e, 0, e, e, e],
    [1, 143, "Lang4", 0, e, 0, e, e, e],
    [1, 144, "Lang5", 0, e, 0, e, e, e],
    [1, 145, "Abort", 0, e, 0, e, e, e],
    [1, 146, "Props", 0, e, 0, e, e, e],
    [1, 147, "NumpadParenLeft", 0, e, 0, e, e, e],
    [1, 148, "NumpadParenRight", 0, e, 0, e, e, e],
    [1, 149, "NumpadBackspace", 0, e, 0, e, e, e],
    [1, 150, "NumpadMemoryStore", 0, e, 0, e, e, e],
    [1, 151, "NumpadMemoryRecall", 0, e, 0, e, e, e],
    [1, 152, "NumpadMemoryClear", 0, e, 0, e, e, e],
    [1, 153, "NumpadMemoryAdd", 0, e, 0, e, e, e],
    [1, 154, "NumpadMemorySubtract", 0, e, 0, e, e, e],
    [1, 155, "NumpadClear", 131, "Clear", 12, "VK_CLEAR", e, e],
    [1, 156, "NumpadClearEntry", 0, e, 0, e, e, e],
    [1, 0, e, 5, "Ctrl", 17, "VK_CONTROL", e, e],
    [1, 0, e, 4, "Shift", 16, "VK_SHIFT", e, e],
    [1, 0, e, 6, "Alt", 18, "VK_MENU", e, e],
    [1, 0, e, 57, "Meta", 91, "VK_COMMAND", e, e],
    [1, 157, "ControlLeft", 5, e, 0, "VK_LCONTROL", e, e],
    [1, 158, "ShiftLeft", 4, e, 0, "VK_LSHIFT", e, e],
    [1, 159, "AltLeft", 6, e, 0, "VK_LMENU", e, e],
    [1, 160, "MetaLeft", 57, e, 0, "VK_LWIN", e, e],
    [1, 161, "ControlRight", 5, e, 0, "VK_RCONTROL", e, e],
    [1, 162, "ShiftRight", 4, e, 0, "VK_RSHIFT", e, e],
    [1, 163, "AltRight", 6, e, 0, "VK_RMENU", e, e],
    [1, 164, "MetaRight", 57, e, 0, "VK_RWIN", e, e],
    [1, 165, "BrightnessUp", 0, e, 0, e, e, e],
    [1, 166, "BrightnessDown", 0, e, 0, e, e, e],
    [1, 167, "MediaPlay", 0, e, 0, e, e, e],
    [1, 168, "MediaRecord", 0, e, 0, e, e, e],
    [1, 169, "MediaFastForward", 0, e, 0, e, e, e],
    [1, 170, "MediaRewind", 0, e, 0, e, e, e],
    [1, 171, "MediaTrackNext", 124, "MediaTrackNext", 176, "VK_MEDIA_NEXT_TRACK", e, e],
    [1, 172, "MediaTrackPrevious", 125, "MediaTrackPrevious", 177, "VK_MEDIA_PREV_TRACK", e, e],
    [1, 173, "MediaStop", 126, "MediaStop", 178, "VK_MEDIA_STOP", e, e],
    [1, 174, "Eject", 0, e, 0, e, e, e],
    [1, 175, "MediaPlayPause", 127, "MediaPlayPause", 179, "VK_MEDIA_PLAY_PAUSE", e, e],
    [1, 176, "MediaSelect", 128, "LaunchMediaPlayer", 181, "VK_MEDIA_LAUNCH_MEDIA_SELECT", e, e],
    [1, 177, "LaunchMail", 129, "LaunchMail", 180, "VK_MEDIA_LAUNCH_MAIL", e, e],
    [1, 178, "LaunchApp2", 130, "LaunchApp2", 183, "VK_MEDIA_LAUNCH_APP2", e, e],
    [1, 179, "LaunchApp1", 0, e, 0, "VK_MEDIA_LAUNCH_APP1", e, e],
    [1, 180, "SelectTask", 0, e, 0, e, e, e],
    [1, 181, "LaunchScreenSaver", 0, e, 0, e, e, e],
    [1, 182, "BrowserSearch", 120, "BrowserSearch", 170, "VK_BROWSER_SEARCH", e, e],
    [1, 183, "BrowserHome", 121, "BrowserHome", 172, "VK_BROWSER_HOME", e, e],
    [1, 184, "BrowserBack", 122, "BrowserBack", 166, "VK_BROWSER_BACK", e, e],
    [1, 185, "BrowserForward", 123, "BrowserForward", 167, "VK_BROWSER_FORWARD", e, e],
    [1, 186, "BrowserStop", 0, e, 0, "VK_BROWSER_STOP", e, e],
    [1, 187, "BrowserRefresh", 0, e, 0, "VK_BROWSER_REFRESH", e, e],
    [1, 188, "BrowserFavorites", 0, e, 0, "VK_BROWSER_FAVORITES", e, e],
    [1, 189, "ZoomToggle", 0, e, 0, e, e, e],
    [1, 190, "MailReply", 0, e, 0, e, e, e],
    [1, 191, "MailForward", 0, e, 0, e, e, e],
    [1, 192, "MailSend", 0, e, 0, e, e, e],
    // See https://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html
    // If an Input Method Editor is processing key input and the event is keydown, return 229.
    [1, 0, e, 114, "KeyInComposition", 229, e, e, e],
    [1, 0, e, 116, "ABNT_C2", 194, "VK_ABNT_C2", e, e],
    [1, 0, e, 96, "OEM_8", 223, "VK_OEM_8", e, e],
    [1, 0, e, 0, e, 0, "VK_KANA", e, e],
    [1, 0, e, 0, e, 0, "VK_HANGUL", e, e],
    [1, 0, e, 0, e, 0, "VK_JUNJA", e, e],
    [1, 0, e, 0, e, 0, "VK_FINAL", e, e],
    [1, 0, e, 0, e, 0, "VK_HANJA", e, e],
    [1, 0, e, 0, e, 0, "VK_KANJI", e, e],
    [1, 0, e, 0, e, 0, "VK_CONVERT", e, e],
    [1, 0, e, 0, e, 0, "VK_NONCONVERT", e, e],
    [1, 0, e, 0, e, 0, "VK_ACCEPT", e, e],
    [1, 0, e, 0, e, 0, "VK_MODECHANGE", e, e],
    [1, 0, e, 0, e, 0, "VK_SELECT", e, e],
    [1, 0, e, 0, e, 0, "VK_PRINT", e, e],
    [1, 0, e, 0, e, 0, "VK_EXECUTE", e, e],
    [1, 0, e, 0, e, 0, "VK_SNAPSHOT", e, e],
    [1, 0, e, 0, e, 0, "VK_HELP", e, e],
    [1, 0, e, 0, e, 0, "VK_APPS", e, e],
    [1, 0, e, 0, e, 0, "VK_PROCESSKEY", e, e],
    [1, 0, e, 0, e, 0, "VK_PACKET", e, e],
    [1, 0, e, 0, e, 0, "VK_DBE_SBCSCHAR", e, e],
    [1, 0, e, 0, e, 0, "VK_DBE_DBCSCHAR", e, e],
    [1, 0, e, 0, e, 0, "VK_ATTN", e, e],
    [1, 0, e, 0, e, 0, "VK_CRSEL", e, e],
    [1, 0, e, 0, e, 0, "VK_EXSEL", e, e],
    [1, 0, e, 0, e, 0, "VK_EREOF", e, e],
    [1, 0, e, 0, e, 0, "VK_PLAY", e, e],
    [1, 0, e, 0, e, 0, "VK_ZOOM", e, e],
    [1, 0, e, 0, e, 0, "VK_NONAME", e, e],
    [1, 0, e, 0, e, 0, "VK_PA1", e, e],
    [1, 0, e, 0, e, 0, "VK_OEM_CLEAR", e, e]
  ], n = [], r = [];
  for (const i of t) {
    const [s, a, o, u, l, h, f, d, m] = i;
    if (r[a] || (r[a] = !0, Zl[o] = a, Yl[o.toLowerCase()] = a), !n[u]) {
      if (n[u] = !0, !l)
        throw new Error(`String representation missing for key code ${u} around scan code ${o}`);
      xn.define(u, l), hr.define(u, d || l), dr.define(u, m || d || l);
    }
    h && (Ql[h] = u);
  }
})();
var gi;
(function(e) {
  function t(o) {
    return xn.keyCodeToStr(o);
  }
  e.toString = t;
  function n(o) {
    return xn.strToKeyCode(o);
  }
  e.fromString = n;
  function r(o) {
    return hr.keyCodeToStr(o);
  }
  e.toUserSettingsUS = r;
  function i(o) {
    return dr.keyCodeToStr(o);
  }
  e.toUserSettingsGeneral = i;
  function s(o) {
    return hr.strToKeyCode(o) || dr.strToKeyCode(o);
  }
  e.fromUserSettings = s;
  function a(o) {
    if (o >= 98 && o <= 113)
      return null;
    switch (o) {
      case 16:
        return "Up";
      case 18:
        return "Down";
      case 15:
        return "Left";
      case 17:
        return "Right";
    }
    return xn.keyCodeToStr(o);
  }
  e.toElectronAccelerator = a;
})(gi || (gi = {}));
function Kl(e, t) {
  const n = (t & 65535) << 16 >>> 0;
  return (e | n) >>> 0;
}
let Et;
const Qn = globalThis.vscode;
var uo;
if (typeof Qn < "u" && typeof Qn.process < "u") {
  const e = Qn.process;
  Et = {
    get platform() {
      return e.platform;
    },
    get arch() {
      return e.arch;
    },
    get env() {
      return e.env;
    },
    cwd() {
      return e.cwd();
    }
  };
} else typeof process < "u" && typeof ((uo = process == null ? void 0 : process.versions) == null ? void 0 : uo.node) == "string" ? Et = {
  get platform() {
    return process.platform;
  },
  get arch() {
    return process.arch;
  },
  get env() {
    return process.env;
  },
  cwd() {
    return process.env.VSCODE_CWD || process.cwd();
  }
} : Et = {
  // Supported
  get platform() {
    return en ? "win32" : bl ? "darwin" : "linux";
  },
  get arch() {
  },
  // Unsupported
  get env() {
    return {};
  },
  cwd() {
    return "/";
  }
};
const kn = Et.cwd, eu = Et.env, tu = Et.platform, nu = 65, ru = 97, iu = 90, su = 122, ot = 46, oe = 47, ge = 92, Be = 58, au = 63;
class xo extends Error {
  constructor(t, n, r) {
    let i;
    typeof n == "string" && n.indexOf("not ") === 0 ? (i = "must not be", n = n.replace(/^not /, "")) : i = "must be";
    const s = t.indexOf(".") !== -1 ? "property" : "argument";
    let a = `The "${t}" ${s} ${i} of type ${n}`;
    a += `. Received type ${typeof r}`, super(a), this.code = "ERR_INVALID_ARG_TYPE";
  }
}
function ou(e, t) {
  if (e === null || typeof e != "object")
    throw new xo(t, "Object", e);
}
function te(e, t) {
  if (typeof e != "string")
    throw new xo(t, "string", e);
}
const et = tu === "win32";
function U(e) {
  return e === oe || e === ge;
}
function gr(e) {
  return e === oe;
}
function Ue(e) {
  return e >= nu && e <= iu || e >= ru && e <= su;
}
function Rn(e, t, n, r) {
  let i = "", s = 0, a = -1, o = 0, u = 0;
  for (let l = 0; l <= e.length; ++l) {
    if (l < e.length)
      u = e.charCodeAt(l);
    else {
      if (r(u))
        break;
      u = oe;
    }
    if (r(u)) {
      if (!(a === l - 1 || o === 1)) if (o === 2) {
        if (i.length < 2 || s !== 2 || i.charCodeAt(i.length - 1) !== ot || i.charCodeAt(i.length - 2) !== ot) {
          if (i.length > 2) {
            const h = i.lastIndexOf(n);
            h === -1 ? (i = "", s = 0) : (i = i.slice(0, h), s = i.length - 1 - i.lastIndexOf(n)), a = l, o = 0;
            continue;
          } else if (i.length !== 0) {
            i = "", s = 0, a = l, o = 0;
            continue;
          }
        }
        t && (i += i.length > 0 ? `${n}..` : "..", s = 2);
      } else
        i.length > 0 ? i += `${n}${e.slice(a + 1, l)}` : i = e.slice(a + 1, l), s = l - a - 1;
      a = l, o = 0;
    } else u === ot && o !== -1 ? ++o : o = -1;
  }
  return i;
}
function lu(e) {
  return e ? `${e[0] === "." ? "" : "."}${e}` : "";
}
function vo(e, t) {
  ou(t, "pathObject");
  const n = t.dir || t.root, r = t.base || `${t.name || ""}${lu(t.ext)}`;
  return n ? n === t.root ? `${n}${r}` : `${n}${e}${r}` : r;
}
const de = {
  // path.resolve([from ...], to)
  resolve(...e) {
    let t = "", n = "", r = !1;
    for (let i = e.length - 1; i >= -1; i--) {
      let s;
      if (i >= 0) {
        if (s = e[i], te(s, `paths[${i}]`), s.length === 0)
          continue;
      } else t.length === 0 ? s = kn() : (s = eu[`=${t}`] || kn(), (s === void 0 || s.slice(0, 2).toLowerCase() !== t.toLowerCase() && s.charCodeAt(2) === ge) && (s = `${t}\\`));
      const a = s.length;
      let o = 0, u = "", l = !1;
      const h = s.charCodeAt(0);
      if (a === 1)
        U(h) && (o = 1, l = !0);
      else if (U(h))
        if (l = !0, U(s.charCodeAt(1))) {
          let f = 2, d = f;
          for (; f < a && !U(s.charCodeAt(f)); )
            f++;
          if (f < a && f !== d) {
            const m = s.slice(d, f);
            for (d = f; f < a && U(s.charCodeAt(f)); )
              f++;
            if (f < a && f !== d) {
              for (d = f; f < a && !U(s.charCodeAt(f)); )
                f++;
              (f === a || f !== d) && (u = `\\\\${m}\\${s.slice(d, f)}`, o = f);
            }
          }
        } else
          o = 1;
      else Ue(h) && s.charCodeAt(1) === Be && (u = s.slice(0, 2), o = 2, a > 2 && U(s.charCodeAt(2)) && (l = !0, o = 3));
      if (u.length > 0)
        if (t.length > 0) {
          if (u.toLowerCase() !== t.toLowerCase())
            continue;
        } else
          t = u;
      if (r) {
        if (t.length > 0)
          break;
      } else if (n = `${s.slice(o)}\\${n}`, r = l, l && t.length > 0)
        break;
    }
    return n = Rn(n, !r, "\\", U), r ? `${t}\\${n}` : `${t}${n}` || ".";
  },
  normalize(e) {
    te(e, "path");
    const t = e.length;
    if (t === 0)
      return ".";
    let n = 0, r, i = !1;
    const s = e.charCodeAt(0);
    if (t === 1)
      return gr(s) ? "\\" : e;
    if (U(s))
      if (i = !0, U(e.charCodeAt(1))) {
        let o = 2, u = o;
        for (; o < t && !U(e.charCodeAt(o)); )
          o++;
        if (o < t && o !== u) {
          const l = e.slice(u, o);
          for (u = o; o < t && U(e.charCodeAt(o)); )
            o++;
          if (o < t && o !== u) {
            for (u = o; o < t && !U(e.charCodeAt(o)); )
              o++;
            if (o === t)
              return `\\\\${l}\\${e.slice(u)}\\`;
            o !== u && (r = `\\\\${l}\\${e.slice(u, o)}`, n = o);
          }
        }
      } else
        n = 1;
    else Ue(s) && e.charCodeAt(1) === Be && (r = e.slice(0, 2), n = 2, t > 2 && U(e.charCodeAt(2)) && (i = !0, n = 3));
    let a = n < t ? Rn(e.slice(n), !i, "\\", U) : "";
    if (a.length === 0 && !i && (a = "."), a.length > 0 && U(e.charCodeAt(t - 1)) && (a += "\\"), !i && r === void 0 && e.includes(":")) {
      if (a.length >= 2 && Ue(a.charCodeAt(0)) && a.charCodeAt(1) === Be)
        return `.\\${a}`;
      let o = e.indexOf(":");
      do
        if (o === t - 1 || U(e.charCodeAt(o + 1)))
          return `.\\${a}`;
      while ((o = e.indexOf(":", o + 1)) !== -1);
    }
    return r === void 0 ? i ? `\\${a}` : a : i ? `${r}\\${a}` : `${r}${a}`;
  },
  isAbsolute(e) {
    te(e, "path");
    const t = e.length;
    if (t === 0)
      return !1;
    const n = e.charCodeAt(0);
    return U(n) || // Possible device root
    t > 2 && Ue(n) && e.charCodeAt(1) === Be && U(e.charCodeAt(2));
  },
  join(...e) {
    if (e.length === 0)
      return ".";
    let t, n;
    for (let s = 0; s < e.length; ++s) {
      const a = e[s];
      te(a, "path"), a.length > 0 && (t === void 0 ? t = n = a : t += `\\${a}`);
    }
    if (t === void 0)
      return ".";
    let r = !0, i = 0;
    if (typeof n == "string" && U(n.charCodeAt(0))) {
      ++i;
      const s = n.length;
      s > 1 && U(n.charCodeAt(1)) && (++i, s > 2 && (U(n.charCodeAt(2)) ? ++i : r = !1));
    }
    if (r) {
      for (; i < t.length && U(t.charCodeAt(i)); )
        i++;
      i >= 2 && (t = `\\${t.slice(i)}`);
    }
    return de.normalize(t);
  },
  // It will solve the relative path from `from` to `to`, for instance:
  //  from = 'C:\\orandea\\test\\aaa'
  //  to = 'C:\\orandea\\impl\\bbb'
  // The output of the function should be: '..\\..\\impl\\bbb'
  relative(e, t) {
    if (te(e, "from"), te(t, "to"), e === t)
      return "";
    const n = de.resolve(e), r = de.resolve(t);
    if (n === r || (e = n.toLowerCase(), t = r.toLowerCase(), e === t))
      return "";
    if (n.length !== e.length || r.length !== t.length) {
      const g = n.split("\\"), p = r.split("\\");
      g[g.length - 1] === "" && g.pop(), p[p.length - 1] === "" && p.pop();
      const w = g.length, y = p.length, N = w < y ? w : y;
      let b;
      for (b = 0; b < N && g[b].toLowerCase() === p[b].toLowerCase(); b++)
        ;
      return b === 0 ? r : b === N ? y > N ? p.slice(b).join("\\") : w > N ? "..\\".repeat(w - 1 - b) + ".." : "" : "..\\".repeat(w - b) + p.slice(b).join("\\");
    }
    let i = 0;
    for (; i < e.length && e.charCodeAt(i) === ge; )
      i++;
    let s = e.length;
    for (; s - 1 > i && e.charCodeAt(s - 1) === ge; )
      s--;
    const a = s - i;
    let o = 0;
    for (; o < t.length && t.charCodeAt(o) === ge; )
      o++;
    let u = t.length;
    for (; u - 1 > o && t.charCodeAt(u - 1) === ge; )
      u--;
    const l = u - o, h = a < l ? a : l;
    let f = -1, d = 0;
    for (; d < h; d++) {
      const g = e.charCodeAt(i + d);
      if (g !== t.charCodeAt(o + d))
        break;
      g === ge && (f = d);
    }
    if (d !== h) {
      if (f === -1)
        return r;
    } else {
      if (l > h) {
        if (t.charCodeAt(o + d) === ge)
          return r.slice(o + d + 1);
        if (d === 2)
          return r.slice(o + d);
      }
      a > h && (e.charCodeAt(i + d) === ge ? f = d : d === 2 && (f = 3)), f === -1 && (f = 0);
    }
    let m = "";
    for (d = i + f + 1; d <= s; ++d)
      (d === s || e.charCodeAt(d) === ge) && (m += m.length === 0 ? ".." : "\\..");
    return o += f, m.length > 0 ? `${m}${r.slice(o, u)}` : (r.charCodeAt(o) === ge && ++o, r.slice(o, u));
  },
  toNamespacedPath(e) {
    if (typeof e != "string" || e.length === 0)
      return e;
    const t = de.resolve(e);
    if (t.length <= 2)
      return e;
    if (t.charCodeAt(0) === ge) {
      if (t.charCodeAt(1) === ge) {
        const n = t.charCodeAt(2);
        if (n !== au && n !== ot)
          return `\\\\?\\UNC\\${t.slice(2)}`;
      }
    } else if (Ue(t.charCodeAt(0)) && t.charCodeAt(1) === Be && t.charCodeAt(2) === ge)
      return `\\\\?\\${t}`;
    return t;
  },
  dirname(e) {
    te(e, "path");
    const t = e.length;
    if (t === 0)
      return ".";
    let n = -1, r = 0;
    const i = e.charCodeAt(0);
    if (t === 1)
      return U(i) ? e : ".";
    if (U(i)) {
      if (n = r = 1, U(e.charCodeAt(1))) {
        let o = 2, u = o;
        for (; o < t && !U(e.charCodeAt(o)); )
          o++;
        if (o < t && o !== u) {
          for (u = o; o < t && U(e.charCodeAt(o)); )
            o++;
          if (o < t && o !== u) {
            for (u = o; o < t && !U(e.charCodeAt(o)); )
              o++;
            if (o === t)
              return e;
            o !== u && (n = r = o + 1);
          }
        }
      }
    } else Ue(i) && e.charCodeAt(1) === Be && (n = t > 2 && U(e.charCodeAt(2)) ? 3 : 2, r = n);
    let s = -1, a = !0;
    for (let o = t - 1; o >= r; --o)
      if (U(e.charCodeAt(o))) {
        if (!a) {
          s = o;
          break;
        }
      } else
        a = !1;
    if (s === -1) {
      if (n === -1)
        return ".";
      s = n;
    }
    return e.slice(0, s);
  },
  basename(e, t) {
    t !== void 0 && te(t, "suffix"), te(e, "path");
    let n = 0, r = -1, i = !0, s;
    if (e.length >= 2 && Ue(e.charCodeAt(0)) && e.charCodeAt(1) === Be && (n = 2), t !== void 0 && t.length > 0 && t.length <= e.length) {
      if (t === e)
        return "";
      let a = t.length - 1, o = -1;
      for (s = e.length - 1; s >= n; --s) {
        const u = e.charCodeAt(s);
        if (U(u)) {
          if (!i) {
            n = s + 1;
            break;
          }
        } else
          o === -1 && (i = !1, o = s + 1), a >= 0 && (u === t.charCodeAt(a) ? --a === -1 && (r = s) : (a = -1, r = o));
      }
      return n === r ? r = o : r === -1 && (r = e.length), e.slice(n, r);
    }
    for (s = e.length - 1; s >= n; --s)
      if (U(e.charCodeAt(s))) {
        if (!i) {
          n = s + 1;
          break;
        }
      } else r === -1 && (i = !1, r = s + 1);
    return r === -1 ? "" : e.slice(n, r);
  },
  extname(e) {
    te(e, "path");
    let t = 0, n = -1, r = 0, i = -1, s = !0, a = 0;
    e.length >= 2 && e.charCodeAt(1) === Be && Ue(e.charCodeAt(0)) && (t = r = 2);
    for (let o = e.length - 1; o >= t; --o) {
      const u = e.charCodeAt(o);
      if (U(u)) {
        if (!s) {
          r = o + 1;
          break;
        }
        continue;
      }
      i === -1 && (s = !1, i = o + 1), u === ot ? n === -1 ? n = o : a !== 1 && (a = 1) : n !== -1 && (a = -1);
    }
    return n === -1 || i === -1 || // We saw a non-dot character immediately before the dot
    a === 0 || // The (right-most) trimmed path component is exactly '..'
    a === 1 && n === i - 1 && n === r + 1 ? "" : e.slice(n, i);
  },
  format: vo.bind(null, "\\"),
  parse(e) {
    te(e, "path");
    const t = { root: "", dir: "", base: "", ext: "", name: "" };
    if (e.length === 0)
      return t;
    const n = e.length;
    let r = 0, i = e.charCodeAt(0);
    if (n === 1)
      return U(i) ? (t.root = t.dir = e, t) : (t.base = t.name = e, t);
    if (U(i)) {
      if (r = 1, U(e.charCodeAt(1))) {
        let f = 2, d = f;
        for (; f < n && !U(e.charCodeAt(f)); )
          f++;
        if (f < n && f !== d) {
          for (d = f; f < n && U(e.charCodeAt(f)); )
            f++;
          if (f < n && f !== d) {
            for (d = f; f < n && !U(e.charCodeAt(f)); )
              f++;
            f === n ? r = f : f !== d && (r = f + 1);
          }
        }
      }
    } else if (Ue(i) && e.charCodeAt(1) === Be) {
      if (n <= 2)
        return t.root = t.dir = e, t;
      if (r = 2, U(e.charCodeAt(2))) {
        if (n === 3)
          return t.root = t.dir = e, t;
        r = 3;
      }
    }
    r > 0 && (t.root = e.slice(0, r));
    let s = -1, a = r, o = -1, u = !0, l = e.length - 1, h = 0;
    for (; l >= r; --l) {
      if (i = e.charCodeAt(l), U(i)) {
        if (!u) {
          a = l + 1;
          break;
        }
        continue;
      }
      o === -1 && (u = !1, o = l + 1), i === ot ? s === -1 ? s = l : h !== 1 && (h = 1) : s !== -1 && (h = -1);
    }
    return o !== -1 && (s === -1 || // We saw a non-dot character immediately before the dot
    h === 0 || // The (right-most) trimmed path component is exactly '..'
    h === 1 && s === o - 1 && s === a + 1 ? t.base = t.name = e.slice(a, o) : (t.name = e.slice(a, s), t.base = e.slice(a, o), t.ext = e.slice(s, o))), a > 0 && a !== r ? t.dir = e.slice(0, a - 1) : t.dir = t.root, t;
  },
  sep: "\\",
  delimiter: ";",
  win32: null,
  posix: null
}, uu = (() => {
  if (et) {
    const e = /\\/g;
    return () => {
      const t = kn().replace(e, "/");
      return t.slice(t.indexOf("/"));
    };
  }
  return () => kn();
})(), pe = {
  // path.resolve([from ...], to)
  resolve(...e) {
    let t = "", n = !1;
    for (let r = e.length - 1; r >= 0 && !n; r--) {
      const i = e[r];
      te(i, `paths[${r}]`), i.length !== 0 && (t = `${i}/${t}`, n = i.charCodeAt(0) === oe);
    }
    if (!n) {
      const r = uu();
      t = `${r}/${t}`, n = r.charCodeAt(0) === oe;
    }
    return t = Rn(t, !n, "/", gr), n ? `/${t}` : t.length > 0 ? t : ".";
  },
  normalize(e) {
    if (te(e, "path"), e.length === 0)
      return ".";
    const t = e.charCodeAt(0) === oe, n = e.charCodeAt(e.length - 1) === oe;
    return e = Rn(e, !t, "/", gr), e.length === 0 ? t ? "/" : n ? "./" : "." : (n && (e += "/"), t ? `/${e}` : e);
  },
  isAbsolute(e) {
    return te(e, "path"), e.length > 0 && e.charCodeAt(0) === oe;
  },
  join(...e) {
    if (e.length === 0)
      return ".";
    const t = [];
    for (let n = 0; n < e.length; ++n) {
      const r = e[n];
      te(r, "path"), r.length > 0 && t.push(r);
    }
    return t.length === 0 ? "." : pe.normalize(t.join("/"));
  },
  relative(e, t) {
    if (te(e, "from"), te(t, "to"), e === t || (e = pe.resolve(e), t = pe.resolve(t), e === t))
      return "";
    const n = 1, r = e.length, i = r - n, s = 1, a = t.length - s, o = i < a ? i : a;
    let u = -1, l = 0;
    for (; l < o; l++) {
      const f = e.charCodeAt(n + l);
      if (f !== t.charCodeAt(s + l))
        break;
      f === oe && (u = l);
    }
    if (l === o)
      if (a > o) {
        if (t.charCodeAt(s + l) === oe)
          return t.slice(s + l + 1);
        if (l === 0)
          return t.slice(s + l);
      } else i > o && (e.charCodeAt(n + l) === oe ? u = l : l === 0 && (u = 0));
    let h = "";
    for (l = n + u + 1; l <= r; ++l)
      (l === r || e.charCodeAt(l) === oe) && (h += h.length === 0 ? ".." : "/..");
    return `${h}${t.slice(s + u)}`;
  },
  toNamespacedPath(e) {
    return e;
  },
  dirname(e) {
    if (te(e, "path"), e.length === 0)
      return ".";
    const t = e.charCodeAt(0) === oe;
    let n = -1, r = !0;
    for (let i = e.length - 1; i >= 1; --i)
      if (e.charCodeAt(i) === oe) {
        if (!r) {
          n = i;
          break;
        }
      } else
        r = !1;
    return n === -1 ? t ? "/" : "." : t && n === 1 ? "//" : e.slice(0, n);
  },
  basename(e, t) {
    t !== void 0 && te(t, "suffix"), te(e, "path");
    let n = 0, r = -1, i = !0, s;
    if (t !== void 0 && t.length > 0 && t.length <= e.length) {
      if (t === e)
        return "";
      let a = t.length - 1, o = -1;
      for (s = e.length - 1; s >= 0; --s) {
        const u = e.charCodeAt(s);
        if (u === oe) {
          if (!i) {
            n = s + 1;
            break;
          }
        } else
          o === -1 && (i = !1, o = s + 1), a >= 0 && (u === t.charCodeAt(a) ? --a === -1 && (r = s) : (a = -1, r = o));
      }
      return n === r ? r = o : r === -1 && (r = e.length), e.slice(n, r);
    }
    for (s = e.length - 1; s >= 0; --s)
      if (e.charCodeAt(s) === oe) {
        if (!i) {
          n = s + 1;
          break;
        }
      } else r === -1 && (i = !1, r = s + 1);
    return r === -1 ? "" : e.slice(n, r);
  },
  extname(e) {
    te(e, "path");
    let t = -1, n = 0, r = -1, i = !0, s = 0;
    for (let a = e.length - 1; a >= 0; --a) {
      const o = e[a];
      if (o === "/") {
        if (!i) {
          n = a + 1;
          break;
        }
        continue;
      }
      r === -1 && (i = !1, r = a + 1), o === "." ? t === -1 ? t = a : s !== 1 && (s = 1) : t !== -1 && (s = -1);
    }
    return t === -1 || r === -1 || // We saw a non-dot character immediately before the dot
    s === 0 || // The (right-most) trimmed path component is exactly '..'
    s === 1 && t === r - 1 && t === n + 1 ? "" : e.slice(t, r);
  },
  format: vo.bind(null, "/"),
  parse(e) {
    te(e, "path");
    const t = { root: "", dir: "", base: "", ext: "", name: "" };
    if (e.length === 0)
      return t;
    const n = e.charCodeAt(0) === oe;
    let r;
    n ? (t.root = "/", r = 1) : r = 0;
    let i = -1, s = 0, a = -1, o = !0, u = e.length - 1, l = 0;
    for (; u >= r; --u) {
      const h = e.charCodeAt(u);
      if (h === oe) {
        if (!o) {
          s = u + 1;
          break;
        }
        continue;
      }
      a === -1 && (o = !1, a = u + 1), h === ot ? i === -1 ? i = u : l !== 1 && (l = 1) : i !== -1 && (l = -1);
    }
    if (a !== -1) {
      const h = s === 0 && n ? 1 : s;
      i === -1 || // We saw a non-dot character immediately before the dot
      l === 0 || // The (right-most) trimmed path component is exactly '..'
      l === 1 && i === a - 1 && i === s + 1 ? t.base = t.name = e.slice(h, a) : (t.name = e.slice(h, i), t.base = e.slice(h, a), t.ext = e.slice(i, a));
    }
    return s > 0 ? t.dir = e.slice(0, s - 1) : n && (t.dir = "/"), t;
  },
  sep: "/",
  delimiter: ":",
  win32: null,
  posix: null
};
pe.win32 = de.win32 = de;
pe.posix = de.posix = pe;
et ? de.normalize : pe.normalize;
et ? de.resolve : pe.resolve;
et ? de.relative : pe.relative;
et ? de.dirname : pe.dirname;
et ? de.basename : pe.basename;
et ? de.extname : pe.extname;
et ? de.sep : pe.sep;
const cu = /^\w[\w\d+.-]*$/, fu = /^\//, hu = /^\/\//;
function du(e, t) {
  if (!e.scheme && t)
    throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${e.authority}", path: "${e.path}", query: "${e.query}", fragment: "${e.fragment}"}`);
  if (e.scheme && !cu.test(e.scheme))
    throw new Error("[UriError]: Scheme contains illegal characters.");
  if (e.path) {
    if (e.authority) {
      if (!fu.test(e.path))
        throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
    } else if (hu.test(e.path))
      throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
  }
}
function gu(e, t) {
  return !e && !t ? "file" : e;
}
function mu(e, t) {
  switch (e) {
    case "https":
    case "http":
    case "file":
      t ? t[0] !== Me && (t = Me + t) : t = Me;
      break;
  }
  return t;
}
const Z = "", Me = "/", pu = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
let Kr = class vn {
  static isUri(t) {
    return t instanceof vn ? !0 : !t || typeof t != "object" ? !1 : typeof t.authority == "string" && typeof t.fragment == "string" && typeof t.path == "string" && typeof t.query == "string" && typeof t.scheme == "string" && typeof t.fsPath == "string" && typeof t.with == "function" && typeof t.toString == "function";
  }
  /**
   * @internal
   */
  constructor(t, n, r, i, s, a = !1) {
    typeof t == "object" ? (this.scheme = t.scheme || Z, this.authority = t.authority || Z, this.path = t.path || Z, this.query = t.query || Z, this.fragment = t.fragment || Z) : (this.scheme = gu(t, a), this.authority = n || Z, this.path = mu(this.scheme, r || Z), this.query = i || Z, this.fragment = s || Z, du(this, a));
  }
  // ---- filesystem path -----------------------
  /**
   * Returns a string representing the corresponding file system path of this URI.
   * Will handle UNC paths, normalizes windows drive letters to lower-case, and uses the
   * platform specific path separator.
   *
   * * Will *not* validate the path for invalid characters and semantics.
   * * Will *not* look at the scheme of this URI.
   * * The result shall *not* be used for display purposes but for accessing a file on disk.
   *
   *
   * The *difference* to `URI#path` is the use of the platform specific separator and the handling
   * of UNC paths. See the below sample of a file-uri with an authority (UNC path).
   *
   * ```ts
      const u = URI.parse('file://server/c$/folder/file.txt')
      u.authority === 'server'
      u.path === '/shares/c$/file.txt'
      u.fsPath === '\\server\c$\folder\file.txt'
  ```
   *
   * Using `URI#path` to read a file (using fs-apis) would not be enough because parts of the path,
   * namely the server name, would be missing. Therefore `URI#fsPath` exists - it's sugar to ease working
   * with URIs that represent files on disk (`file` scheme).
   */
  get fsPath() {
    return mr(this, !1);
  }
  // ---- modify to new -------------------------
  with(t) {
    if (!t)
      return this;
    let { scheme: n, authority: r, path: i, query: s, fragment: a } = t;
    return n === void 0 ? n = this.scheme : n === null && (n = Z), r === void 0 ? r = this.authority : r === null && (r = Z), i === void 0 ? i = this.path : i === null && (i = Z), s === void 0 ? s = this.query : s === null && (s = Z), a === void 0 ? a = this.fragment : a === null && (a = Z), n === this.scheme && r === this.authority && i === this.path && s === this.query && a === this.fragment ? this : new pt(n, r, i, s, a);
  }
  // ---- parse & validate ------------------------
  /**
   * Creates a new URI from a string, e.g. `http://www.example.com/some/path`,
   * `file:///usr/home`, or `scheme:with/path`.
   *
   * @param value A string which represents an URI (see `URI#toString`).
   */
  static parse(t, n = !1) {
    const r = pu.exec(t);
    return r ? new pt(r[2] || Z, hn(r[4] || Z), hn(r[5] || Z), hn(r[7] || Z), hn(r[9] || Z), n) : new pt(Z, Z, Z, Z, Z);
  }
  /**
   * Creates a new URI from a file system path, e.g. `c:\my\files`,
   * `/usr/home`, or `\\server\share\some\path`.
   *
   * The *difference* between `URI#parse` and `URI#file` is that the latter treats the argument
   * as path, not as stringified-uri. E.g. `URI.file(path)` is **not the same as**
   * `URI.parse('file://' + path)` because the path might contain characters that are
   * interpreted (# and ?). See the following sample:
   * ```ts
  const good = URI.file('/coding/c#/project1');
  good.scheme === 'file';
  good.path === '/coding/c#/project1';
  good.fragment === '';
  const bad = URI.parse('file://' + '/coding/c#/project1');
  bad.scheme === 'file';
  bad.path === '/coding/c'; // path is now broken
  bad.fragment === '/project1';
  ```
   *
   * @param path A file system path (see `URI#fsPath`)
   */
  static file(t) {
    let n = Z;
    if (en && (t = t.replace(/\\/g, Me)), t[0] === Me && t[1] === Me) {
      const r = t.indexOf(Me, 2);
      r === -1 ? (n = t.substring(2), t = Me) : (n = t.substring(2, r), t = t.substring(r) || Me);
    }
    return new pt("file", n, t, Z, Z);
  }
  /**
   * Creates new URI from uri components.
   *
   * Unless `strict` is `true` the scheme is defaults to be `file`. This function performs
   * validation and should be used for untrusted uri components retrieved from storage,
   * user input, command arguments etc
   */
  static from(t, n) {
    return new pt(t.scheme, t.authority, t.path, t.query, t.fragment, n);
  }
  /**
   * Join a URI path with path fragments and normalizes the resulting path.
   *
   * @param uri The input URI.
   * @param pathFragment The path fragment to add to the URI path.
   * @returns The resulting URI.
   */
  static joinPath(t, ...n) {
    if (!t.path)
      throw new Error("[UriError]: cannot call joinPath on URI without path");
    let r;
    return en && t.scheme === "file" ? r = vn.file(de.join(mr(t, !0), ...n)).path : r = pe.join(t.path, ...n), t.with({ path: r });
  }
  // ---- printing/externalize ---------------------------
  /**
   * Creates a string representation for this URI. It's guaranteed that calling
   * `URI.parse` with the result of this function creates an URI which is equal
   * to this URI.
   *
   * * The result shall *not* be used for display purposes but for externalization or transport.
   * * The result will be encoded using the percentage encoding and encoding happens mostly
   * ignore the scheme-specific encoding rules.
   *
   * @param skipEncoding Do not encode the result, default is `false`
   */
  toString(t = !1) {
    return pr(this, t);
  }
  toJSON() {
    return this;
  }
  static revive(t) {
    if (t) {
      if (t instanceof vn)
        return t;
      {
        const n = new pt(t);
        return n._formatted = t.external ?? null, n._fsPath = t._sep === yo ? t.fsPath ?? null : null, n;
      }
    } else return t;
  }
};
const yo = en ? 1 : void 0;
class pt extends Kr {
  constructor() {
    super(...arguments), this._formatted = null, this._fsPath = null;
  }
  get fsPath() {
    return this._fsPath || (this._fsPath = mr(this, !1)), this._fsPath;
  }
  toString(t = !1) {
    return t ? pr(this, !0) : (this._formatted || (this._formatted = pr(this, !1)), this._formatted);
  }
  toJSON() {
    const t = {
      $mid: 1
      /* MarshalledId.Uri */
    };
    return this._fsPath && (t.fsPath = this._fsPath, t._sep = yo), this._formatted && (t.external = this._formatted), this.path && (t.path = this.path), this.scheme && (t.scheme = this.scheme), this.authority && (t.authority = this.authority), this.query && (t.query = this.query), this.fragment && (t.fragment = this.fragment), t;
  }
}
const Lo = {
  58: "%3A",
  // gen-delims
  47: "%2F",
  63: "%3F",
  35: "%23",
  91: "%5B",
  93: "%5D",
  64: "%40",
  33: "%21",
  // sub-delims
  36: "%24",
  38: "%26",
  39: "%27",
  40: "%28",
  41: "%29",
  42: "%2A",
  43: "%2B",
  44: "%2C",
  59: "%3B",
  61: "%3D",
  32: "%20"
};
function mi(e, t, n) {
  let r, i = -1;
  for (let s = 0; s < e.length; s++) {
    const a = e.charCodeAt(s);
    if (a >= 97 && a <= 122 || a >= 65 && a <= 90 || a >= 48 && a <= 57 || a === 45 || a === 46 || a === 95 || a === 126 || t && a === 47 || n && a === 91 || n && a === 93 || n && a === 58)
      i !== -1 && (r += encodeURIComponent(e.substring(i, s)), i = -1), r !== void 0 && (r += e.charAt(s));
    else {
      r === void 0 && (r = e.substr(0, s));
      const o = Lo[a];
      o !== void 0 ? (i !== -1 && (r += encodeURIComponent(e.substring(i, s)), i = -1), r += o) : i === -1 && (i = s);
    }
  }
  return i !== -1 && (r += encodeURIComponent(e.substring(i))), r !== void 0 ? r : e;
}
function bu(e) {
  let t;
  for (let n = 0; n < e.length; n++) {
    const r = e.charCodeAt(n);
    r === 35 || r === 63 ? (t === void 0 && (t = e.substr(0, n)), t += Lo[r]) : t !== void 0 && (t += e[n]);
  }
  return t !== void 0 ? t : e;
}
function mr(e, t) {
  let n;
  return e.authority && e.path.length > 1 && e.scheme === "file" ? n = `//${e.authority}${e.path}` : e.path.charCodeAt(0) === 47 && (e.path.charCodeAt(1) >= 65 && e.path.charCodeAt(1) <= 90 || e.path.charCodeAt(1) >= 97 && e.path.charCodeAt(1) <= 122) && e.path.charCodeAt(2) === 58 ? t ? n = e.path.substr(1) : n = e.path[1].toLowerCase() + e.path.substr(2) : n = e.path, en && (n = n.replace(/\//g, "\\")), n;
}
function pr(e, t) {
  const n = t ? bu : mi;
  let r = "", { scheme: i, authority: s, path: a, query: o, fragment: u } = e;
  if (i && (r += i, r += ":"), (s || i === "file") && (r += Me, r += Me), s) {
    let l = s.indexOf("@");
    if (l !== -1) {
      const h = s.substr(0, l);
      s = s.substr(l + 1), l = h.lastIndexOf(":"), l === -1 ? r += n(h, !1, !1) : (r += n(h.substr(0, l), !1, !1), r += ":", r += n(h.substr(l + 1), !1, !0)), r += "@";
    }
    s = s.toLowerCase(), l = s.lastIndexOf(":"), l === -1 ? r += n(s, !1, !0) : (r += n(s.substr(0, l), !1, !0), r += s.substr(l));
  }
  if (a) {
    if (a.length >= 3 && a.charCodeAt(0) === 47 && a.charCodeAt(2) === 58) {
      const l = a.charCodeAt(1);
      l >= 65 && l <= 90 && (a = `/${String.fromCharCode(l + 32)}:${a.substr(3)}`);
    } else if (a.length >= 2 && a.charCodeAt(1) === 58) {
      const l = a.charCodeAt(0);
      l >= 65 && l <= 90 && (a = `${String.fromCharCode(l + 32)}:${a.substr(2)}`);
    }
    r += n(a, !0, !1);
  }
  return o && (r += "?", r += n(o, !1, !1)), u && (r += "#", r += t ? u : mi(u, !1, !1)), r;
}
function No(e) {
  try {
    return decodeURIComponent(e);
  } catch {
    return e.length > 3 ? e.substr(0, 3) + No(e.substr(3)) : e;
  }
}
const pi = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function hn(e) {
  return e.match(pi) ? e.replace(pi, (t) => No(t)) : e;
}
class we extends q {
  constructor(t, n, r, i) {
    super(t, n, r, i), this.selectionStartLineNumber = t, this.selectionStartColumn = n, this.positionLineNumber = r, this.positionColumn = i;
  }
  /**
   * Transform to a human-readable representation.
   */
  toString() {
    return "[" + this.selectionStartLineNumber + "," + this.selectionStartColumn + " -> " + this.positionLineNumber + "," + this.positionColumn + "]";
  }
  /**
   * Test if equals other selection.
   */
  equalsSelection(t) {
    return we.selectionsEqual(this, t);
  }
  /**
   * Test if the two selections are equal.
   */
  static selectionsEqual(t, n) {
    return t.selectionStartLineNumber === n.selectionStartLineNumber && t.selectionStartColumn === n.selectionStartColumn && t.positionLineNumber === n.positionLineNumber && t.positionColumn === n.positionColumn;
  }
  /**
   * Get directions (LTR or RTL).
   */
  getDirection() {
    return this.selectionStartLineNumber === this.startLineNumber && this.selectionStartColumn === this.startColumn ? 0 : 1;
  }
  /**
   * Create a new selection with a different `positionLineNumber` and `positionColumn`.
   */
  setEndPosition(t, n) {
    return this.getDirection() === 0 ? new we(this.startLineNumber, this.startColumn, t, n) : new we(t, n, this.startLineNumber, this.startColumn);
  }
  /**
   * Get the position at `positionLineNumber` and `positionColumn`.
   */
  getPosition() {
    return new Q(this.positionLineNumber, this.positionColumn);
  }
  /**
   * Get the position at the start of the selection.
  */
  getSelectionStart() {
    return new Q(this.selectionStartLineNumber, this.selectionStartColumn);
  }
  /**
   * Create a new selection with a different `selectionStartLineNumber` and `selectionStartColumn`.
   */
  setStartPosition(t, n) {
    return this.getDirection() === 0 ? new we(t, n, this.endLineNumber, this.endColumn) : new we(this.endLineNumber, this.endColumn, t, n);
  }
  // ----
  /**
   * Create a `Selection` from one or two positions
   */
  static fromPositions(t, n = t) {
    return new we(t.lineNumber, t.column, n.lineNumber, n.column);
  }
  /**
   * Creates a `Selection` from a range, given a direction.
   */
  static fromRange(t, n) {
    return n === 0 ? new we(t.startLineNumber, t.startColumn, t.endLineNumber, t.endColumn) : new we(t.endLineNumber, t.endColumn, t.startLineNumber, t.startColumn);
  }
  /**
   * Create a `Selection` from an `ISelection`.
   */
  static liftSelection(t) {
    return new we(t.selectionStartLineNumber, t.selectionStartColumn, t.positionLineNumber, t.positionColumn);
  }
  /**
   * `a` equals `b`.
   */
  static selectionsArrEqual(t, n) {
    if (t && !n || !t && n)
      return !1;
    if (!t && !n)
      return !0;
    if (t.length !== n.length)
      return !1;
    for (let r = 0, i = t.length; r < i; r++)
      if (!this.selectionsEqual(t[r], n[r]))
        return !1;
    return !0;
  }
  /**
   * Test if `obj` is an `ISelection`.
   */
  static isISelection(t) {
    return !!t && typeof t.selectionStartLineNumber == "number" && typeof t.selectionStartColumn == "number" && typeof t.positionLineNumber == "number" && typeof t.positionColumn == "number";
  }
  /**
   * Create with a direction.
   */
  static createWithDirection(t, n, r, i, s) {
    return s === 0 ? new we(t, n, r, i) : new we(r, i, t, n);
  }
}
const bi = /* @__PURE__ */ Object.create(null);
function c(e, t) {
  if (el(t)) {
    const n = bi[t];
    if (n === void 0)
      throw new Error(`${e} references an unknown codicon: ${t}`);
    t = n;
  }
  return bi[e] = t, { id: e };
}
const wu = {
  add: c("add", 6e4),
  plus: c("plus", 6e4),
  gistNew: c("gist-new", 6e4),
  repoCreate: c("repo-create", 6e4),
  lightbulb: c("lightbulb", 60001),
  lightBulb: c("light-bulb", 60001),
  repo: c("repo", 60002),
  repoDelete: c("repo-delete", 60002),
  gistFork: c("gist-fork", 60003),
  repoForked: c("repo-forked", 60003),
  gitPullRequest: c("git-pull-request", 60004),
  gitPullRequestAbandoned: c("git-pull-request-abandoned", 60004),
  recordKeys: c("record-keys", 60005),
  keyboard: c("keyboard", 60005),
  tag: c("tag", 60006),
  gitPullRequestLabel: c("git-pull-request-label", 60006),
  tagAdd: c("tag-add", 60006),
  tagRemove: c("tag-remove", 60006),
  person: c("person", 60007),
  personFollow: c("person-follow", 60007),
  personOutline: c("person-outline", 60007),
  personFilled: c("person-filled", 60007),
  sourceControl: c("source-control", 60008),
  mirror: c("mirror", 60009),
  mirrorPublic: c("mirror-public", 60009),
  star: c("star", 60010),
  starAdd: c("star-add", 60010),
  starDelete: c("star-delete", 60010),
  starEmpty: c("star-empty", 60010),
  comment: c("comment", 60011),
  commentAdd: c("comment-add", 60011),
  alert: c("alert", 60012),
  warning: c("warning", 60012),
  search: c("search", 60013),
  searchSave: c("search-save", 60013),
  logOut: c("log-out", 60014),
  signOut: c("sign-out", 60014),
  logIn: c("log-in", 60015),
  signIn: c("sign-in", 60015),
  eye: c("eye", 60016),
  eyeUnwatch: c("eye-unwatch", 60016),
  eyeWatch: c("eye-watch", 60016),
  circleFilled: c("circle-filled", 60017),
  primitiveDot: c("primitive-dot", 60017),
  closeDirty: c("close-dirty", 60017),
  debugBreakpoint: c("debug-breakpoint", 60017),
  debugBreakpointDisabled: c("debug-breakpoint-disabled", 60017),
  debugHint: c("debug-hint", 60017),
  terminalDecorationSuccess: c("terminal-decoration-success", 60017),
  primitiveSquare: c("primitive-square", 60018),
  edit: c("edit", 60019),
  pencil: c("pencil", 60019),
  info: c("info", 60020),
  issueOpened: c("issue-opened", 60020),
  gistPrivate: c("gist-private", 60021),
  gitForkPrivate: c("git-fork-private", 60021),
  lock: c("lock", 60021),
  mirrorPrivate: c("mirror-private", 60021),
  close: c("close", 60022),
  removeClose: c("remove-close", 60022),
  x: c("x", 60022),
  repoSync: c("repo-sync", 60023),
  sync: c("sync", 60023),
  clone: c("clone", 60024),
  desktopDownload: c("desktop-download", 60024),
  beaker: c("beaker", 60025),
  microscope: c("microscope", 60025),
  vm: c("vm", 60026),
  deviceDesktop: c("device-desktop", 60026),
  file: c("file", 60027),
  more: c("more", 60028),
  ellipsis: c("ellipsis", 60028),
  kebabHorizontal: c("kebab-horizontal", 60028),
  mailReply: c("mail-reply", 60029),
  reply: c("reply", 60029),
  organization: c("organization", 60030),
  organizationFilled: c("organization-filled", 60030),
  organizationOutline: c("organization-outline", 60030),
  newFile: c("new-file", 60031),
  fileAdd: c("file-add", 60031),
  newFolder: c("new-folder", 60032),
  fileDirectoryCreate: c("file-directory-create", 60032),
  trash: c("trash", 60033),
  trashcan: c("trashcan", 60033),
  history: c("history", 60034),
  clock: c("clock", 60034),
  folder: c("folder", 60035),
  fileDirectory: c("file-directory", 60035),
  symbolFolder: c("symbol-folder", 60035),
  logoGithub: c("logo-github", 60036),
  markGithub: c("mark-github", 60036),
  github: c("github", 60036),
  terminal: c("terminal", 60037),
  console: c("console", 60037),
  repl: c("repl", 60037),
  zap: c("zap", 60038),
  symbolEvent: c("symbol-event", 60038),
  error: c("error", 60039),
  stop: c("stop", 60039),
  variable: c("variable", 60040),
  symbolVariable: c("symbol-variable", 60040),
  array: c("array", 60042),
  symbolArray: c("symbol-array", 60042),
  symbolModule: c("symbol-module", 60043),
  symbolPackage: c("symbol-package", 60043),
  symbolNamespace: c("symbol-namespace", 60043),
  symbolObject: c("symbol-object", 60043),
  symbolMethod: c("symbol-method", 60044),
  symbolFunction: c("symbol-function", 60044),
  symbolConstructor: c("symbol-constructor", 60044),
  symbolBoolean: c("symbol-boolean", 60047),
  symbolNull: c("symbol-null", 60047),
  symbolNumeric: c("symbol-numeric", 60048),
  symbolNumber: c("symbol-number", 60048),
  symbolStructure: c("symbol-structure", 60049),
  symbolStruct: c("symbol-struct", 60049),
  symbolParameter: c("symbol-parameter", 60050),
  symbolTypeParameter: c("symbol-type-parameter", 60050),
  symbolKey: c("symbol-key", 60051),
  symbolText: c("symbol-text", 60051),
  symbolReference: c("symbol-reference", 60052),
  goToFile: c("go-to-file", 60052),
  symbolEnum: c("symbol-enum", 60053),
  symbolValue: c("symbol-value", 60053),
  symbolRuler: c("symbol-ruler", 60054),
  symbolUnit: c("symbol-unit", 60054),
  activateBreakpoints: c("activate-breakpoints", 60055),
  archive: c("archive", 60056),
  arrowBoth: c("arrow-both", 60057),
  arrowDown: c("arrow-down", 60058),
  arrowLeft: c("arrow-left", 60059),
  arrowRight: c("arrow-right", 60060),
  arrowSmallDown: c("arrow-small-down", 60061),
  arrowSmallLeft: c("arrow-small-left", 60062),
  arrowSmallRight: c("arrow-small-right", 60063),
  arrowSmallUp: c("arrow-small-up", 60064),
  arrowUp: c("arrow-up", 60065),
  bell: c("bell", 60066),
  bold: c("bold", 60067),
  book: c("book", 60068),
  bookmark: c("bookmark", 60069),
  debugBreakpointConditionalUnverified: c("debug-breakpoint-conditional-unverified", 60070),
  debugBreakpointConditional: c("debug-breakpoint-conditional", 60071),
  debugBreakpointConditionalDisabled: c("debug-breakpoint-conditional-disabled", 60071),
  debugBreakpointDataUnverified: c("debug-breakpoint-data-unverified", 60072),
  debugBreakpointData: c("debug-breakpoint-data", 60073),
  debugBreakpointDataDisabled: c("debug-breakpoint-data-disabled", 60073),
  debugBreakpointLogUnverified: c("debug-breakpoint-log-unverified", 60074),
  debugBreakpointLog: c("debug-breakpoint-log", 60075),
  debugBreakpointLogDisabled: c("debug-breakpoint-log-disabled", 60075),
  briefcase: c("briefcase", 60076),
  broadcast: c("broadcast", 60077),
  browser: c("browser", 60078),
  bug: c("bug", 60079),
  calendar: c("calendar", 60080),
  caseSensitive: c("case-sensitive", 60081),
  check: c("check", 60082),
  checklist: c("checklist", 60083),
  chevronDown: c("chevron-down", 60084),
  chevronLeft: c("chevron-left", 60085),
  chevronRight: c("chevron-right", 60086),
  chevronUp: c("chevron-up", 60087),
  chromeClose: c("chrome-close", 60088),
  chromeMaximize: c("chrome-maximize", 60089),
  chromeMinimize: c("chrome-minimize", 60090),
  chromeRestore: c("chrome-restore", 60091),
  circleOutline: c("circle-outline", 60092),
  circle: c("circle", 60092),
  debugBreakpointUnverified: c("debug-breakpoint-unverified", 60092),
  terminalDecorationIncomplete: c("terminal-decoration-incomplete", 60092),
  circleSlash: c("circle-slash", 60093),
  circuitBoard: c("circuit-board", 60094),
  clearAll: c("clear-all", 60095),
  clippy: c("clippy", 60096),
  closeAll: c("close-all", 60097),
  cloudDownload: c("cloud-download", 60098),
  cloudUpload: c("cloud-upload", 60099),
  code: c("code", 60100),
  collapseAll: c("collapse-all", 60101),
  colorMode: c("color-mode", 60102),
  commentDiscussion: c("comment-discussion", 60103),
  creditCard: c("credit-card", 60105),
  dash: c("dash", 60108),
  dashboard: c("dashboard", 60109),
  database: c("database", 60110),
  debugContinue: c("debug-continue", 60111),
  debugDisconnect: c("debug-disconnect", 60112),
  debugPause: c("debug-pause", 60113),
  debugRestart: c("debug-restart", 60114),
  debugStart: c("debug-start", 60115),
  debugStepInto: c("debug-step-into", 60116),
  debugStepOut: c("debug-step-out", 60117),
  debugStepOver: c("debug-step-over", 60118),
  debugStop: c("debug-stop", 60119),
  debug: c("debug", 60120),
  deviceCameraVideo: c("device-camera-video", 60121),
  deviceCamera: c("device-camera", 60122),
  deviceMobile: c("device-mobile", 60123),
  diffAdded: c("diff-added", 60124),
  diffIgnored: c("diff-ignored", 60125),
  diffModified: c("diff-modified", 60126),
  diffRemoved: c("diff-removed", 60127),
  diffRenamed: c("diff-renamed", 60128),
  diff: c("diff", 60129),
  diffSidebyside: c("diff-sidebyside", 60129),
  discard: c("discard", 60130),
  editorLayout: c("editor-layout", 60131),
  emptyWindow: c("empty-window", 60132),
  exclude: c("exclude", 60133),
  extensions: c("extensions", 60134),
  eyeClosed: c("eye-closed", 60135),
  fileBinary: c("file-binary", 60136),
  fileCode: c("file-code", 60137),
  fileMedia: c("file-media", 60138),
  filePdf: c("file-pdf", 60139),
  fileSubmodule: c("file-submodule", 60140),
  fileSymlinkDirectory: c("file-symlink-directory", 60141),
  fileSymlinkFile: c("file-symlink-file", 60142),
  fileZip: c("file-zip", 60143),
  files: c("files", 60144),
  filter: c("filter", 60145),
  flame: c("flame", 60146),
  foldDown: c("fold-down", 60147),
  foldUp: c("fold-up", 60148),
  fold: c("fold", 60149),
  folderActive: c("folder-active", 60150),
  folderOpened: c("folder-opened", 60151),
  gear: c("gear", 60152),
  gift: c("gift", 60153),
  gistSecret: c("gist-secret", 60154),
  gist: c("gist", 60155),
  gitCommit: c("git-commit", 60156),
  gitCompare: c("git-compare", 60157),
  compareChanges: c("compare-changes", 60157),
  gitMerge: c("git-merge", 60158),
  githubAction: c("github-action", 60159),
  githubAlt: c("github-alt", 60160),
  globe: c("globe", 60161),
  grabber: c("grabber", 60162),
  graph: c("graph", 60163),
  gripper: c("gripper", 60164),
  heart: c("heart", 60165),
  home: c("home", 60166),
  horizontalRule: c("horizontal-rule", 60167),
  hubot: c("hubot", 60168),
  inbox: c("inbox", 60169),
  issueReopened: c("issue-reopened", 60171),
  issues: c("issues", 60172),
  italic: c("italic", 60173),
  jersey: c("jersey", 60174),
  json: c("json", 60175),
  kebabVertical: c("kebab-vertical", 60176),
  key: c("key", 60177),
  law: c("law", 60178),
  lightbulbAutofix: c("lightbulb-autofix", 60179),
  linkExternal: c("link-external", 60180),
  link: c("link", 60181),
  listOrdered: c("list-ordered", 60182),
  listUnordered: c("list-unordered", 60183),
  liveShare: c("live-share", 60184),
  loading: c("loading", 60185),
  location: c("location", 60186),
  mailRead: c("mail-read", 60187),
  mail: c("mail", 60188),
  markdown: c("markdown", 60189),
  megaphone: c("megaphone", 60190),
  mention: c("mention", 60191),
  milestone: c("milestone", 60192),
  gitPullRequestMilestone: c("git-pull-request-milestone", 60192),
  mortarBoard: c("mortar-board", 60193),
  move: c("move", 60194),
  multipleWindows: c("multiple-windows", 60195),
  mute: c("mute", 60196),
  noNewline: c("no-newline", 60197),
  note: c("note", 60198),
  octoface: c("octoface", 60199),
  openPreview: c("open-preview", 60200),
  package: c("package", 60201),
  paintcan: c("paintcan", 60202),
  pin: c("pin", 60203),
  play: c("play", 60204),
  run: c("run", 60204),
  plug: c("plug", 60205),
  preserveCase: c("preserve-case", 60206),
  preview: c("preview", 60207),
  project: c("project", 60208),
  pulse: c("pulse", 60209),
  question: c("question", 60210),
  quote: c("quote", 60211),
  radioTower: c("radio-tower", 60212),
  reactions: c("reactions", 60213),
  references: c("references", 60214),
  refresh: c("refresh", 60215),
  regex: c("regex", 60216),
  remoteExplorer: c("remote-explorer", 60217),
  remote: c("remote", 60218),
  remove: c("remove", 60219),
  replaceAll: c("replace-all", 60220),
  replace: c("replace", 60221),
  repoClone: c("repo-clone", 60222),
  repoForcePush: c("repo-force-push", 60223),
  repoPull: c("repo-pull", 60224),
  repoPush: c("repo-push", 60225),
  report: c("report", 60226),
  requestChanges: c("request-changes", 60227),
  rocket: c("rocket", 60228),
  rootFolderOpened: c("root-folder-opened", 60229),
  rootFolder: c("root-folder", 60230),
  rss: c("rss", 60231),
  ruby: c("ruby", 60232),
  saveAll: c("save-all", 60233),
  saveAs: c("save-as", 60234),
  save: c("save", 60235),
  screenFull: c("screen-full", 60236),
  screenNormal: c("screen-normal", 60237),
  searchStop: c("search-stop", 60238),
  server: c("server", 60240),
  settingsGear: c("settings-gear", 60241),
  settings: c("settings", 60242),
  shield: c("shield", 60243),
  smiley: c("smiley", 60244),
  sortPrecedence: c("sort-precedence", 60245),
  splitHorizontal: c("split-horizontal", 60246),
  splitVertical: c("split-vertical", 60247),
  squirrel: c("squirrel", 60248),
  starFull: c("star-full", 60249),
  starHalf: c("star-half", 60250),
  symbolClass: c("symbol-class", 60251),
  symbolColor: c("symbol-color", 60252),
  symbolConstant: c("symbol-constant", 60253),
  symbolEnumMember: c("symbol-enum-member", 60254),
  symbolField: c("symbol-field", 60255),
  symbolFile: c("symbol-file", 60256),
  symbolInterface: c("symbol-interface", 60257),
  symbolKeyword: c("symbol-keyword", 60258),
  symbolMisc: c("symbol-misc", 60259),
  symbolOperator: c("symbol-operator", 60260),
  symbolProperty: c("symbol-property", 60261),
  wrench: c("wrench", 60261),
  wrenchSubaction: c("wrench-subaction", 60261),
  symbolSnippet: c("symbol-snippet", 60262),
  tasklist: c("tasklist", 60263),
  telescope: c("telescope", 60264),
  textSize: c("text-size", 60265),
  threeBars: c("three-bars", 60266),
  thumbsdown: c("thumbsdown", 60267),
  thumbsup: c("thumbsup", 60268),
  tools: c("tools", 60269),
  triangleDown: c("triangle-down", 60270),
  triangleLeft: c("triangle-left", 60271),
  triangleRight: c("triangle-right", 60272),
  triangleUp: c("triangle-up", 60273),
  twitter: c("twitter", 60274),
  unfold: c("unfold", 60275),
  unlock: c("unlock", 60276),
  unmute: c("unmute", 60277),
  unverified: c("unverified", 60278),
  verified: c("verified", 60279),
  versions: c("versions", 60280),
  vmActive: c("vm-active", 60281),
  vmOutline: c("vm-outline", 60282),
  vmRunning: c("vm-running", 60283),
  watch: c("watch", 60284),
  whitespace: c("whitespace", 60285),
  wholeWord: c("whole-word", 60286),
  window: c("window", 60287),
  wordWrap: c("word-wrap", 60288),
  zoomIn: c("zoom-in", 60289),
  zoomOut: c("zoom-out", 60290),
  listFilter: c("list-filter", 60291),
  listFlat: c("list-flat", 60292),
  listSelection: c("list-selection", 60293),
  selection: c("selection", 60293),
  listTree: c("list-tree", 60294),
  debugBreakpointFunctionUnverified: c("debug-breakpoint-function-unverified", 60295),
  debugBreakpointFunction: c("debug-breakpoint-function", 60296),
  debugBreakpointFunctionDisabled: c("debug-breakpoint-function-disabled", 60296),
  debugStackframeActive: c("debug-stackframe-active", 60297),
  circleSmallFilled: c("circle-small-filled", 60298),
  debugStackframeDot: c("debug-stackframe-dot", 60298),
  terminalDecorationMark: c("terminal-decoration-mark", 60298),
  debugStackframe: c("debug-stackframe", 60299),
  debugStackframeFocused: c("debug-stackframe-focused", 60299),
  debugBreakpointUnsupported: c("debug-breakpoint-unsupported", 60300),
  symbolString: c("symbol-string", 60301),
  debugReverseContinue: c("debug-reverse-continue", 60302),
  debugStepBack: c("debug-step-back", 60303),
  debugRestartFrame: c("debug-restart-frame", 60304),
  debugAlt: c("debug-alt", 60305),
  callIncoming: c("call-incoming", 60306),
  callOutgoing: c("call-outgoing", 60307),
  menu: c("menu", 60308),
  expandAll: c("expand-all", 60309),
  feedback: c("feedback", 60310),
  gitPullRequestReviewer: c("git-pull-request-reviewer", 60310),
  groupByRefType: c("group-by-ref-type", 60311),
  ungroupByRefType: c("ungroup-by-ref-type", 60312),
  account: c("account", 60313),
  gitPullRequestAssignee: c("git-pull-request-assignee", 60313),
  bellDot: c("bell-dot", 60314),
  debugConsole: c("debug-console", 60315),
  library: c("library", 60316),
  output: c("output", 60317),
  runAll: c("run-all", 60318),
  syncIgnored: c("sync-ignored", 60319),
  pinned: c("pinned", 60320),
  githubInverted: c("github-inverted", 60321),
  serverProcess: c("server-process", 60322),
  serverEnvironment: c("server-environment", 60323),
  pass: c("pass", 60324),
  issueClosed: c("issue-closed", 60324),
  stopCircle: c("stop-circle", 60325),
  playCircle: c("play-circle", 60326),
  record: c("record", 60327),
  debugAltSmall: c("debug-alt-small", 60328),
  vmConnect: c("vm-connect", 60329),
  cloud: c("cloud", 60330),
  merge: c("merge", 60331),
  export: c("export", 60332),
  graphLeft: c("graph-left", 60333),
  magnet: c("magnet", 60334),
  notebook: c("notebook", 60335),
  redo: c("redo", 60336),
  checkAll: c("check-all", 60337),
  pinnedDirty: c("pinned-dirty", 60338),
  passFilled: c("pass-filled", 60339),
  circleLargeFilled: c("circle-large-filled", 60340),
  circleLarge: c("circle-large", 60341),
  circleLargeOutline: c("circle-large-outline", 60341),
  combine: c("combine", 60342),
  gather: c("gather", 60342),
  table: c("table", 60343),
  variableGroup: c("variable-group", 60344),
  typeHierarchy: c("type-hierarchy", 60345),
  typeHierarchySub: c("type-hierarchy-sub", 60346),
  typeHierarchySuper: c("type-hierarchy-super", 60347),
  gitPullRequestCreate: c("git-pull-request-create", 60348),
  runAbove: c("run-above", 60349),
  runBelow: c("run-below", 60350),
  notebookTemplate: c("notebook-template", 60351),
  debugRerun: c("debug-rerun", 60352),
  workspaceTrusted: c("workspace-trusted", 60353),
  workspaceUntrusted: c("workspace-untrusted", 60354),
  workspaceUnknown: c("workspace-unknown", 60355),
  terminalCmd: c("terminal-cmd", 60356),
  terminalDebian: c("terminal-debian", 60357),
  terminalLinux: c("terminal-linux", 60358),
  terminalPowershell: c("terminal-powershell", 60359),
  terminalTmux: c("terminal-tmux", 60360),
  terminalUbuntu: c("terminal-ubuntu", 60361),
  terminalBash: c("terminal-bash", 60362),
  arrowSwap: c("arrow-swap", 60363),
  copy: c("copy", 60364),
  personAdd: c("person-add", 60365),
  filterFilled: c("filter-filled", 60366),
  wand: c("wand", 60367),
  debugLineByLine: c("debug-line-by-line", 60368),
  inspect: c("inspect", 60369),
  layers: c("layers", 60370),
  layersDot: c("layers-dot", 60371),
  layersActive: c("layers-active", 60372),
  compass: c("compass", 60373),
  compassDot: c("compass-dot", 60374),
  compassActive: c("compass-active", 60375),
  azure: c("azure", 60376),
  issueDraft: c("issue-draft", 60377),
  gitPullRequestClosed: c("git-pull-request-closed", 60378),
  gitPullRequestDraft: c("git-pull-request-draft", 60379),
  debugAll: c("debug-all", 60380),
  debugCoverage: c("debug-coverage", 60381),
  runErrors: c("run-errors", 60382),
  folderLibrary: c("folder-library", 60383),
  debugContinueSmall: c("debug-continue-small", 60384),
  beakerStop: c("beaker-stop", 60385),
  graphLine: c("graph-line", 60386),
  graphScatter: c("graph-scatter", 60387),
  pieChart: c("pie-chart", 60388),
  bracket: c("bracket", 60175),
  bracketDot: c("bracket-dot", 60389),
  bracketError: c("bracket-error", 60390),
  lockSmall: c("lock-small", 60391),
  azureDevops: c("azure-devops", 60392),
  verifiedFilled: c("verified-filled", 60393),
  newline: c("newline", 60394),
  layout: c("layout", 60395),
  layoutActivitybarLeft: c("layout-activitybar-left", 60396),
  layoutActivitybarRight: c("layout-activitybar-right", 60397),
  layoutPanelLeft: c("layout-panel-left", 60398),
  layoutPanelCenter: c("layout-panel-center", 60399),
  layoutPanelJustify: c("layout-panel-justify", 60400),
  layoutPanelRight: c("layout-panel-right", 60401),
  layoutPanel: c("layout-panel", 60402),
  layoutSidebarLeft: c("layout-sidebar-left", 60403),
  layoutSidebarRight: c("layout-sidebar-right", 60404),
  layoutStatusbar: c("layout-statusbar", 60405),
  layoutMenubar: c("layout-menubar", 60406),
  layoutCentered: c("layout-centered", 60407),
  target: c("target", 60408),
  indent: c("indent", 60409),
  recordSmall: c("record-small", 60410),
  errorSmall: c("error-small", 60411),
  terminalDecorationError: c("terminal-decoration-error", 60411),
  arrowCircleDown: c("arrow-circle-down", 60412),
  arrowCircleLeft: c("arrow-circle-left", 60413),
  arrowCircleRight: c("arrow-circle-right", 60414),
  arrowCircleUp: c("arrow-circle-up", 60415),
  layoutSidebarRightOff: c("layout-sidebar-right-off", 60416),
  layoutPanelOff: c("layout-panel-off", 60417),
  layoutSidebarLeftOff: c("layout-sidebar-left-off", 60418),
  blank: c("blank", 60419),
  heartFilled: c("heart-filled", 60420),
  map: c("map", 60421),
  mapHorizontal: c("map-horizontal", 60421),
  foldHorizontal: c("fold-horizontal", 60421),
  mapFilled: c("map-filled", 60422),
  mapHorizontalFilled: c("map-horizontal-filled", 60422),
  foldHorizontalFilled: c("fold-horizontal-filled", 60422),
  circleSmall: c("circle-small", 60423),
  bellSlash: c("bell-slash", 60424),
  bellSlashDot: c("bell-slash-dot", 60425),
  commentUnresolved: c("comment-unresolved", 60426),
  gitPullRequestGoToChanges: c("git-pull-request-go-to-changes", 60427),
  gitPullRequestNewChanges: c("git-pull-request-new-changes", 60428),
  searchFuzzy: c("search-fuzzy", 60429),
  commentDraft: c("comment-draft", 60430),
  send: c("send", 60431),
  sparkle: c("sparkle", 60432),
  insert: c("insert", 60433),
  mic: c("mic", 60434),
  thumbsdownFilled: c("thumbsdown-filled", 60435),
  thumbsupFilled: c("thumbsup-filled", 60436),
  coffee: c("coffee", 60437),
  snake: c("snake", 60438),
  game: c("game", 60439),
  vr: c("vr", 60440),
  chip: c("chip", 60441),
  piano: c("piano", 60442),
  music: c("music", 60443),
  micFilled: c("mic-filled", 60444),
  repoFetch: c("repo-fetch", 60445),
  copilot: c("copilot", 60446),
  lightbulbSparkle: c("lightbulb-sparkle", 60447),
  robot: c("robot", 60448),
  sparkleFilled: c("sparkle-filled", 60449),
  diffSingle: c("diff-single", 60450),
  diffMultiple: c("diff-multiple", 60451),
  surroundWith: c("surround-with", 60452),
  share: c("share", 60453),
  gitStash: c("git-stash", 60454),
  gitStashApply: c("git-stash-apply", 60455),
  gitStashPop: c("git-stash-pop", 60456),
  vscode: c("vscode", 60457),
  vscodeInsiders: c("vscode-insiders", 60458),
  codeOss: c("code-oss", 60459),
  runCoverage: c("run-coverage", 60460),
  runAllCoverage: c("run-all-coverage", 60461),
  coverage: c("coverage", 60462),
  githubProject: c("github-project", 60463),
  mapVertical: c("map-vertical", 60464),
  foldVertical: c("fold-vertical", 60464),
  mapVerticalFilled: c("map-vertical-filled", 60465),
  foldVerticalFilled: c("fold-vertical-filled", 60465),
  goToSearch: c("go-to-search", 60466),
  percentage: c("percentage", 60467),
  sortPercentage: c("sort-percentage", 60467),
  attach: c("attach", 60468),
  goToEditingSession: c("go-to-editing-session", 60469),
  editSession: c("edit-session", 60470),
  codeReview: c("code-review", 60471),
  copilotWarning: c("copilot-warning", 60472),
  python: c("python", 60473),
  copilotLarge: c("copilot-large", 60474),
  copilotWarningLarge: c("copilot-warning-large", 60475),
  keyboardTab: c("keyboard-tab", 60476),
  copilotBlocked: c("copilot-blocked", 60477),
  copilotNotConnected: c("copilot-not-connected", 60478),
  flag: c("flag", 60479),
  lightbulbEmpty: c("lightbulb-empty", 60480),
  symbolMethodArrow: c("symbol-method-arrow", 60481),
  copilotUnavailable: c("copilot-unavailable", 60482),
  repoPinned: c("repo-pinned", 60483),
  keyboardTabAbove: c("keyboard-tab-above", 60484),
  keyboardTabBelow: c("keyboard-tab-below", 60485),
  gitPullRequestDone: c("git-pull-request-done", 60486),
  mcp: c("mcp", 60487),
  extensionsLarge: c("extensions-large", 60488),
  layoutPanelDock: c("layout-panel-dock", 60489),
  layoutSidebarLeftDock: c("layout-sidebar-left-dock", 60490),
  layoutSidebarRightDock: c("layout-sidebar-right-dock", 60491),
  copilotInProgress: c("copilot-in-progress", 60492),
  copilotError: c("copilot-error", 60493),
  copilotSuccess: c("copilot-success", 60494),
  chatSparkle: c("chat-sparkle", 60495),
  searchSparkle: c("search-sparkle", 60496),
  editSparkle: c("edit-sparkle", 60497),
  copilotSnooze: c("copilot-snooze", 60498),
  sendToRemoteAgent: c("send-to-remote-agent", 60499),
  commentDiscussionSparkle: c("comment-discussion-sparkle", 60500),
  chatSparkleWarning: c("chat-sparkle-warning", 60501),
  chatSparkleError: c("chat-sparkle-error", 60502),
  collection: c("collection", 60503),
  newCollection: c("new-collection", 60504),
  thinking: c("thinking", 60505),
  build: c("build", 60506),
  commentDiscussionQuote: c("comment-discussion-quote", 60507),
  cursor: c("cursor", 60508),
  eraser: c("eraser", 60509),
  fileText: c("file-text", 60510),
  gitLens: c("git-lens", 60511),
  quotes: c("quotes", 60512),
  rename: c("rename", 60513),
  runWithDeps: c("run-with-deps", 60514),
  debugConnected: c("debug-connected", 60515),
  strikethrough: c("strikethrough", 60516),
  openInProduct: c("open-in-product", 60517),
  indexZero: c("index-zero", 60518),
  agent: c("agent", 60519),
  editCode: c("edit-code", 60520),
  repoSelected: c("repo-selected", 60521),
  skip: c("skip", 60522),
  mergeInto: c("merge-into", 60523),
  gitBranchChanges: c("git-branch-changes", 60524),
  gitBranchStagedChanges: c("git-branch-staged-changes", 60525),
  gitBranchConflicts: c("git-branch-conflicts", 60526),
  gitBranch: c("git-branch", 60527),
  gitBranchCreate: c("git-branch-create", 60527),
  gitBranchDelete: c("git-branch-delete", 60527),
  searchLarge: c("search-large", 60528),
  terminalGitBash: c("terminal-git-bash", 60529)
}, xu = {
  dialogError: c("dialog-error", "error"),
  dialogWarning: c("dialog-warning", "warning"),
  dialogInfo: c("dialog-info", "info"),
  dialogClose: c("dialog-close", "close"),
  treeItemExpanded: c("tree-item-expanded", "chevron-down"),
  // collapsed is done with rotation
  treeFilterOnTypeOn: c("tree-filter-on-type-on", "list-filter"),
  treeFilterOnTypeOff: c("tree-filter-on-type-off", "list-selection"),
  treeFilterClear: c("tree-filter-clear", "close"),
  treeItemLoading: c("tree-item-loading", "loading"),
  menuSelection: c("menu-selection", "check"),
  menuSubmenu: c("menu-submenu", "chevron-right"),
  menuBarMore: c("menubar-more", "more"),
  scrollbarButtonLeft: c("scrollbar-button-left", "triangle-left"),
  scrollbarButtonRight: c("scrollbar-button-right", "triangle-right"),
  scrollbarButtonUp: c("scrollbar-button-up", "triangle-up"),
  scrollbarButtonDown: c("scrollbar-button-down", "triangle-down"),
  toolBarMore: c("toolbar-more", "more"),
  quickInputBack: c("quick-input-back", "arrow-left"),
  dropDownButton: c("drop-down-button", 60084),
  symbolCustomColor: c("symbol-customcolor", 60252),
  exportIcon: c("export", 60332),
  workspaceUnspecified: c("workspace-unspecified", 60355),
  newLine: c("newline", 60394),
  thumbsDownFilled: c("thumbsdown-filled", 60435),
  thumbsUpFilled: c("thumbsup-filled", 60436),
  gitFetch: c("git-fetch", 60445),
  lightbulbSparkleAutofix: c("lightbulb-sparkle-autofix", 60447),
  debugBreakpointPending: c("debug-breakpoint-pending", 60377)
}, O = {
  ...wu,
  ...xu
};
class vu {
  constructor() {
    this._tokenizationSupports = /* @__PURE__ */ new Map(), this._factories = /* @__PURE__ */ new Map(), this._onDidChange = new Fe(), this.onDidChange = this._onDidChange.event, this._colorMap = null;
  }
  handleChange(t) {
    this._onDidChange.fire({
      changedLanguages: t,
      changedColorMap: !1
    });
  }
  register(t, n) {
    return this._tokenizationSupports.set(t, n), this.handleChange([t]), _n(() => {
      this._tokenizationSupports.get(t) === n && (this._tokenizationSupports.delete(t), this.handleChange([t]));
    });
  }
  get(t) {
    return this._tokenizationSupports.get(t) || null;
  }
  registerFactory(t, n) {
    var i;
    (i = this._factories.get(t)) == null || i.dispose();
    const r = new yu(this, t, n);
    return this._factories.set(t, r), _n(() => {
      const s = this._factories.get(t);
      !s || s !== r || (this._factories.delete(t), s.dispose());
    });
  }
  async getOrCreate(t) {
    const n = this.get(t);
    if (n)
      return n;
    const r = this._factories.get(t);
    return !r || r.isResolved ? null : (await r.resolve(), this.get(t));
  }
  isResolved(t) {
    if (this.get(t))
      return !0;
    const r = this._factories.get(t);
    return !!(!r || r.isResolved);
  }
  setColorMap(t) {
    this._colorMap = t, this._onDidChange.fire({
      changedLanguages: Array.from(this._tokenizationSupports.keys()),
      changedColorMap: !0
    });
  }
  getColorMap() {
    return this._colorMap;
  }
  getDefaultBackground() {
    return this._colorMap && this._colorMap.length > 2 ? this._colorMap[
      2
      /* ColorId.DefaultBackground */
    ] : null;
  }
}
class yu extends ct {
  get isResolved() {
    return this._isResolved;
  }
  constructor(t, n, r) {
    super(), this._registry = t, this._languageId = n, this._factory = r, this._isDisposed = !1, this._resolvePromise = null, this._isResolved = !1;
  }
  dispose() {
    this._isDisposed = !0, super.dispose();
  }
  async resolve() {
    return this._resolvePromise || (this._resolvePromise = this._create()), this._resolvePromise;
  }
  async _create() {
    const t = await this._factory.tokenizationSupport;
    this._isResolved = !0, t && !this._isDisposed && this._register(this._registry.register(this._languageId, t));
  }
}
class Lu {
  constructor(t, n, r) {
    this.offset = t, this.type = n, this.language = r, this._tokenBrand = void 0;
  }
  toString() {
    return "(" + this.offset + ", " + this.type + ")";
  }
}
var wi;
(function(e) {
  e[e.Increase = 0] = "Increase", e[e.Decrease = 1] = "Decrease";
})(wi || (wi = {}));
var xi;
(function(e) {
  const t = /* @__PURE__ */ new Map();
  t.set(0, O.symbolMethod), t.set(1, O.symbolFunction), t.set(2, O.symbolConstructor), t.set(3, O.symbolField), t.set(4, O.symbolVariable), t.set(5, O.symbolClass), t.set(6, O.symbolStruct), t.set(7, O.symbolInterface), t.set(8, O.symbolModule), t.set(9, O.symbolProperty), t.set(10, O.symbolEvent), t.set(11, O.symbolOperator), t.set(12, O.symbolUnit), t.set(13, O.symbolValue), t.set(15, O.symbolEnum), t.set(14, O.symbolConstant), t.set(15, O.symbolEnum), t.set(16, O.symbolEnumMember), t.set(17, O.symbolKeyword), t.set(28, O.symbolSnippet), t.set(18, O.symbolText), t.set(19, O.symbolColor), t.set(20, O.symbolFile), t.set(21, O.symbolReference), t.set(22, O.symbolCustomColor), t.set(23, O.symbolFolder), t.set(24, O.symbolTypeParameter), t.set(25, O.account), t.set(26, O.issues), t.set(27, O.tools);
  function n(a) {
    let o = t.get(a);
    return o || (console.info("No codicon found for CompletionItemKind " + a), o = O.symbolProperty), o;
  }
  e.toIcon = n;
  function r(a) {
    switch (a) {
      case 0:
        return $(728, "Method");
      case 1:
        return $(729, "Function");
      case 2:
        return $(730, "Constructor");
      case 3:
        return $(731, "Field");
      case 4:
        return $(732, "Variable");
      case 5:
        return $(733, "Class");
      case 6:
        return $(734, "Struct");
      case 7:
        return $(735, "Interface");
      case 8:
        return $(736, "Module");
      case 9:
        return $(737, "Property");
      case 10:
        return $(738, "Event");
      case 11:
        return $(739, "Operator");
      case 12:
        return $(740, "Unit");
      case 13:
        return $(741, "Value");
      case 14:
        return $(742, "Constant");
      case 15:
        return $(743, "Enum");
      case 16:
        return $(744, "Enum Member");
      case 17:
        return $(745, "Keyword");
      case 18:
        return $(746, "Text");
      case 19:
        return $(747, "Color");
      case 20:
        return $(748, "File");
      case 21:
        return $(749, "Reference");
      case 22:
        return $(750, "Custom Color");
      case 23:
        return $(751, "Folder");
      case 24:
        return $(752, "Type Parameter");
      case 25:
        return $(753, "User");
      case 26:
        return $(754, "Issue");
      case 27:
        return $(755, "Tool");
      case 28:
        return $(756, "Snippet");
      default:
        return "";
    }
  }
  e.toLabel = r;
  const i = /* @__PURE__ */ new Map();
  i.set(
    "method",
    0
    /* CompletionItemKind.Method */
  ), i.set(
    "function",
    1
    /* CompletionItemKind.Function */
  ), i.set(
    "constructor",
    2
    /* CompletionItemKind.Constructor */
  ), i.set(
    "field",
    3
    /* CompletionItemKind.Field */
  ), i.set(
    "variable",
    4
    /* CompletionItemKind.Variable */
  ), i.set(
    "class",
    5
    /* CompletionItemKind.Class */
  ), i.set(
    "struct",
    6
    /* CompletionItemKind.Struct */
  ), i.set(
    "interface",
    7
    /* CompletionItemKind.Interface */
  ), i.set(
    "module",
    8
    /* CompletionItemKind.Module */
  ), i.set(
    "property",
    9
    /* CompletionItemKind.Property */
  ), i.set(
    "event",
    10
    /* CompletionItemKind.Event */
  ), i.set(
    "operator",
    11
    /* CompletionItemKind.Operator */
  ), i.set(
    "unit",
    12
    /* CompletionItemKind.Unit */
  ), i.set(
    "value",
    13
    /* CompletionItemKind.Value */
  ), i.set(
    "constant",
    14
    /* CompletionItemKind.Constant */
  ), i.set(
    "enum",
    15
    /* CompletionItemKind.Enum */
  ), i.set(
    "enum-member",
    16
    /* CompletionItemKind.EnumMember */
  ), i.set(
    "enumMember",
    16
    /* CompletionItemKind.EnumMember */
  ), i.set(
    "keyword",
    17
    /* CompletionItemKind.Keyword */
  ), i.set(
    "snippet",
    28
    /* CompletionItemKind.Snippet */
  ), i.set(
    "text",
    18
    /* CompletionItemKind.Text */
  ), i.set(
    "color",
    19
    /* CompletionItemKind.Color */
  ), i.set(
    "file",
    20
    /* CompletionItemKind.File */
  ), i.set(
    "reference",
    21
    /* CompletionItemKind.Reference */
  ), i.set(
    "customcolor",
    22
    /* CompletionItemKind.Customcolor */
  ), i.set(
    "folder",
    23
    /* CompletionItemKind.Folder */
  ), i.set(
    "type-parameter",
    24
    /* CompletionItemKind.TypeParameter */
  ), i.set(
    "typeParameter",
    24
    /* CompletionItemKind.TypeParameter */
  ), i.set(
    "account",
    25
    /* CompletionItemKind.User */
  ), i.set(
    "issue",
    26
    /* CompletionItemKind.Issue */
  ), i.set(
    "tool",
    27
    /* CompletionItemKind.Tool */
  );
  function s(a, o) {
    let u = i.get(a);
    return typeof u > "u" && !o && (u = 9), u;
  }
  e.fromString = s;
})(xi || (xi = {}));
var vi;
(function(e) {
  e[e.Automatic = 0] = "Automatic", e[e.Explicit = 1] = "Explicit";
})(vi || (vi = {}));
var yi;
(function(e) {
  e[e.Code = 1] = "Code", e[e.Label = 2] = "Label";
})(yi || (yi = {}));
var Li;
(function(e) {
  e[e.Accepted = 0] = "Accepted", e[e.Rejected = 1] = "Rejected", e[e.Ignored = 2] = "Ignored";
})(Li || (Li = {}));
var Ni;
(function(e) {
  e[e.Automatic = 0] = "Automatic", e[e.PasteAs = 1] = "PasteAs";
})(Ni || (Ni = {}));
var _i;
(function(e) {
  e[e.Invoke = 1] = "Invoke", e[e.TriggerCharacter = 2] = "TriggerCharacter", e[e.ContentChange = 3] = "ContentChange";
})(_i || (_i = {}));
var Si;
(function(e) {
  e[e.Text = 0] = "Text", e[e.Read = 1] = "Read", e[e.Write = 2] = "Write";
})(Si || (Si = {}));
$(757, "array"), $(758, "boolean"), $(759, "class"), $(760, "constant"), $(761, "constructor"), $(762, "enumeration"), $(763, "enumeration member"), $(764, "event"), $(765, "field"), $(766, "file"), $(767, "function"), $(768, "interface"), $(769, "key"), $(770, "method"), $(771, "module"), $(772, "namespace"), $(773, "null"), $(774, "number"), $(775, "object"), $(776, "operator"), $(777, "package"), $(778, "property"), $(779, "string"), $(780, "struct"), $(781, "type parameter"), $(782, "variable");
var Ai;
(function(e) {
  const t = /* @__PURE__ */ new Map();
  t.set(0, O.symbolFile), t.set(1, O.symbolModule), t.set(2, O.symbolNamespace), t.set(3, O.symbolPackage), t.set(4, O.symbolClass), t.set(5, O.symbolMethod), t.set(6, O.symbolProperty), t.set(7, O.symbolField), t.set(8, O.symbolConstructor), t.set(9, O.symbolEnum), t.set(10, O.symbolInterface), t.set(11, O.symbolFunction), t.set(12, O.symbolVariable), t.set(13, O.symbolConstant), t.set(14, O.symbolString), t.set(15, O.symbolNumber), t.set(16, O.symbolBoolean), t.set(17, O.symbolArray), t.set(18, O.symbolObject), t.set(19, O.symbolKey), t.set(20, O.symbolNull), t.set(21, O.symbolEnumMember), t.set(22, O.symbolStruct), t.set(23, O.symbolEvent), t.set(24, O.symbolOperator), t.set(25, O.symbolTypeParameter);
  function n(s) {
    let a = t.get(s);
    return a || (console.info("No codicon found for SymbolKind " + s), a = O.symbolProperty), a;
  }
  e.toIcon = n;
  const r = /* @__PURE__ */ new Map();
  r.set(
    0,
    20
    /* CompletionItemKind.File */
  ), r.set(
    1,
    8
    /* CompletionItemKind.Module */
  ), r.set(
    2,
    8
    /* CompletionItemKind.Module */
  ), r.set(
    3,
    8
    /* CompletionItemKind.Module */
  ), r.set(
    4,
    5
    /* CompletionItemKind.Class */
  ), r.set(
    5,
    0
    /* CompletionItemKind.Method */
  ), r.set(
    6,
    9
    /* CompletionItemKind.Property */
  ), r.set(
    7,
    3
    /* CompletionItemKind.Field */
  ), r.set(
    8,
    2
    /* CompletionItemKind.Constructor */
  ), r.set(
    9,
    15
    /* CompletionItemKind.Enum */
  ), r.set(
    10,
    7
    /* CompletionItemKind.Interface */
  ), r.set(
    11,
    1
    /* CompletionItemKind.Function */
  ), r.set(
    12,
    4
    /* CompletionItemKind.Variable */
  ), r.set(
    13,
    14
    /* CompletionItemKind.Constant */
  ), r.set(
    14,
    18
    /* CompletionItemKind.Text */
  ), r.set(
    15,
    13
    /* CompletionItemKind.Value */
  ), r.set(
    16,
    13
    /* CompletionItemKind.Value */
  ), r.set(
    17,
    13
    /* CompletionItemKind.Value */
  ), r.set(
    18,
    13
    /* CompletionItemKind.Value */
  ), r.set(
    19,
    17
    /* CompletionItemKind.Keyword */
  ), r.set(
    20,
    13
    /* CompletionItemKind.Value */
  ), r.set(
    21,
    16
    /* CompletionItemKind.EnumMember */
  ), r.set(
    22,
    6
    /* CompletionItemKind.Struct */
  ), r.set(
    23,
    10
    /* CompletionItemKind.Event */
  ), r.set(
    24,
    11
    /* CompletionItemKind.Operator */
  ), r.set(
    25,
    24
    /* CompletionItemKind.TypeParameter */
  );
  function i(s) {
    let a = r.get(s);
    return a === void 0 && (console.info("No completion kind found for SymbolKind " + s), a = 20), a;
  }
  e.toCompletionKind = i;
})(Ai || (Ai = {}));
var he;
let G1 = (he = class {
  /**
   * Returns a {@link FoldingRangeKind} for the given value.
   *
   * @param value of the kind.
   */
  static fromValue(t) {
    switch (t) {
      case "comment":
        return he.Comment;
      case "imports":
        return he.Imports;
      case "region":
        return he.Region;
    }
    return new he(t);
  }
  /**
   * Creates a new {@link FoldingRangeKind}.
   *
   * @param value of the kind.
   */
  constructor(t) {
    this.value = t;
  }
}, he.Comment = new he("comment"), he.Imports = new he("imports"), he.Region = new he("region"), he);
var ki;
(function(e) {
  e[e.AIGenerated = 1] = "AIGenerated";
})(ki || (ki = {}));
var Ri;
(function(e) {
  e[e.Invoke = 0] = "Invoke", e[e.Automatic = 1] = "Automatic";
})(Ri || (Ri = {}));
var Ei;
(function(e) {
  function t(n) {
    return !n || typeof n != "object" ? !1 : typeof n.id == "string" && typeof n.title == "string";
  }
  e.is = t;
})(Ei || (Ei = {}));
var Mi;
(function(e) {
  e[e.Type = 1] = "Type", e[e.Parameter = 2] = "Parameter";
})(Mi || (Mi = {}));
new vu();
var Ti;
(function(e) {
  e[e.Unknown = 0] = "Unknown", e[e.Disabled = 1] = "Disabled", e[e.Enabled = 2] = "Enabled";
})(Ti || (Ti = {}));
var Pi;
(function(e) {
  e[e.Invoke = 1] = "Invoke", e[e.Auto = 2] = "Auto";
})(Pi || (Pi = {}));
var Ci;
(function(e) {
  e[e.None = 0] = "None", e[e.KeepWhitespace = 1] = "KeepWhitespace", e[e.InsertAsSnippet = 4] = "InsertAsSnippet";
})(Ci || (Ci = {}));
var Ii;
(function(e) {
  e[e.Method = 0] = "Method", e[e.Function = 1] = "Function", e[e.Constructor = 2] = "Constructor", e[e.Field = 3] = "Field", e[e.Variable = 4] = "Variable", e[e.Class = 5] = "Class", e[e.Struct = 6] = "Struct", e[e.Interface = 7] = "Interface", e[e.Module = 8] = "Module", e[e.Property = 9] = "Property", e[e.Event = 10] = "Event", e[e.Operator = 11] = "Operator", e[e.Unit = 12] = "Unit", e[e.Value = 13] = "Value", e[e.Constant = 14] = "Constant", e[e.Enum = 15] = "Enum", e[e.EnumMember = 16] = "EnumMember", e[e.Keyword = 17] = "Keyword", e[e.Text = 18] = "Text", e[e.Color = 19] = "Color", e[e.File = 20] = "File", e[e.Reference = 21] = "Reference", e[e.Customcolor = 22] = "Customcolor", e[e.Folder = 23] = "Folder", e[e.TypeParameter = 24] = "TypeParameter", e[e.User = 25] = "User", e[e.Issue = 26] = "Issue", e[e.Tool = 27] = "Tool", e[e.Snippet = 28] = "Snippet";
})(Ii || (Ii = {}));
var Fi;
(function(e) {
  e[e.Deprecated = 1] = "Deprecated";
})(Fi || (Fi = {}));
var Vi;
(function(e) {
  e[e.Invoke = 0] = "Invoke", e[e.TriggerCharacter = 1] = "TriggerCharacter", e[e.TriggerForIncompleteCompletions = 2] = "TriggerForIncompleteCompletions";
})(Vi || (Vi = {}));
var Di;
(function(e) {
  e[e.EXACT = 0] = "EXACT", e[e.ABOVE = 1] = "ABOVE", e[e.BELOW = 2] = "BELOW";
})(Di || (Di = {}));
var Oi;
(function(e) {
  e[e.NotSet = 0] = "NotSet", e[e.ContentFlush = 1] = "ContentFlush", e[e.RecoverFromMarkers = 2] = "RecoverFromMarkers", e[e.Explicit = 3] = "Explicit", e[e.Paste = 4] = "Paste", e[e.Undo = 5] = "Undo", e[e.Redo = 6] = "Redo";
})(Oi || (Oi = {}));
var $i;
(function(e) {
  e[e.LF = 1] = "LF", e[e.CRLF = 2] = "CRLF";
})($i || ($i = {}));
var Bi;
(function(e) {
  e[e.Text = 0] = "Text", e[e.Read = 1] = "Read", e[e.Write = 2] = "Write";
})(Bi || (Bi = {}));
var Ui;
(function(e) {
  e[e.None = 0] = "None", e[e.Keep = 1] = "Keep", e[e.Brackets = 2] = "Brackets", e[e.Advanced = 3] = "Advanced", e[e.Full = 4] = "Full";
})(Ui || (Ui = {}));
var qi;
(function(e) {
  e[e.acceptSuggestionOnCommitCharacter = 0] = "acceptSuggestionOnCommitCharacter", e[e.acceptSuggestionOnEnter = 1] = "acceptSuggestionOnEnter", e[e.accessibilitySupport = 2] = "accessibilitySupport", e[e.accessibilityPageSize = 3] = "accessibilityPageSize", e[e.allowOverflow = 4] = "allowOverflow", e[e.allowVariableLineHeights = 5] = "allowVariableLineHeights", e[e.allowVariableFonts = 6] = "allowVariableFonts", e[e.allowVariableFontsInAccessibilityMode = 7] = "allowVariableFontsInAccessibilityMode", e[e.ariaLabel = 8] = "ariaLabel", e[e.ariaRequired = 9] = "ariaRequired", e[e.autoClosingBrackets = 10] = "autoClosingBrackets", e[e.autoClosingComments = 11] = "autoClosingComments", e[e.screenReaderAnnounceInlineSuggestion = 12] = "screenReaderAnnounceInlineSuggestion", e[e.autoClosingDelete = 13] = "autoClosingDelete", e[e.autoClosingOvertype = 14] = "autoClosingOvertype", e[e.autoClosingQuotes = 15] = "autoClosingQuotes", e[e.autoIndent = 16] = "autoIndent", e[e.autoIndentOnPaste = 17] = "autoIndentOnPaste", e[e.autoIndentOnPasteWithinString = 18] = "autoIndentOnPasteWithinString", e[e.automaticLayout = 19] = "automaticLayout", e[e.autoSurround = 20] = "autoSurround", e[e.bracketPairColorization = 21] = "bracketPairColorization", e[e.guides = 22] = "guides", e[e.codeLens = 23] = "codeLens", e[e.codeLensFontFamily = 24] = "codeLensFontFamily", e[e.codeLensFontSize = 25] = "codeLensFontSize", e[e.colorDecorators = 26] = "colorDecorators", e[e.colorDecoratorsLimit = 27] = "colorDecoratorsLimit", e[e.columnSelection = 28] = "columnSelection", e[e.comments = 29] = "comments", e[e.contextmenu = 30] = "contextmenu", e[e.copyWithSyntaxHighlighting = 31] = "copyWithSyntaxHighlighting", e[e.cursorBlinking = 32] = "cursorBlinking", e[e.cursorSmoothCaretAnimation = 33] = "cursorSmoothCaretAnimation", e[e.cursorStyle = 34] = "cursorStyle", e[e.cursorSurroundingLines = 35] = "cursorSurroundingLines", e[e.cursorSurroundingLinesStyle = 36] = "cursorSurroundingLinesStyle", e[e.cursorWidth = 37] = "cursorWidth", e[e.cursorHeight = 38] = "cursorHeight", e[e.disableLayerHinting = 39] = "disableLayerHinting", e[e.disableMonospaceOptimizations = 40] = "disableMonospaceOptimizations", e[e.domReadOnly = 41] = "domReadOnly", e[e.dragAndDrop = 42] = "dragAndDrop", e[e.dropIntoEditor = 43] = "dropIntoEditor", e[e.editContext = 44] = "editContext", e[e.emptySelectionClipboard = 45] = "emptySelectionClipboard", e[e.experimentalGpuAcceleration = 46] = "experimentalGpuAcceleration", e[e.experimentalWhitespaceRendering = 47] = "experimentalWhitespaceRendering", e[e.extraEditorClassName = 48] = "extraEditorClassName", e[e.fastScrollSensitivity = 49] = "fastScrollSensitivity", e[e.find = 50] = "find", e[e.fixedOverflowWidgets = 51] = "fixedOverflowWidgets", e[e.folding = 52] = "folding", e[e.foldingStrategy = 53] = "foldingStrategy", e[e.foldingHighlight = 54] = "foldingHighlight", e[e.foldingImportsByDefault = 55] = "foldingImportsByDefault", e[e.foldingMaximumRegions = 56] = "foldingMaximumRegions", e[e.unfoldOnClickAfterEndOfLine = 57] = "unfoldOnClickAfterEndOfLine", e[e.fontFamily = 58] = "fontFamily", e[e.fontInfo = 59] = "fontInfo", e[e.fontLigatures = 60] = "fontLigatures", e[e.fontSize = 61] = "fontSize", e[e.fontWeight = 62] = "fontWeight", e[e.fontVariations = 63] = "fontVariations", e[e.formatOnPaste = 64] = "formatOnPaste", e[e.formatOnType = 65] = "formatOnType", e[e.glyphMargin = 66] = "glyphMargin", e[e.gotoLocation = 67] = "gotoLocation", e[e.hideCursorInOverviewRuler = 68] = "hideCursorInOverviewRuler", e[e.hover = 69] = "hover", e[e.inDiffEditor = 70] = "inDiffEditor", e[e.inlineSuggest = 71] = "inlineSuggest", e[e.letterSpacing = 72] = "letterSpacing", e[e.lightbulb = 73] = "lightbulb", e[e.lineDecorationsWidth = 74] = "lineDecorationsWidth", e[e.lineHeight = 75] = "lineHeight", e[e.lineNumbers = 76] = "lineNumbers", e[e.lineNumbersMinChars = 77] = "lineNumbersMinChars", e[e.linkedEditing = 78] = "linkedEditing", e[e.links = 79] = "links", e[e.matchBrackets = 80] = "matchBrackets", e[e.minimap = 81] = "minimap", e[e.mouseStyle = 82] = "mouseStyle", e[e.mouseWheelScrollSensitivity = 83] = "mouseWheelScrollSensitivity", e[e.mouseWheelZoom = 84] = "mouseWheelZoom", e[e.multiCursorMergeOverlapping = 85] = "multiCursorMergeOverlapping", e[e.multiCursorModifier = 86] = "multiCursorModifier", e[e.mouseMiddleClickAction = 87] = "mouseMiddleClickAction", e[e.multiCursorPaste = 88] = "multiCursorPaste", e[e.multiCursorLimit = 89] = "multiCursorLimit", e[e.occurrencesHighlight = 90] = "occurrencesHighlight", e[e.occurrencesHighlightDelay = 91] = "occurrencesHighlightDelay", e[e.overtypeCursorStyle = 92] = "overtypeCursorStyle", e[e.overtypeOnPaste = 93] = "overtypeOnPaste", e[e.overviewRulerBorder = 94] = "overviewRulerBorder", e[e.overviewRulerLanes = 95] = "overviewRulerLanes", e[e.padding = 96] = "padding", e[e.pasteAs = 97] = "pasteAs", e[e.parameterHints = 98] = "parameterHints", e[e.peekWidgetDefaultFocus = 99] = "peekWidgetDefaultFocus", e[e.placeholder = 100] = "placeholder", e[e.definitionLinkOpensInPeek = 101] = "definitionLinkOpensInPeek", e[e.quickSuggestions = 102] = "quickSuggestions", e[e.quickSuggestionsDelay = 103] = "quickSuggestionsDelay", e[e.readOnly = 104] = "readOnly", e[e.readOnlyMessage = 105] = "readOnlyMessage", e[e.renameOnType = 106] = "renameOnType", e[e.renderRichScreenReaderContent = 107] = "renderRichScreenReaderContent", e[e.renderControlCharacters = 108] = "renderControlCharacters", e[e.renderFinalNewline = 109] = "renderFinalNewline", e[e.renderLineHighlight = 110] = "renderLineHighlight", e[e.renderLineHighlightOnlyWhenFocus = 111] = "renderLineHighlightOnlyWhenFocus", e[e.renderValidationDecorations = 112] = "renderValidationDecorations", e[e.renderWhitespace = 113] = "renderWhitespace", e[e.revealHorizontalRightPadding = 114] = "revealHorizontalRightPadding", e[e.roundedSelection = 115] = "roundedSelection", e[e.rulers = 116] = "rulers", e[e.scrollbar = 117] = "scrollbar", e[e.scrollBeyondLastColumn = 118] = "scrollBeyondLastColumn", e[e.scrollBeyondLastLine = 119] = "scrollBeyondLastLine", e[e.scrollPredominantAxis = 120] = "scrollPredominantAxis", e[e.selectionClipboard = 121] = "selectionClipboard", e[e.selectionHighlight = 122] = "selectionHighlight", e[e.selectionHighlightMaxLength = 123] = "selectionHighlightMaxLength", e[e.selectionHighlightMultiline = 124] = "selectionHighlightMultiline", e[e.selectOnLineNumbers = 125] = "selectOnLineNumbers", e[e.showFoldingControls = 126] = "showFoldingControls", e[e.showUnused = 127] = "showUnused", e[e.snippetSuggestions = 128] = "snippetSuggestions", e[e.smartSelect = 129] = "smartSelect", e[e.smoothScrolling = 130] = "smoothScrolling", e[e.stickyScroll = 131] = "stickyScroll", e[e.stickyTabStops = 132] = "stickyTabStops", e[e.stopRenderingLineAfter = 133] = "stopRenderingLineAfter", e[e.suggest = 134] = "suggest", e[e.suggestFontSize = 135] = "suggestFontSize", e[e.suggestLineHeight = 136] = "suggestLineHeight", e[e.suggestOnTriggerCharacters = 137] = "suggestOnTriggerCharacters", e[e.suggestSelection = 138] = "suggestSelection", e[e.tabCompletion = 139] = "tabCompletion", e[e.tabIndex = 140] = "tabIndex", e[e.trimWhitespaceOnDelete = 141] = "trimWhitespaceOnDelete", e[e.unicodeHighlighting = 142] = "unicodeHighlighting", e[e.unusualLineTerminators = 143] = "unusualLineTerminators", e[e.useShadowDOM = 144] = "useShadowDOM", e[e.useTabStops = 145] = "useTabStops", e[e.wordBreak = 146] = "wordBreak", e[e.wordSegmenterLocales = 147] = "wordSegmenterLocales", e[e.wordSeparators = 148] = "wordSeparators", e[e.wordWrap = 149] = "wordWrap", e[e.wordWrapBreakAfterCharacters = 150] = "wordWrapBreakAfterCharacters", e[e.wordWrapBreakBeforeCharacters = 151] = "wordWrapBreakBeforeCharacters", e[e.wordWrapColumn = 152] = "wordWrapColumn", e[e.wordWrapOverride1 = 153] = "wordWrapOverride1", e[e.wordWrapOverride2 = 154] = "wordWrapOverride2", e[e.wrappingIndent = 155] = "wrappingIndent", e[e.wrappingStrategy = 156] = "wrappingStrategy", e[e.showDeprecated = 157] = "showDeprecated", e[e.inertialScroll = 158] = "inertialScroll", e[e.inlayHints = 159] = "inlayHints", e[e.wrapOnEscapedLineFeeds = 160] = "wrapOnEscapedLineFeeds", e[e.effectiveCursorStyle = 161] = "effectiveCursorStyle", e[e.editorClassName = 162] = "editorClassName", e[e.pixelRatio = 163] = "pixelRatio", e[e.tabFocusMode = 164] = "tabFocusMode", e[e.layoutInfo = 165] = "layoutInfo", e[e.wrappingInfo = 166] = "wrappingInfo", e[e.defaultColorDecorators = 167] = "defaultColorDecorators", e[e.colorDecoratorsActivatedOn = 168] = "colorDecoratorsActivatedOn", e[e.inlineCompletionsAccessibilityVerbose = 169] = "inlineCompletionsAccessibilityVerbose", e[e.effectiveEditContext = 170] = "effectiveEditContext", e[e.scrollOnMiddleClick = 171] = "scrollOnMiddleClick", e[e.effectiveAllowVariableFonts = 172] = "effectiveAllowVariableFonts";
})(qi || (qi = {}));
var ji;
(function(e) {
  e[e.TextDefined = 0] = "TextDefined", e[e.LF = 1] = "LF", e[e.CRLF = 2] = "CRLF";
})(ji || (ji = {}));
var Wi;
(function(e) {
  e[e.LF = 0] = "LF", e[e.CRLF = 1] = "CRLF";
})(Wi || (Wi = {}));
var Hi;
(function(e) {
  e[e.Left = 1] = "Left", e[e.Center = 2] = "Center", e[e.Right = 3] = "Right";
})(Hi || (Hi = {}));
var zi;
(function(e) {
  e[e.Increase = 0] = "Increase", e[e.Decrease = 1] = "Decrease";
})(zi || (zi = {}));
var Gi;
(function(e) {
  e[e.None = 0] = "None", e[e.Indent = 1] = "Indent", e[e.IndentOutdent = 2] = "IndentOutdent", e[e.Outdent = 3] = "Outdent";
})(Gi || (Gi = {}));
var Ji;
(function(e) {
  e[e.Both = 0] = "Both", e[e.Right = 1] = "Right", e[e.Left = 2] = "Left", e[e.None = 3] = "None";
})(Ji || (Ji = {}));
var Xi;
(function(e) {
  e[e.Type = 1] = "Type", e[e.Parameter = 2] = "Parameter";
})(Xi || (Xi = {}));
var Qi;
(function(e) {
  e[e.Accepted = 0] = "Accepted", e[e.Rejected = 1] = "Rejected", e[e.Ignored = 2] = "Ignored";
})(Qi || (Qi = {}));
var Zi;
(function(e) {
  e[e.Code = 1] = "Code", e[e.Label = 2] = "Label";
})(Zi || (Zi = {}));
var Yi;
(function(e) {
  e[e.Automatic = 0] = "Automatic", e[e.Explicit = 1] = "Explicit";
})(Yi || (Yi = {}));
var br;
(function(e) {
  e[e.DependsOnKbLayout = -1] = "DependsOnKbLayout", e[e.Unknown = 0] = "Unknown", e[e.Backspace = 1] = "Backspace", e[e.Tab = 2] = "Tab", e[e.Enter = 3] = "Enter", e[e.Shift = 4] = "Shift", e[e.Ctrl = 5] = "Ctrl", e[e.Alt = 6] = "Alt", e[e.PauseBreak = 7] = "PauseBreak", e[e.CapsLock = 8] = "CapsLock", e[e.Escape = 9] = "Escape", e[e.Space = 10] = "Space", e[e.PageUp = 11] = "PageUp", e[e.PageDown = 12] = "PageDown", e[e.End = 13] = "End", e[e.Home = 14] = "Home", e[e.LeftArrow = 15] = "LeftArrow", e[e.UpArrow = 16] = "UpArrow", e[e.RightArrow = 17] = "RightArrow", e[e.DownArrow = 18] = "DownArrow", e[e.Insert = 19] = "Insert", e[e.Delete = 20] = "Delete", e[e.Digit0 = 21] = "Digit0", e[e.Digit1 = 22] = "Digit1", e[e.Digit2 = 23] = "Digit2", e[e.Digit3 = 24] = "Digit3", e[e.Digit4 = 25] = "Digit4", e[e.Digit5 = 26] = "Digit5", e[e.Digit6 = 27] = "Digit6", e[e.Digit7 = 28] = "Digit7", e[e.Digit8 = 29] = "Digit8", e[e.Digit9 = 30] = "Digit9", e[e.KeyA = 31] = "KeyA", e[e.KeyB = 32] = "KeyB", e[e.KeyC = 33] = "KeyC", e[e.KeyD = 34] = "KeyD", e[e.KeyE = 35] = "KeyE", e[e.KeyF = 36] = "KeyF", e[e.KeyG = 37] = "KeyG", e[e.KeyH = 38] = "KeyH", e[e.KeyI = 39] = "KeyI", e[e.KeyJ = 40] = "KeyJ", e[e.KeyK = 41] = "KeyK", e[e.KeyL = 42] = "KeyL", e[e.KeyM = 43] = "KeyM", e[e.KeyN = 44] = "KeyN", e[e.KeyO = 45] = "KeyO", e[e.KeyP = 46] = "KeyP", e[e.KeyQ = 47] = "KeyQ", e[e.KeyR = 48] = "KeyR", e[e.KeyS = 49] = "KeyS", e[e.KeyT = 50] = "KeyT", e[e.KeyU = 51] = "KeyU", e[e.KeyV = 52] = "KeyV", e[e.KeyW = 53] = "KeyW", e[e.KeyX = 54] = "KeyX", e[e.KeyY = 55] = "KeyY", e[e.KeyZ = 56] = "KeyZ", e[e.Meta = 57] = "Meta", e[e.ContextMenu = 58] = "ContextMenu", e[e.F1 = 59] = "F1", e[e.F2 = 60] = "F2", e[e.F3 = 61] = "F3", e[e.F4 = 62] = "F4", e[e.F5 = 63] = "F5", e[e.F6 = 64] = "F6", e[e.F7 = 65] = "F7", e[e.F8 = 66] = "F8", e[e.F9 = 67] = "F9", e[e.F10 = 68] = "F10", e[e.F11 = 69] = "F11", e[e.F12 = 70] = "F12", e[e.F13 = 71] = "F13", e[e.F14 = 72] = "F14", e[e.F15 = 73] = "F15", e[e.F16 = 74] = "F16", e[e.F17 = 75] = "F17", e[e.F18 = 76] = "F18", e[e.F19 = 77] = "F19", e[e.F20 = 78] = "F20", e[e.F21 = 79] = "F21", e[e.F22 = 80] = "F22", e[e.F23 = 81] = "F23", e[e.F24 = 82] = "F24", e[e.NumLock = 83] = "NumLock", e[e.ScrollLock = 84] = "ScrollLock", e[e.Semicolon = 85] = "Semicolon", e[e.Equal = 86] = "Equal", e[e.Comma = 87] = "Comma", e[e.Minus = 88] = "Minus", e[e.Period = 89] = "Period", e[e.Slash = 90] = "Slash", e[e.Backquote = 91] = "Backquote", e[e.BracketLeft = 92] = "BracketLeft", e[e.Backslash = 93] = "Backslash", e[e.BracketRight = 94] = "BracketRight", e[e.Quote = 95] = "Quote", e[e.OEM_8 = 96] = "OEM_8", e[e.IntlBackslash = 97] = "IntlBackslash", e[e.Numpad0 = 98] = "Numpad0", e[e.Numpad1 = 99] = "Numpad1", e[e.Numpad2 = 100] = "Numpad2", e[e.Numpad3 = 101] = "Numpad3", e[e.Numpad4 = 102] = "Numpad4", e[e.Numpad5 = 103] = "Numpad5", e[e.Numpad6 = 104] = "Numpad6", e[e.Numpad7 = 105] = "Numpad7", e[e.Numpad8 = 106] = "Numpad8", e[e.Numpad9 = 107] = "Numpad9", e[e.NumpadMultiply = 108] = "NumpadMultiply", e[e.NumpadAdd = 109] = "NumpadAdd", e[e.NUMPAD_SEPARATOR = 110] = "NUMPAD_SEPARATOR", e[e.NumpadSubtract = 111] = "NumpadSubtract", e[e.NumpadDecimal = 112] = "NumpadDecimal", e[e.NumpadDivide = 113] = "NumpadDivide", e[e.KEY_IN_COMPOSITION = 114] = "KEY_IN_COMPOSITION", e[e.ABNT_C1 = 115] = "ABNT_C1", e[e.ABNT_C2 = 116] = "ABNT_C2", e[e.AudioVolumeMute = 117] = "AudioVolumeMute", e[e.AudioVolumeUp = 118] = "AudioVolumeUp", e[e.AudioVolumeDown = 119] = "AudioVolumeDown", e[e.BrowserSearch = 120] = "BrowserSearch", e[e.BrowserHome = 121] = "BrowserHome", e[e.BrowserBack = 122] = "BrowserBack", e[e.BrowserForward = 123] = "BrowserForward", e[e.MediaTrackNext = 124] = "MediaTrackNext", e[e.MediaTrackPrevious = 125] = "MediaTrackPrevious", e[e.MediaStop = 126] = "MediaStop", e[e.MediaPlayPause = 127] = "MediaPlayPause", e[e.LaunchMediaPlayer = 128] = "LaunchMediaPlayer", e[e.LaunchMail = 129] = "LaunchMail", e[e.LaunchApp2 = 130] = "LaunchApp2", e[e.Clear = 131] = "Clear", e[e.MAX_VALUE = 132] = "MAX_VALUE";
})(br || (br = {}));
var wr;
(function(e) {
  e[e.Hint = 1] = "Hint", e[e.Info = 2] = "Info", e[e.Warning = 4] = "Warning", e[e.Error = 8] = "Error";
})(wr || (wr = {}));
var xr;
(function(e) {
  e[e.Unnecessary = 1] = "Unnecessary", e[e.Deprecated = 2] = "Deprecated";
})(xr || (xr = {}));
var Ki;
(function(e) {
  e[e.Inline = 1] = "Inline", e[e.Gutter = 2] = "Gutter";
})(Ki || (Ki = {}));
var es;
(function(e) {
  e[e.Normal = 1] = "Normal", e[e.Underlined = 2] = "Underlined";
})(es || (es = {}));
var ts;
(function(e) {
  e[e.UNKNOWN = 0] = "UNKNOWN", e[e.TEXTAREA = 1] = "TEXTAREA", e[e.GUTTER_GLYPH_MARGIN = 2] = "GUTTER_GLYPH_MARGIN", e[e.GUTTER_LINE_NUMBERS = 3] = "GUTTER_LINE_NUMBERS", e[e.GUTTER_LINE_DECORATIONS = 4] = "GUTTER_LINE_DECORATIONS", e[e.GUTTER_VIEW_ZONE = 5] = "GUTTER_VIEW_ZONE", e[e.CONTENT_TEXT = 6] = "CONTENT_TEXT", e[e.CONTENT_EMPTY = 7] = "CONTENT_EMPTY", e[e.CONTENT_VIEW_ZONE = 8] = "CONTENT_VIEW_ZONE", e[e.CONTENT_WIDGET = 9] = "CONTENT_WIDGET", e[e.OVERVIEW_RULER = 10] = "OVERVIEW_RULER", e[e.SCROLLBAR = 11] = "SCROLLBAR", e[e.OVERLAY_WIDGET = 12] = "OVERLAY_WIDGET", e[e.OUTSIDE_EDITOR = 13] = "OUTSIDE_EDITOR";
})(ts || (ts = {}));
var ns;
(function(e) {
  e[e.AIGenerated = 1] = "AIGenerated";
})(ns || (ns = {}));
var rs;
(function(e) {
  e[e.Invoke = 0] = "Invoke", e[e.Automatic = 1] = "Automatic";
})(rs || (rs = {}));
var is;
(function(e) {
  e[e.TOP_RIGHT_CORNER = 0] = "TOP_RIGHT_CORNER", e[e.BOTTOM_RIGHT_CORNER = 1] = "BOTTOM_RIGHT_CORNER", e[e.TOP_CENTER = 2] = "TOP_CENTER";
})(is || (is = {}));
var ss;
(function(e) {
  e[e.Left = 1] = "Left", e[e.Center = 2] = "Center", e[e.Right = 4] = "Right", e[e.Full = 7] = "Full";
})(ss || (ss = {}));
var as;
(function(e) {
  e[e.Word = 0] = "Word", e[e.Line = 1] = "Line", e[e.Suggest = 2] = "Suggest";
})(as || (as = {}));
var os;
(function(e) {
  e[e.Left = 0] = "Left", e[e.Right = 1] = "Right", e[e.None = 2] = "None", e[e.LeftOfInjectedText = 3] = "LeftOfInjectedText", e[e.RightOfInjectedText = 4] = "RightOfInjectedText";
})(os || (os = {}));
var ls;
(function(e) {
  e[e.Off = 0] = "Off", e[e.On = 1] = "On", e[e.Relative = 2] = "Relative", e[e.Interval = 3] = "Interval", e[e.Custom = 4] = "Custom";
})(ls || (ls = {}));
var us;
(function(e) {
  e[e.None = 0] = "None", e[e.Text = 1] = "Text", e[e.Blocks = 2] = "Blocks";
})(us || (us = {}));
var cs;
(function(e) {
  e[e.Smooth = 0] = "Smooth", e[e.Immediate = 1] = "Immediate";
})(cs || (cs = {}));
var fs;
(function(e) {
  e[e.Auto = 1] = "Auto", e[e.Hidden = 2] = "Hidden", e[e.Visible = 3] = "Visible";
})(fs || (fs = {}));
var vr;
(function(e) {
  e[e.LTR = 0] = "LTR", e[e.RTL = 1] = "RTL";
})(vr || (vr = {}));
var hs;
(function(e) {
  e.Off = "off", e.OnCode = "onCode", e.On = "on";
})(hs || (hs = {}));
var ds;
(function(e) {
  e[e.Invoke = 1] = "Invoke", e[e.TriggerCharacter = 2] = "TriggerCharacter", e[e.ContentChange = 3] = "ContentChange";
})(ds || (ds = {}));
var gs;
(function(e) {
  e[e.File = 0] = "File", e[e.Module = 1] = "Module", e[e.Namespace = 2] = "Namespace", e[e.Package = 3] = "Package", e[e.Class = 4] = "Class", e[e.Method = 5] = "Method", e[e.Property = 6] = "Property", e[e.Field = 7] = "Field", e[e.Constructor = 8] = "Constructor", e[e.Enum = 9] = "Enum", e[e.Interface = 10] = "Interface", e[e.Function = 11] = "Function", e[e.Variable = 12] = "Variable", e[e.Constant = 13] = "Constant", e[e.String = 14] = "String", e[e.Number = 15] = "Number", e[e.Boolean = 16] = "Boolean", e[e.Array = 17] = "Array", e[e.Object = 18] = "Object", e[e.Key = 19] = "Key", e[e.Null = 20] = "Null", e[e.EnumMember = 21] = "EnumMember", e[e.Struct = 22] = "Struct", e[e.Event = 23] = "Event", e[e.Operator = 24] = "Operator", e[e.TypeParameter = 25] = "TypeParameter";
})(gs || (gs = {}));
var ms;
(function(e) {
  e[e.Deprecated = 1] = "Deprecated";
})(ms || (ms = {}));
var ps;
(function(e) {
  e[e.LTR = 0] = "LTR", e[e.RTL = 1] = "RTL";
})(ps || (ps = {}));
var bs;
(function(e) {
  e[e.Hidden = 0] = "Hidden", e[e.Blink = 1] = "Blink", e[e.Smooth = 2] = "Smooth", e[e.Phase = 3] = "Phase", e[e.Expand = 4] = "Expand", e[e.Solid = 5] = "Solid";
})(bs || (bs = {}));
var ws;
(function(e) {
  e[e.Line = 1] = "Line", e[e.Block = 2] = "Block", e[e.Underline = 3] = "Underline", e[e.LineThin = 4] = "LineThin", e[e.BlockOutline = 5] = "BlockOutline", e[e.UnderlineThin = 6] = "UnderlineThin";
})(ws || (ws = {}));
var xs;
(function(e) {
  e[e.AlwaysGrowsWhenTypingAtEdges = 0] = "AlwaysGrowsWhenTypingAtEdges", e[e.NeverGrowsWhenTypingAtEdges = 1] = "NeverGrowsWhenTypingAtEdges", e[e.GrowsOnlyWhenTypingBefore = 2] = "GrowsOnlyWhenTypingBefore", e[e.GrowsOnlyWhenTypingAfter = 3] = "GrowsOnlyWhenTypingAfter";
})(xs || (xs = {}));
var vs;
(function(e) {
  e[e.None = 0] = "None", e[e.Same = 1] = "Same", e[e.Indent = 2] = "Indent", e[e.DeepIndent = 3] = "DeepIndent";
})(vs || (vs = {}));
const kt = class kt {
  static chord(t, n) {
    return Kl(t, n);
  }
};
kt.CtrlCmd = 2048, kt.Shift = 1024, kt.Alt = 512, kt.WinCtrl = 256;
let yr = kt;
function Nu() {
  return {
    editor: void 0,
    // undefined override expected here
    languages: void 0,
    // undefined override expected here
    CancellationTokenSource: Xl,
    Emitter: Fe,
    KeyCode: br,
    KeyMod: yr,
    Position: Q,
    Range: q,
    Selection: we,
    SelectionDirection: vr,
    MarkerSeverity: wr,
    MarkerTag: xr,
    Uri: Kr,
    Token: Lu
  };
}
var ys;
class _u {
  constructor() {
    this[ys] = "LinkedMap", this._map = /* @__PURE__ */ new Map(), this._head = void 0, this._tail = void 0, this._size = 0, this._state = 0;
  }
  clear() {
    this._map.clear(), this._head = void 0, this._tail = void 0, this._size = 0, this._state++;
  }
  isEmpty() {
    return !this._head && !this._tail;
  }
  get size() {
    return this._size;
  }
  get first() {
    var t;
    return (t = this._head) == null ? void 0 : t.value;
  }
  get last() {
    var t;
    return (t = this._tail) == null ? void 0 : t.value;
  }
  has(t) {
    return this._map.has(t);
  }
  get(t, n = 0) {
    const r = this._map.get(t);
    if (r)
      return n !== 0 && this.touch(r, n), r.value;
  }
  set(t, n, r = 0) {
    let i = this._map.get(t);
    if (i)
      i.value = n, r !== 0 && this.touch(i, r);
    else {
      switch (i = { key: t, value: n, next: void 0, previous: void 0 }, r) {
        case 0:
          this.addItemLast(i);
          break;
        case 1:
          this.addItemFirst(i);
          break;
        case 2:
          this.addItemLast(i);
          break;
        default:
          this.addItemLast(i);
          break;
      }
      this._map.set(t, i), this._size++;
    }
    return this;
  }
  delete(t) {
    return !!this.remove(t);
  }
  remove(t) {
    const n = this._map.get(t);
    if (n)
      return this._map.delete(t), this.removeItem(n), this._size--, n.value;
  }
  shift() {
    if (!this._head && !this._tail)
      return;
    if (!this._head || !this._tail)
      throw new Error("Invalid list");
    const t = this._head;
    return this._map.delete(t.key), this.removeItem(t), this._size--, t.value;
  }
  forEach(t, n) {
    const r = this._state;
    let i = this._head;
    for (; i; ) {
      if (n ? t.bind(n)(i.value, i.key, this) : t(i.value, i.key, this), this._state !== r)
        throw new Error("LinkedMap got modified during iteration.");
      i = i.next;
    }
  }
  keys() {
    const t = this, n = this._state;
    let r = this._head;
    const i = {
      [Symbol.iterator]() {
        return i;
      },
      next() {
        if (t._state !== n)
          throw new Error("LinkedMap got modified during iteration.");
        if (r) {
          const s = { value: r.key, done: !1 };
          return r = r.next, s;
        } else
          return { value: void 0, done: !0 };
      }
    };
    return i;
  }
  values() {
    const t = this, n = this._state;
    let r = this._head;
    const i = {
      [Symbol.iterator]() {
        return i;
      },
      next() {
        if (t._state !== n)
          throw new Error("LinkedMap got modified during iteration.");
        if (r) {
          const s = { value: r.value, done: !1 };
          return r = r.next, s;
        } else
          return { value: void 0, done: !0 };
      }
    };
    return i;
  }
  entries() {
    const t = this, n = this._state;
    let r = this._head;
    const i = {
      [Symbol.iterator]() {
        return i;
      },
      next() {
        if (t._state !== n)
          throw new Error("LinkedMap got modified during iteration.");
        if (r) {
          const s = { value: [r.key, r.value], done: !1 };
          return r = r.next, s;
        } else
          return { value: void 0, done: !0 };
      }
    };
    return i;
  }
  [(ys = Symbol.toStringTag, Symbol.iterator)]() {
    return this.entries();
  }
  trimOld(t) {
    if (t >= this.size)
      return;
    if (t === 0) {
      this.clear();
      return;
    }
    let n = this._head, r = this.size;
    for (; n && r > t; )
      this._map.delete(n.key), n = n.next, r--;
    this._head = n, this._size = r, n && (n.previous = void 0), this._state++;
  }
  trimNew(t) {
    if (t >= this.size)
      return;
    if (t === 0) {
      this.clear();
      return;
    }
    let n = this._tail, r = this.size;
    for (; n && r > t; )
      this._map.delete(n.key), n = n.previous, r--;
    this._tail = n, this._size = r, n && (n.next = void 0), this._state++;
  }
  addItemFirst(t) {
    if (!this._head && !this._tail)
      this._tail = t;
    else if (this._head)
      t.next = this._head, this._head.previous = t;
    else
      throw new Error("Invalid list");
    this._head = t, this._state++;
  }
  addItemLast(t) {
    if (!this._head && !this._tail)
      this._head = t;
    else if (this._tail)
      t.previous = this._tail, this._tail.next = t;
    else
      throw new Error("Invalid list");
    this._tail = t, this._state++;
  }
  removeItem(t) {
    if (t === this._head && t === this._tail)
      this._head = void 0, this._tail = void 0;
    else if (t === this._head) {
      if (!t.next)
        throw new Error("Invalid list");
      t.next.previous = void 0, this._head = t.next;
    } else if (t === this._tail) {
      if (!t.previous)
        throw new Error("Invalid list");
      t.previous.next = void 0, this._tail = t.previous;
    } else {
      const n = t.next, r = t.previous;
      if (!n || !r)
        throw new Error("Invalid list");
      n.previous = r, r.next = n;
    }
    t.next = void 0, t.previous = void 0, this._state++;
  }
  touch(t, n) {
    if (!this._head || !this._tail)
      throw new Error("Invalid list");
    if (!(n !== 1 && n !== 2)) {
      if (n === 1) {
        if (t === this._head)
          return;
        const r = t.next, i = t.previous;
        t === this._tail ? (i.next = void 0, this._tail = i) : (r.previous = i, i.next = r), t.previous = void 0, t.next = this._head, this._head.previous = t, this._head = t, this._state++;
      } else if (n === 2) {
        if (t === this._tail)
          return;
        const r = t.next, i = t.previous;
        t === this._head ? (r.previous = void 0, this._head = r) : (r.previous = i, i.next = r), t.next = void 0, t.previous = this._tail, this._tail.next = t, this._tail = t, this._state++;
      }
    }
  }
  toJSON() {
    const t = [];
    return this.forEach((n, r) => {
      t.push([r, n]);
    }), t;
  }
  fromJSON(t) {
    this.clear();
    for (const [n, r] of t)
      this.set(n, r);
  }
}
class Su extends _u {
  constructor(t, n = 1) {
    super(), this._limit = t, this._ratio = Math.min(Math.max(0, n), 1);
  }
  get limit() {
    return this._limit;
  }
  set limit(t) {
    this._limit = t, this.checkTrim();
  }
  get(t, n = 2) {
    return super.get(t, n);
  }
  peek(t) {
    return super.get(
      t,
      0
      /* Touch.None */
    );
  }
  set(t, n) {
    return super.set(
      t,
      n,
      2
      /* Touch.AsNew */
    ), this;
  }
  checkTrim() {
    this.size > this._limit && this.trim(Math.round(this._limit * this._ratio));
  }
}
class Au extends Su {
  constructor(t, n = 1) {
    super(t, n);
  }
  trim(t) {
    this.trimOld(t);
  }
  set(t, n) {
    return super.set(t, n), this.checkTrim(), this;
  }
}
class ku {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  add(t, n) {
    let r = this.map.get(t);
    r || (r = /* @__PURE__ */ new Set(), this.map.set(t, r)), r.add(n);
  }
  delete(t, n) {
    const r = this.map.get(t);
    r && (r.delete(n), r.size === 0 && this.map.delete(t));
  }
  forEach(t, n) {
    const r = this.map.get(t);
    r && r.forEach(n);
  }
}
new Au(10);
var Ls;
(function(e) {
  e[e.Left = 1] = "Left", e[e.Center = 2] = "Center", e[e.Right = 4] = "Right", e[e.Full = 7] = "Full";
})(Ls || (Ls = {}));
var Ns;
(function(e) {
  e[e.Left = 1] = "Left", e[e.Center = 2] = "Center", e[e.Right = 3] = "Right";
})(Ns || (Ns = {}));
var _s;
(function(e) {
  e[e.LTR = 0] = "LTR", e[e.RTL = 1] = "RTL";
})(_s || (_s = {}));
var Ss;
(function(e) {
  e[e.Both = 0] = "Both", e[e.Right = 1] = "Right", e[e.Left = 2] = "Left", e[e.None = 3] = "None";
})(Ss || (Ss = {}));
function Ru(e) {
  if (!e || e.length === 0)
    return !1;
  for (let t = 0, n = e.length; t < n; t++) {
    const r = e.charCodeAt(t);
    if (r === 10)
      return !0;
    if (r === 92) {
      if (t++, t >= n)
        break;
      const i = e.charCodeAt(t);
      if (i === 110 || i === 114 || i === 87)
        return !0;
    }
  }
  return !1;
}
function Eu(e, t, n, r, i) {
  if (r === 0)
    return !0;
  const s = t.charCodeAt(r - 1);
  if (e.get(s) !== 0 || s === 13 || s === 10)
    return !0;
  if (i > 0) {
    const a = t.charCodeAt(r);
    if (e.get(a) !== 0)
      return !0;
  }
  return !1;
}
function Mu(e, t, n, r, i) {
  if (r + i === n)
    return !0;
  const s = t.charCodeAt(r + i);
  if (e.get(s) !== 0 || s === 13 || s === 10)
    return !0;
  if (i > 0) {
    const a = t.charCodeAt(r + i - 1);
    if (e.get(a) !== 0)
      return !0;
  }
  return !1;
}
function Tu(e, t, n, r, i) {
  return Eu(e, t, n, r, i) && Mu(e, t, n, r, i);
}
class Pu {
  constructor(t, n) {
    this._wordSeparators = t, this._searchRegex = n, this._prevMatchStartIndex = -1, this._prevMatchLength = 0;
  }
  reset(t) {
    this._searchRegex.lastIndex = t, this._prevMatchStartIndex = -1, this._prevMatchLength = 0;
  }
  next(t) {
    const n = t.length;
    let r;
    do {
      if (this._prevMatchStartIndex + this._prevMatchLength === n || (r = this._searchRegex.exec(t), !r))
        return null;
      const i = r.index, s = r[0].length;
      if (i === this._prevMatchStartIndex && s === this._prevMatchLength) {
        if (s === 0) {
          Tl(t, n, this._searchRegex.lastIndex) > 65535 ? this._searchRegex.lastIndex += 2 : this._searchRegex.lastIndex += 1;
          continue;
        }
        return null;
      }
      if (this._prevMatchStartIndex = i, this._prevMatchLength = s, !this._wordSeparators || Tu(this._wordSeparators, t, n, i, s))
        return r;
    } while (r);
    return null;
  }
}
const Cu = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";
function Iu(e = "") {
  let t = "(-?\\d*\\.\\d\\w*)|([^";
  for (const n of Cu)
    e.indexOf(n) >= 0 || (t += "\\" + n);
  return t += "\\s]+)", new RegExp(t, "g");
}
const _o = Iu();
function So(e) {
  let t = _o;
  if (e && e instanceof RegExp)
    if (e.global)
      t = e;
    else {
      let n = "g";
      e.ignoreCase && (n += "i"), e.multiline && (n += "m"), e.unicode && (n += "u"), t = new RegExp(e.source, n);
    }
  return t.lastIndex = 0, t;
}
const Ao = new il();
Ao.unshift({
  maxLen: 1e3,
  windowSize: 15,
  timeBudget: 150
});
function ei(e, t, n, r, i) {
  if (t = So(t), i || (i = Nn.first(Ao)), n.length > i.maxLen) {
    let l = e - i.maxLen / 2;
    return l < 0 ? l = 0 : r += l, n = n.substring(l, e + i.maxLen / 2), ei(e, t, n, r, i);
  }
  const s = Date.now(), a = e - 1 - r;
  let o = -1, u = null;
  for (let l = 1; !(Date.now() - s >= i.timeBudget); l++) {
    const h = a - i.windowSize * l;
    t.lastIndex = Math.max(0, h);
    const f = Fu(t, n, a, o);
    if (!f && u || (u = f, h <= 0))
      break;
    o = h;
  }
  if (u) {
    const l = {
      word: u[0],
      startColumn: r + 1 + u.index,
      endColumn: r + 1 + u.index + u[0].length
    };
    return t.lastIndex = 0, l;
  }
  return null;
}
function Fu(e, t, n, r) {
  let i;
  for (; i = e.exec(t); ) {
    const s = i.index || 0;
    if (s <= n && e.lastIndex >= n)
      return i;
    if (r > 0 && s > r)
      return null;
  }
  return null;
}
class Vu {
  static computeUnicodeHighlights(t, n, r) {
    const i = r ? r.startLineNumber : 1, s = r ? r.endLineNumber : t.getLineCount(), a = new As(n), o = a.getCandidateCodePoints();
    let u;
    o === "allNonBasicAscii" ? u = new RegExp("[^\\t\\n\\r\\x20-\\x7E]", "g") : u = new RegExp(`${Du(Array.from(o))}`, "g");
    const l = new Pu(null, u), h = [];
    let f = !1, d, m = 0, g = 0, p = 0;
    e: for (let w = i, y = s; w <= y; w++) {
      const N = t.getLineContent(w), b = N.length;
      l.reset(0);
      do
        if (d = l.next(N), d) {
          let _ = d.index, L = d.index + d[0].length;
          if (_ > 0) {
            const M = N.charCodeAt(_ - 1);
            cr(M) && _--;
          }
          if (L + 1 < b) {
            const M = N.charCodeAt(L - 1);
            cr(M) && L++;
          }
          const S = N.substring(_, L);
          let v = ei(_ + 1, _o, N, 0);
          v && v.endColumn <= _ + 1 && (v = null);
          const k = a.shouldHighlightNonBasicASCII(S, v ? v.word : null);
          if (k !== 0) {
            if (k === 3 ? m++ : k === 2 ? g++ : k === 1 ? p++ : Yo(), h.length >= 1e3) {
              f = !0;
              break e;
            }
            h.push(new q(w, _ + 1, w, L + 1));
          }
        }
      while (d);
    }
    return {
      ranges: h,
      hasMore: f,
      ambiguousCharacterCount: m,
      invisibleCharacterCount: g,
      nonBasicAsciiCharacterCount: p
    };
  }
  static computeUnicodeHighlightReason(t, n) {
    const r = new As(n);
    switch (r.shouldHighlightNonBasicASCII(t, null)) {
      case 0:
        return null;
      case 2:
        return {
          kind: 1
          /* UnicodeHighlighterReasonKind.Invisible */
        };
      case 3: {
        const s = t.codePointAt(0), a = r.ambiguousCharacters.getPrimaryConfusable(s), o = tn.getLocales().filter((u) => !tn.getInstance(/* @__PURE__ */ new Set([...n.allowedLocales, u])).isAmbiguous(s));
        return { kind: 0, confusableWith: String.fromCodePoint(a), notAmbiguousInLocales: o };
      }
      case 1:
        return {
          kind: 2
          /* UnicodeHighlighterReasonKind.NonBasicAscii */
        };
    }
  }
}
function Du(e, t) {
  return `[${Ll(e.map((r) => String.fromCodePoint(r)).join(""))}]`;
}
class As {
  constructor(t) {
    this.options = t, this.allowedCodePoints = new Set(t.allowedCodePoints), this.ambiguousCharacters = tn.getInstance(new Set(t.allowedLocales));
  }
  getCandidateCodePoints() {
    if (this.options.nonBasicASCII)
      return "allNonBasicAscii";
    const t = /* @__PURE__ */ new Set();
    if (this.options.invisibleCharacters)
      for (const n of zt.codePoints)
        ks(String.fromCodePoint(n)) || t.add(n);
    if (this.options.ambiguousCharacters)
      for (const n of this.ambiguousCharacters.getConfusableCodePoints())
        t.add(n);
    for (const n of this.allowedCodePoints)
      t.delete(n);
    return t;
  }
  shouldHighlightNonBasicASCII(t, n) {
    const r = t.codePointAt(0);
    if (this.allowedCodePoints.has(r))
      return 0;
    if (this.options.nonBasicASCII)
      return 1;
    let i = !1, s = !1;
    if (n)
      for (const a of n) {
        const o = a.codePointAt(0), u = Cl(a);
        i = i || u, !u && !this.ambiguousCharacters.isAmbiguous(o) && !zt.isInvisibleCharacter(o) && (s = !0);
      }
    return (
      /* Don't allow mixing weird looking characters with ASCII */
      !i && /* Is there an obviously weird looking character? */
      s ? 0 : this.options.invisibleCharacters && !ks(t) && zt.isInvisibleCharacter(r) ? 2 : this.options.ambiguousCharacters && this.ambiguousCharacters.isAmbiguous(r) ? 3 : 0
    );
  }
}
function ks(e) {
  return e === " " || e === `
` || e === "	";
}
class yn {
  constructor(t, n, r) {
    this.changes = t, this.moves = n, this.hitTimeout = r;
  }
}
class Ou {
  constructor(t, n) {
    this.lineRangeMapping = t, this.changes = n;
  }
}
function $u(e, t, n = (r, i) => r === i) {
  if (e === t)
    return !0;
  if (!e || !t || e.length !== t.length)
    return !1;
  for (let r = 0, i = e.length; r < i; r++)
    if (!n(e[r], t[r]))
      return !1;
  return !0;
}
function* Bu(e, t) {
  let n, r;
  for (const i of e)
    r !== void 0 && t(r, i) ? n.push(i) : (n && (yield n), n = [i]), r = i;
  n && (yield n);
}
function Uu(e, t) {
  for (let n = 0; n <= e.length; n++)
    t(n === 0 ? void 0 : e[n - 1], n === e.length ? void 0 : e[n]);
}
function qu(e, t) {
  for (let n = 0; n < e.length; n++)
    t(n === 0 ? void 0 : e[n - 1], e[n], n + 1 === e.length ? void 0 : e[n + 1]);
}
function ju(e, t) {
  for (const n of t)
    e.push(n);
}
var Lr;
(function(e) {
  function t(s) {
    return s < 0;
  }
  e.isLessThan = t;
  function n(s) {
    return s <= 0;
  }
  e.isLessThanOrEqual = n;
  function r(s) {
    return s > 0;
  }
  e.isGreaterThan = r;
  function i(s) {
    return s === 0;
  }
  e.isNeitherLessOrGreaterThan = i, e.greaterThan = 1, e.lessThan = -1, e.neitherLessOrGreaterThan = 0;
})(Lr || (Lr = {}));
function Gt(e, t) {
  return (n, r) => t(e(n), e(r));
}
const Jt = (e, t) => e - t;
function Wu(e) {
  return (t, n) => -e(t, n);
}
const Rt = class Rt {
  constructor(t) {
    this.iterate = t;
  }
  toArray() {
    const t = [];
    return this.iterate((n) => (t.push(n), !0)), t;
  }
  filter(t) {
    return new Rt((n) => this.iterate((r) => t(r) ? n(r) : !0));
  }
  map(t) {
    return new Rt((n) => this.iterate((r) => n(t(r))));
  }
  findLast(t) {
    let n;
    return this.iterate((r) => (t(r) && (n = r), !0)), n;
  }
  findLastMaxBy(t) {
    let n, r = !0;
    return this.iterate((i) => ((r || Lr.isGreaterThan(t(i, n))) && (r = !1, n = i), !0)), n;
  }
};
Rt.empty = new Rt((t) => {
});
let Rs = Rt;
class j {
  static fromTo(t, n) {
    return new j(t, n);
  }
  static addRange(t, n) {
    let r = 0;
    for (; r < n.length && n[r].endExclusive < t.start; )
      r++;
    let i = r;
    for (; i < n.length && n[i].start <= t.endExclusive; )
      i++;
    if (r === i)
      n.splice(r, 0, t);
    else {
      const s = Math.min(t.start, n[r].start), a = Math.max(t.endExclusive, n[i - 1].endExclusive);
      n.splice(r, i - r, new j(s, a));
    }
  }
  static tryCreate(t, n) {
    if (!(t > n))
      return new j(t, n);
  }
  static ofLength(t) {
    return new j(0, t);
  }
  static ofStartAndLength(t, n) {
    return new j(t, t + n);
  }
  static emptyAt(t) {
    return new j(t, t);
  }
  constructor(t, n) {
    if (this.start = t, this.endExclusive = n, t > n)
      throw new ue(`Invalid range: ${this.toString()}`);
  }
  get isEmpty() {
    return this.start === this.endExclusive;
  }
  delta(t) {
    return new j(this.start + t, this.endExclusive + t);
  }
  deltaStart(t) {
    return new j(this.start + t, this.endExclusive);
  }
  deltaEnd(t) {
    return new j(this.start, this.endExclusive + t);
  }
  get length() {
    return this.endExclusive - this.start;
  }
  toString() {
    return `[${this.start}, ${this.endExclusive})`;
  }
  equals(t) {
    return this.start === t.start && this.endExclusive === t.endExclusive;
  }
  contains(t) {
    return this.start <= t && t < this.endExclusive;
  }
  /**
   * for all numbers n: range1.contains(n) or range2.contains(n) => range1.join(range2).contains(n)
   * The joined range is the smallest range that contains both ranges.
   */
  join(t) {
    return new j(Math.min(this.start, t.start), Math.max(this.endExclusive, t.endExclusive));
  }
  /**
   * for all numbers n: range1.contains(n) and range2.contains(n) <=> range1.intersect(range2).contains(n)
   *
   * The resulting range is empty if the ranges do not intersect, but touch.
   * If the ranges don't even touch, the result is undefined.
   */
  intersect(t) {
    const n = Math.max(this.start, t.start), r = Math.min(this.endExclusive, t.endExclusive);
    if (n <= r)
      return new j(n, r);
  }
  intersectionLength(t) {
    const n = Math.max(this.start, t.start), r = Math.min(this.endExclusive, t.endExclusive);
    return Math.max(0, r - n);
  }
  intersects(t) {
    const n = Math.max(this.start, t.start), r = Math.min(this.endExclusive, t.endExclusive);
    return n < r;
  }
  intersectsOrTouches(t) {
    const n = Math.max(this.start, t.start), r = Math.min(this.endExclusive, t.endExclusive);
    return n <= r;
  }
  isBefore(t) {
    return this.endExclusive <= t.start;
  }
  isAfter(t) {
    return this.start >= t.endExclusive;
  }
  slice(t) {
    return t.slice(this.start, this.endExclusive);
  }
  substring(t) {
    return t.substring(this.start, this.endExclusive);
  }
  /**
   * Returns the given value if it is contained in this instance, otherwise the closest value that is contained.
   * The range must not be empty.
   */
  clip(t) {
    if (this.isEmpty)
      throw new ue(`Invalid clipping range: ${this.toString()}`);
    return Math.max(this.start, Math.min(this.endExclusive - 1, t));
  }
  /**
   * Returns `r := value + k * length` such that `r` is contained in this range.
   * The range must not be empty.
   *
   * E.g. `[5, 10).clipCyclic(10) === 5`, `[5, 10).clipCyclic(11) === 6` and `[5, 10).clipCyclic(4) === 9`.
   */
  clipCyclic(t) {
    if (this.isEmpty)
      throw new ue(`Invalid clipping range: ${this.toString()}`);
    return t < this.start ? this.endExclusive - (this.start - t) % this.length : t >= this.endExclusive ? this.start + (t - this.start) % this.length : t;
  }
  forEach(t) {
    for (let n = this.start; n < this.endExclusive; n++)
      t(n);
  }
  /**
   * this: [ 5, 10), range: [10, 15) => [5, 15)]
   * Throws if the ranges are not touching.
  */
  joinRightTouching(t) {
    if (this.endExclusive !== t.start)
      throw new ue(`Invalid join: ${this.toString()} and ${t.toString()}`);
    return new j(this.start, t.endExclusive);
  }
}
function It(e, t) {
  const n = Ft(e, t);
  return n === -1 ? void 0 : e[n];
}
function Ft(e, t, n = 0, r = e.length) {
  let i = n, s = r;
  for (; i < s; ) {
    const a = Math.floor((i + s) / 2);
    t(e[a]) ? i = a + 1 : s = a;
  }
  return i - 1;
}
function Hu(e, t) {
  const n = Nr(e, t);
  return n === e.length ? void 0 : e[n];
}
function Nr(e, t, n = 0, r = e.length) {
  let i = n, s = r;
  for (; i < s; ) {
    const a = Math.floor((i + s) / 2);
    t(e[a]) ? s = a : i = a + 1;
  }
  return i;
}
const qn = class qn {
  constructor(t) {
    this._array = t, this._findLastMonotonousLastIdx = 0;
  }
  /**
   * The predicate must be monotonous, i.e. `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
   * For subsequent calls, current predicate must be weaker than (or equal to) the previous predicate, i.e. more entries must be `true`.
   */
  findLastMonotonous(t) {
    if (qn.assertInvariants) {
      if (this._prevFindLastPredicate) {
        for (const r of this._array)
          if (this._prevFindLastPredicate(r) && !t(r))
            throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
      }
      this._prevFindLastPredicate = t;
    }
    const n = Ft(this._array, t, this._findLastMonotonousLastIdx);
    return this._findLastMonotonousLastIdx = n + 1, n === -1 ? void 0 : this._array[n];
  }
};
qn.assertInvariants = !1;
let En = qn;
const ve = class ve {
  static ofLength(t, n) {
    return new ve(t, t + n);
  }
  static fromRange(t) {
    return new ve(t.startLineNumber, t.endLineNumber);
  }
  static fromRangeInclusive(t) {
    return new ve(t.startLineNumber, t.endLineNumber + 1);
  }
  /**
   * @param lineRanges An array of arrays of of sorted line ranges.
   */
  static joinMany(t) {
    if (t.length === 0)
      return [];
    let n = new Ve(t[0].slice());
    for (let r = 1; r < t.length; r++)
      n = n.getUnion(new Ve(t[r].slice()));
    return n.ranges;
  }
  static join(t) {
    if (t.length === 0)
      throw new ue("lineRanges cannot be empty");
    let n = t[0].startLineNumber, r = t[0].endLineNumberExclusive;
    for (let i = 1; i < t.length; i++)
      n = Math.min(n, t[i].startLineNumber), r = Math.max(r, t[i].endLineNumberExclusive);
    return new ve(n, r);
  }
  /**
   * @internal
   */
  static deserialize(t) {
    return new ve(t[0], t[1]);
  }
  constructor(t, n) {
    if (t > n)
      throw new ue(`startLineNumber ${t} cannot be after endLineNumberExclusive ${n}`);
    this.startLineNumber = t, this.endLineNumberExclusive = n;
  }
  /**
   * Indicates if this line range contains the given line number.
   */
  contains(t) {
    return this.startLineNumber <= t && t < this.endLineNumberExclusive;
  }
  /**
   * Indicates if this line range is empty.
   */
  get isEmpty() {
    return this.startLineNumber === this.endLineNumberExclusive;
  }
  /**
   * Moves this line range by the given offset of line numbers.
   */
  delta(t) {
    return new ve(this.startLineNumber + t, this.endLineNumberExclusive + t);
  }
  deltaLength(t) {
    return new ve(this.startLineNumber, this.endLineNumberExclusive + t);
  }
  /**
   * The number of lines this line range spans.
   */
  get length() {
    return this.endLineNumberExclusive - this.startLineNumber;
  }
  /**
   * Creates a line range that combines this and the given line range.
   */
  join(t) {
    return new ve(Math.min(this.startLineNumber, t.startLineNumber), Math.max(this.endLineNumberExclusive, t.endLineNumberExclusive));
  }
  toString() {
    return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
  }
  /**
   * The resulting range is empty if the ranges do not intersect, but touch.
   * If the ranges don't even touch, the result is undefined.
   */
  intersect(t) {
    const n = Math.max(this.startLineNumber, t.startLineNumber), r = Math.min(this.endLineNumberExclusive, t.endLineNumberExclusive);
    if (n <= r)
      return new ve(n, r);
  }
  intersectsStrict(t) {
    return this.startLineNumber < t.endLineNumberExclusive && t.startLineNumber < this.endLineNumberExclusive;
  }
  intersectsOrTouches(t) {
    return this.startLineNumber <= t.endLineNumberExclusive && t.startLineNumber <= this.endLineNumberExclusive;
  }
  equals(t) {
    return this.startLineNumber === t.startLineNumber && this.endLineNumberExclusive === t.endLineNumberExclusive;
  }
  toInclusiveRange() {
    return this.isEmpty ? null : new q(this.startLineNumber, 1, this.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER);
  }
  /**
   * @deprecated Using this function is discouraged because it might lead to bugs: The end position is not guaranteed to be a valid position!
  */
  toExclusiveRange() {
    return new q(this.startLineNumber, 1, this.endLineNumberExclusive, 1);
  }
  mapToLineArray(t) {
    const n = [];
    for (let r = this.startLineNumber; r < this.endLineNumberExclusive; r++)
      n.push(t(r));
    return n;
  }
  forEach(t) {
    for (let n = this.startLineNumber; n < this.endLineNumberExclusive; n++)
      t(n);
  }
  /**
   * @internal
   */
  serialize() {
    return [this.startLineNumber, this.endLineNumberExclusive];
  }
  /**
   * Converts this 1-based line range to a 0-based offset range (subtracts 1!).
   * @internal
   */
  toOffsetRange() {
    return new j(this.startLineNumber - 1, this.endLineNumberExclusive - 1);
  }
  addMargin(t, n) {
    return new ve(this.startLineNumber - t, this.endLineNumberExclusive + n);
  }
};
ve.compareByStart = Gt((t) => t.startLineNumber, Jt);
let z = ve;
class Ve {
  constructor(t = []) {
    this._normalizedRanges = t;
  }
  get ranges() {
    return this._normalizedRanges;
  }
  addRange(t) {
    if (t.length === 0)
      return;
    const n = Nr(this._normalizedRanges, (i) => i.endLineNumberExclusive >= t.startLineNumber), r = Ft(this._normalizedRanges, (i) => i.startLineNumber <= t.endLineNumberExclusive) + 1;
    if (n === r)
      this._normalizedRanges.splice(n, 0, t);
    else if (n === r - 1) {
      const i = this._normalizedRanges[n];
      this._normalizedRanges[n] = i.join(t);
    } else {
      const i = this._normalizedRanges[n].join(this._normalizedRanges[r - 1]).join(t);
      this._normalizedRanges.splice(n, r - n, i);
    }
  }
  contains(t) {
    const n = It(this._normalizedRanges, (r) => r.startLineNumber <= t);
    return !!n && n.endLineNumberExclusive > t;
  }
  intersects(t) {
    const n = It(this._normalizedRanges, (r) => r.startLineNumber < t.endLineNumberExclusive);
    return !!n && n.endLineNumberExclusive > t.startLineNumber;
  }
  getUnion(t) {
    if (this._normalizedRanges.length === 0)
      return t;
    if (t._normalizedRanges.length === 0)
      return this;
    const n = [];
    let r = 0, i = 0, s = null;
    for (; r < this._normalizedRanges.length || i < t._normalizedRanges.length; ) {
      let a = null;
      if (r < this._normalizedRanges.length && i < t._normalizedRanges.length) {
        const o = this._normalizedRanges[r], u = t._normalizedRanges[i];
        o.startLineNumber < u.startLineNumber ? (a = o, r++) : (a = u, i++);
      } else r < this._normalizedRanges.length ? (a = this._normalizedRanges[r], r++) : (a = t._normalizedRanges[i], i++);
      s === null ? s = a : s.endLineNumberExclusive >= a.startLineNumber ? s = new z(s.startLineNumber, Math.max(s.endLineNumberExclusive, a.endLineNumberExclusive)) : (n.push(s), s = a);
    }
    return s !== null && n.push(s), new Ve(n);
  }
  /**
   * Subtracts all ranges in this set from `range` and returns the result.
   */
  subtractFrom(t) {
    const n = Nr(this._normalizedRanges, (a) => a.endLineNumberExclusive >= t.startLineNumber), r = Ft(this._normalizedRanges, (a) => a.startLineNumber <= t.endLineNumberExclusive) + 1;
    if (n === r)
      return new Ve([t]);
    const i = [];
    let s = t.startLineNumber;
    for (let a = n; a < r; a++) {
      const o = this._normalizedRanges[a];
      o.startLineNumber > s && i.push(new z(s, o.startLineNumber)), s = o.endLineNumberExclusive;
    }
    return s < t.endLineNumberExclusive && i.push(new z(s, t.endLineNumberExclusive)), new Ve(i);
  }
  toString() {
    return this._normalizedRanges.map((t) => t.toString()).join(", ");
  }
  getIntersection(t) {
    const n = [];
    let r = 0, i = 0;
    for (; r < this._normalizedRanges.length && i < t._normalizedRanges.length; ) {
      const s = this._normalizedRanges[r], a = t._normalizedRanges[i], o = s.intersect(a);
      o && !o.isEmpty && n.push(o), s.endLineNumberExclusive < a.endLineNumberExclusive ? r++ : i++;
    }
    return new Ve(n);
  }
  getWithDelta(t) {
    return new Ve(this._normalizedRanges.map((n) => n.delta(t)));
  }
}
const Ee = class Ee {
  static betweenPositions(t, n) {
    return t.lineNumber === n.lineNumber ? new Ee(0, n.column - t.column) : new Ee(n.lineNumber - t.lineNumber, n.column - 1);
  }
  static fromPosition(t) {
    return new Ee(t.lineNumber - 1, t.column - 1);
  }
  static ofRange(t) {
    return Ee.betweenPositions(t.getStartPosition(), t.getEndPosition());
  }
  static ofText(t) {
    let n = 0, r = 0;
    for (const i of t)
      i === `
` ? (n++, r = 0) : r++;
    return new Ee(n, r);
  }
  constructor(t, n) {
    this.lineCount = t, this.columnCount = n;
  }
  isGreaterThanOrEqualTo(t) {
    return this.lineCount !== t.lineCount ? this.lineCount > t.lineCount : this.columnCount >= t.columnCount;
  }
  add(t) {
    return t.lineCount === 0 ? new Ee(this.lineCount, this.columnCount + t.columnCount) : new Ee(this.lineCount + t.lineCount, t.columnCount);
  }
  createRange(t) {
    return this.lineCount === 0 ? new q(t.lineNumber, t.column, t.lineNumber, t.column + this.columnCount) : new q(t.lineNumber, t.column, t.lineNumber + this.lineCount, this.columnCount + 1);
  }
  toRange() {
    return new q(1, 1, this.lineCount + 1, this.columnCount + 1);
  }
  toLineRange() {
    return z.ofLength(1, this.lineCount + 1);
  }
  addToPosition(t) {
    return this.lineCount === 0 ? new Q(t.lineNumber, t.column + this.columnCount) : new Q(t.lineNumber + this.lineCount, this.columnCount + 1);
  }
  toString() {
    return `${this.lineCount},${this.columnCount}`;
  }
};
Ee.zero = new Ee(0, 0);
let nn = Ee;
class zu {
  getOffsetRange(t) {
    return new j(this.getOffset(t.getStartPosition()), this.getOffset(t.getEndPosition()));
  }
  getRange(t) {
    return q.fromPositions(this.getPosition(t.start), this.getPosition(t.endExclusive));
  }
  getStringReplacement(t) {
    return new Mt.deps.StringReplacement(this.getOffsetRange(t.range), t.text);
  }
  getTextReplacement(t) {
    return new Mt.deps.TextReplacement(this.getRange(t.replaceRange), t.newText);
  }
  getTextEdit(t) {
    const n = t.replacements.map((r) => this.getTextReplacement(r));
    return new Mt.deps.TextEdit(n);
  }
}
const si = class si {
  static get deps() {
    if (!this._deps)
      throw new Error("Dependencies not set. Call _setDependencies first.");
    return this._deps;
  }
};
si._deps = void 0;
let Mt = si;
class Gu extends zu {
  constructor(t) {
    super(), this.text = t, this.lineStartOffsetByLineIdx = [], this.lineEndOffsetByLineIdx = [], this.lineStartOffsetByLineIdx.push(0);
    for (let n = 0; n < t.length; n++)
      t.charAt(n) === `
` && (this.lineStartOffsetByLineIdx.push(n + 1), n > 0 && t.charAt(n - 1) === "\r" ? this.lineEndOffsetByLineIdx.push(n - 1) : this.lineEndOffsetByLineIdx.push(n));
    this.lineEndOffsetByLineIdx.push(t.length);
  }
  getOffset(t) {
    const n = this._validatePosition(t);
    return this.lineStartOffsetByLineIdx[n.lineNumber - 1] + n.column - 1;
  }
  _validatePosition(t) {
    if (t.lineNumber < 1)
      return new Q(1, 1);
    const n = this.textLength.lineCount + 1;
    if (t.lineNumber > n) {
      const i = this.getLineLength(n);
      return new Q(n, i + 1);
    }
    if (t.column < 1)
      return new Q(t.lineNumber, 1);
    const r = this.getLineLength(t.lineNumber);
    return t.column - 1 > r ? new Q(t.lineNumber, r + 1) : t;
  }
  getPosition(t) {
    const n = Ft(this.lineStartOffsetByLineIdx, (s) => s <= t), r = n + 1, i = t - this.lineStartOffsetByLineIdx[n] + 1;
    return new Q(r, i);
  }
  get textLength() {
    const t = this.lineStartOffsetByLineIdx.length - 1;
    return new Mt.deps.TextLength(t, this.text.length - this.lineStartOffsetByLineIdx[t]);
  }
  getLineLength(t) {
    return this.lineEndOffsetByLineIdx[t - 1] - this.lineStartOffsetByLineIdx[t - 1];
  }
}
class Ju {
  constructor() {
    this._transformer = void 0;
  }
  get endPositionExclusive() {
    return this.length.addToPosition(new Q(1, 1));
  }
  get lineRange() {
    return this.length.toLineRange();
  }
  getValue() {
    return this.getValueOfRange(this.length.toRange());
  }
  getValueOfOffsetRange(t) {
    return this.getValueOfRange(this.getTransformer().getRange(t));
  }
  getLineLength(t) {
    return this.getValueOfRange(new q(t, 1, t, Number.MAX_SAFE_INTEGER)).length;
  }
  getTransformer() {
    return this._transformer || (this._transformer = new Gu(this.getValue())), this._transformer;
  }
  getLineAt(t) {
    return this.getValueOfRange(new q(t, 1, t, Number.MAX_SAFE_INTEGER));
  }
}
class Xu extends Ju {
  constructor(t, n) {
    Ko(n >= 1), super(), this._getLineContent = t, this._lineCount = n;
  }
  getValueOfRange(t) {
    if (t.startLineNumber === t.endLineNumber)
      return this._getLineContent(t.startLineNumber).substring(t.startColumn - 1, t.endColumn - 1);
    let n = this._getLineContent(t.startLineNumber).substring(t.startColumn - 1);
    for (let r = t.startLineNumber + 1; r < t.endLineNumber; r++)
      n += `
` + this._getLineContent(r);
    return n += `
` + this._getLineContent(t.endLineNumber).substring(0, t.endColumn - 1), n;
  }
  getLineLength(t) {
    return this._getLineContent(t).length;
  }
  get length() {
    const t = this._getLineContent(this._lineCount);
    return new nn(this._lineCount - 1, t.length);
  }
}
class dn extends Xu {
  constructor(t) {
    super((n) => t[n - 1], t.length);
  }
}
class Qe {
  static joinReplacements(t, n) {
    if (t.length === 0)
      throw new ue();
    if (t.length === 1)
      return t[0];
    const r = t[0].range.getStartPosition(), i = t[t.length - 1].range.getEndPosition();
    let s = "";
    for (let a = 0; a < t.length; a++) {
      const o = t[a];
      if (s += o.text, a < t.length - 1) {
        const u = t[a + 1], l = q.fromPositions(o.range.getEndPosition(), u.range.getStartPosition()), h = n.getValueOfRange(l);
        s += h;
      }
    }
    return new Qe(q.fromPositions(r, i), s);
  }
  static fromStringReplacement(t, n) {
    return new Qe(n.getTransformer().getRange(t.replaceRange), t.newText);
  }
  static delete(t) {
    return new Qe(t, "");
  }
  constructor(t, n) {
    this.range = t, this.text = n;
  }
  get isEmpty() {
    return this.range.isEmpty() && this.text.length === 0;
  }
  static equals(t, n) {
    return t.range.equalsRange(n.range) && t.text === n.text;
  }
  equals(t) {
    return Qe.equals(this, t);
  }
  removeCommonPrefixAndSuffix(t) {
    return this.removeCommonPrefix(t).removeCommonSuffix(t);
  }
  removeCommonPrefix(t) {
    const n = t.getValueOfRange(this.range).replaceAll(`\r
`, `
`), r = this.text.replaceAll(`\r
`, `
`), i = kl(n, r), s = nn.ofText(n.substring(0, i)).addToPosition(this.range.getStartPosition()), a = r.substring(i), o = q.fromPositions(s, this.range.getEndPosition());
    return new Qe(o, a);
  }
  removeCommonSuffix(t) {
    const n = t.getValueOfRange(this.range).replaceAll(`\r
`, `
`), r = this.text.replaceAll(`\r
`, `
`), i = Rl(n, r), s = nn.ofText(n.substring(0, n.length - i)).addToPosition(this.range.getStartPosition()), a = r.substring(0, r.length - i), o = q.fromPositions(this.range.getStartPosition(), s);
    return new Qe(o, a);
  }
  toString() {
    const t = this.range.getStartPosition(), n = this.range.getEndPosition();
    return `(${t.lineNumber},${t.column} -> ${n.lineNumber},${n.column}): "${this.text}"`;
  }
}
class Ae {
  static inverse(t, n, r) {
    const i = [];
    let s = 1, a = 1;
    for (const u of t) {
      const l = new Ae(new z(s, u.original.startLineNumber), new z(a, u.modified.startLineNumber));
      l.modified.isEmpty || i.push(l), s = u.original.endLineNumberExclusive, a = u.modified.endLineNumberExclusive;
    }
    const o = new Ae(new z(s, n + 1), new z(a, r + 1));
    return o.modified.isEmpty || i.push(o), i;
  }
  static clip(t, n, r) {
    const i = [];
    for (const s of t) {
      const a = s.original.intersect(n), o = s.modified.intersect(r);
      a && !a.isEmpty && o && !o.isEmpty && i.push(new Ae(a, o));
    }
    return i;
  }
  constructor(t, n) {
    this.original = t, this.modified = n;
  }
  toString() {
    return `{${this.original.toString()}->${this.modified.toString()}}`;
  }
  flip() {
    return new Ae(this.modified, this.original);
  }
  join(t) {
    return new Ae(this.original.join(t.original), this.modified.join(t.modified));
  }
  /**
   * This method assumes that the LineRangeMapping describes a valid diff!
   * I.e. if one range is empty, the other range cannot be the entire document.
   * It avoids various problems when the line range points to non-existing line-numbers.
  */
  toRangeMapping() {
    const t = this.original.toInclusiveRange(), n = this.modified.toInclusiveRange();
    if (t && n)
      return new _e(t, n);
    if (this.original.startLineNumber === 1 || this.modified.startLineNumber === 1) {
      if (!(this.modified.startLineNumber === 1 && this.original.startLineNumber === 1))
        throw new ue("not a valid diff");
      return new _e(new q(this.original.startLineNumber, 1, this.original.endLineNumberExclusive, 1), new q(this.modified.startLineNumber, 1, this.modified.endLineNumberExclusive, 1));
    } else
      return new _e(new q(this.original.startLineNumber - 1, Number.MAX_SAFE_INTEGER, this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), new q(this.modified.startLineNumber - 1, Number.MAX_SAFE_INTEGER, this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER));
  }
  /**
   * This method assumes that the LineRangeMapping describes a valid diff!
   * I.e. if one range is empty, the other range cannot be the entire document.
   * It avoids various problems when the line range points to non-existing line-numbers.
  */
  toRangeMapping2(t, n) {
    if (Es(this.original.endLineNumberExclusive, t) && Es(this.modified.endLineNumberExclusive, n))
      return new _e(new q(this.original.startLineNumber, 1, this.original.endLineNumberExclusive, 1), new q(this.modified.startLineNumber, 1, this.modified.endLineNumberExclusive, 1));
    if (!this.original.isEmpty && !this.modified.isEmpty)
      return new _e(q.fromPositions(new Q(this.original.startLineNumber, 1), bt(new Q(this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), t)), q.fromPositions(new Q(this.modified.startLineNumber, 1), bt(new Q(this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), n)));
    if (this.original.startLineNumber > 1 && this.modified.startLineNumber > 1)
      return new _e(q.fromPositions(bt(new Q(this.original.startLineNumber - 1, Number.MAX_SAFE_INTEGER), t), bt(new Q(this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), t)), q.fromPositions(bt(new Q(this.modified.startLineNumber - 1, Number.MAX_SAFE_INTEGER), n), bt(new Q(this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), n)));
    throw new ue();
  }
}
function bt(e, t) {
  if (e.lineNumber < 1)
    return new Q(1, 1);
  if (e.lineNumber > t.length)
    return new Q(t.length, t[t.length - 1].length + 1);
  const n = t[e.lineNumber - 1];
  return e.column > n.length + 1 ? new Q(e.lineNumber, n.length + 1) : e;
}
function Es(e, t) {
  return e >= 1 && e <= t.length;
}
class je extends Ae {
  static fromRangeMappings(t) {
    const n = z.join(t.map((i) => z.fromRangeInclusive(i.originalRange))), r = z.join(t.map((i) => z.fromRangeInclusive(i.modifiedRange)));
    return new je(n, r, t);
  }
  constructor(t, n, r) {
    super(t, n), this.innerChanges = r;
  }
  flip() {
    var t;
    return new je(this.modified, this.original, (t = this.innerChanges) == null ? void 0 : t.map((n) => n.flip()));
  }
  withInnerChangesFromLineRanges() {
    return new je(this.original, this.modified, [this.toRangeMapping()]);
  }
}
class _e {
  static fromEdit(t) {
    const n = t.getNewRanges();
    return t.replacements.map((i, s) => new _e(i.range, n[s]));
  }
  static assertSorted(t) {
    for (let n = 1; n < t.length; n++) {
      const r = t[n - 1], i = t[n];
      if (!(r.originalRange.getEndPosition().isBeforeOrEqual(i.originalRange.getStartPosition()) && r.modifiedRange.getEndPosition().isBeforeOrEqual(i.modifiedRange.getStartPosition())))
        throw new ue("Range mappings must be sorted");
    }
  }
  constructor(t, n) {
    this.originalRange = t, this.modifiedRange = n;
  }
  toString() {
    return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
  }
  flip() {
    return new _e(this.modifiedRange, this.originalRange);
  }
  /**
   * Creates a single text edit that describes the change from the original to the modified text.
  */
  toTextEdit(t) {
    const n = t.getValueOfRange(this.modifiedRange);
    return new Qe(this.originalRange, n);
  }
}
function Ms(e, t, n, r = !1) {
  const i = [];
  for (const s of Bu(e.map((a) => Qu(a, t, n)), (a, o) => a.original.intersectsOrTouches(o.original) || a.modified.intersectsOrTouches(o.modified))) {
    const a = s[0], o = s[s.length - 1];
    i.push(new je(a.original.join(o.original), a.modified.join(o.modified), s.map((u) => u.innerChanges[0])));
  }
  return Ln(() => !r && i.length > 0 && (i[0].modified.startLineNumber !== i[0].original.startLineNumber || n.length.lineCount - i[i.length - 1].modified.endLineNumberExclusive !== t.length.lineCount - i[i.length - 1].original.endLineNumberExclusive) ? !1 : fo(i, (s, a) => a.original.startLineNumber - s.original.endLineNumberExclusive === a.modified.startLineNumber - s.modified.endLineNumberExclusive && // There has to be an unchanged line in between (otherwise both diffs should have been joined)
  s.original.endLineNumberExclusive < a.original.startLineNumber && s.modified.endLineNumberExclusive < a.modified.startLineNumber)), i;
}
function Qu(e, t, n) {
  let r = 0, i = 0;
  e.modifiedRange.endColumn === 1 && e.originalRange.endColumn === 1 && e.originalRange.startLineNumber + r <= e.originalRange.endLineNumber && e.modifiedRange.startLineNumber + r <= e.modifiedRange.endLineNumber && (i = -1), e.modifiedRange.startColumn - 1 >= n.getLineLength(e.modifiedRange.startLineNumber) && e.originalRange.startColumn - 1 >= t.getLineLength(e.originalRange.startLineNumber) && e.originalRange.startLineNumber <= e.originalRange.endLineNumber + i && e.modifiedRange.startLineNumber <= e.modifiedRange.endLineNumber + i && (r = 1);
  const s = new z(e.originalRange.startLineNumber + r, e.originalRange.endLineNumber + 1 + i), a = new z(e.modifiedRange.startLineNumber + r, e.modifiedRange.endLineNumber + 1 + i);
  return new je(s, a, [e]);
}
const Zu = 3;
class Yu {
  computeDiff(t, n, r) {
    var u;
    const s = new tc(t, n, {
      maxComputationTime: r.maxComputationTimeMs,
      shouldIgnoreTrimWhitespace: r.ignoreTrimWhitespace,
      shouldComputeCharChanges: !0,
      shouldMakePrettyDiff: !0,
      shouldPostProcessCharChanges: !0
    }).computeDiff(), a = [];
    let o = null;
    for (const l of s.changes) {
      let h;
      l.originalEndLineNumber === 0 ? h = new z(l.originalStartLineNumber + 1, l.originalStartLineNumber + 1) : h = new z(l.originalStartLineNumber, l.originalEndLineNumber + 1);
      let f;
      l.modifiedEndLineNumber === 0 ? f = new z(l.modifiedStartLineNumber + 1, l.modifiedStartLineNumber + 1) : f = new z(l.modifiedStartLineNumber, l.modifiedEndLineNumber + 1);
      let d = new je(h, f, (u = l.charChanges) == null ? void 0 : u.map((m) => new _e(new q(m.originalStartLineNumber, m.originalStartColumn, m.originalEndLineNumber, m.originalEndColumn), new q(m.modifiedStartLineNumber, m.modifiedStartColumn, m.modifiedEndLineNumber, m.modifiedEndColumn))));
      o && (o.modified.endLineNumberExclusive === d.modified.startLineNumber || o.original.endLineNumberExclusive === d.original.startLineNumber) && (d = new je(o.original.join(d.original), o.modified.join(d.modified), o.innerChanges && d.innerChanges ? o.innerChanges.concat(d.innerChanges) : void 0), a.pop()), a.push(d), o = d;
    }
    return Ln(() => fo(a, (l, h) => h.original.startLineNumber - l.original.endLineNumberExclusive === h.modified.startLineNumber - l.modified.endLineNumberExclusive && // There has to be an unchanged line in between (otherwise both diffs should have been joined)
    l.original.endLineNumberExclusive < h.original.startLineNumber && l.modified.endLineNumberExclusive < h.modified.startLineNumber)), new yn(a, [], s.quitEarly);
  }
}
function ko(e, t, n, r) {
  return new Ye(e, t, n).ComputeDiff(r);
}
let Ts = class {
  constructor(t) {
    const n = [], r = [];
    for (let i = 0, s = t.length; i < s; i++)
      n[i] = _r(t[i], 1), r[i] = Sr(t[i], 1);
    this.lines = t, this._startColumns = n, this._endColumns = r;
  }
  getElements() {
    const t = [];
    for (let n = 0, r = this.lines.length; n < r; n++)
      t[n] = this.lines[n].substring(this._startColumns[n] - 1, this._endColumns[n] - 1);
    return t;
  }
  getStrictElement(t) {
    return this.lines[t];
  }
  getStartLineNumber(t) {
    return t + 1;
  }
  getEndLineNumber(t) {
    return t + 1;
  }
  createCharSequence(t, n, r) {
    const i = [], s = [], a = [];
    let o = 0;
    for (let u = n; u <= r; u++) {
      const l = this.lines[u], h = t ? this._startColumns[u] : 1, f = t ? this._endColumns[u] : l.length + 1;
      for (let d = h; d < f; d++)
        i[o] = l.charCodeAt(d - 1), s[o] = u + 1, a[o] = d, o++;
      !t && u < r && (i[o] = 10, s[o] = u + 1, a[o] = l.length + 1, o++);
    }
    return new Ku(i, s, a);
  }
};
class Ku {
  constructor(t, n, r) {
    this._charCodes = t, this._lineNumbers = n, this._columns = r;
  }
  toString() {
    return "[" + this._charCodes.map((t, n) => (t === 10 ? "\\n" : String.fromCharCode(t)) + `-(${this._lineNumbers[n]},${this._columns[n]})`).join(", ") + "]";
  }
  _assertIndex(t, n) {
    if (t < 0 || t >= n.length)
      throw new Error("Illegal index");
  }
  getElements() {
    return this._charCodes;
  }
  getStartLineNumber(t) {
    return t > 0 && t === this._lineNumbers.length ? this.getEndLineNumber(t - 1) : (this._assertIndex(t, this._lineNumbers), this._lineNumbers[t]);
  }
  getEndLineNumber(t) {
    return t === -1 ? this.getStartLineNumber(t + 1) : (this._assertIndex(t, this._lineNumbers), this._charCodes[t] === 10 ? this._lineNumbers[t] + 1 : this._lineNumbers[t]);
  }
  getStartColumn(t) {
    return t > 0 && t === this._columns.length ? this.getEndColumn(t - 1) : (this._assertIndex(t, this._columns), this._columns[t]);
  }
  getEndColumn(t) {
    return t === -1 ? this.getStartColumn(t + 1) : (this._assertIndex(t, this._columns), this._charCodes[t] === 10 ? 1 : this._columns[t] + 1);
  }
}
class Tt {
  constructor(t, n, r, i, s, a, o, u) {
    this.originalStartLineNumber = t, this.originalStartColumn = n, this.originalEndLineNumber = r, this.originalEndColumn = i, this.modifiedStartLineNumber = s, this.modifiedStartColumn = a, this.modifiedEndLineNumber = o, this.modifiedEndColumn = u;
  }
  static createFromDiffChange(t, n, r) {
    const i = n.getStartLineNumber(t.originalStart), s = n.getStartColumn(t.originalStart), a = n.getEndLineNumber(t.originalStart + t.originalLength - 1), o = n.getEndColumn(t.originalStart + t.originalLength - 1), u = r.getStartLineNumber(t.modifiedStart), l = r.getStartColumn(t.modifiedStart), h = r.getEndLineNumber(t.modifiedStart + t.modifiedLength - 1), f = r.getEndColumn(t.modifiedStart + t.modifiedLength - 1);
    return new Tt(i, s, a, o, u, l, h, f);
  }
}
function ec(e) {
  if (e.length <= 1)
    return e;
  const t = [e[0]];
  let n = t[0];
  for (let r = 1, i = e.length; r < i; r++) {
    const s = e[r], a = s.originalStart - (n.originalStart + n.originalLength), o = s.modifiedStart - (n.modifiedStart + n.modifiedLength);
    Math.min(a, o) < Zu ? (n.originalLength = s.originalStart + s.originalLength - n.originalStart, n.modifiedLength = s.modifiedStart + s.modifiedLength - n.modifiedStart) : (t.push(s), n = s);
  }
  return t;
}
class Xt {
  constructor(t, n, r, i, s) {
    this.originalStartLineNumber = t, this.originalEndLineNumber = n, this.modifiedStartLineNumber = r, this.modifiedEndLineNumber = i, this.charChanges = s;
  }
  static createFromDiffResult(t, n, r, i, s, a, o) {
    let u, l, h, f, d;
    if (n.originalLength === 0 ? (u = r.getStartLineNumber(n.originalStart) - 1, l = 0) : (u = r.getStartLineNumber(n.originalStart), l = r.getEndLineNumber(n.originalStart + n.originalLength - 1)), n.modifiedLength === 0 ? (h = i.getStartLineNumber(n.modifiedStart) - 1, f = 0) : (h = i.getStartLineNumber(n.modifiedStart), f = i.getEndLineNumber(n.modifiedStart + n.modifiedLength - 1)), a && n.originalLength > 0 && n.originalLength < 20 && n.modifiedLength > 0 && n.modifiedLength < 20 && s()) {
      const m = r.createCharSequence(t, n.originalStart, n.originalStart + n.originalLength - 1), g = i.createCharSequence(t, n.modifiedStart, n.modifiedStart + n.modifiedLength - 1);
      if (m.getElements().length > 0 && g.getElements().length > 0) {
        let p = ko(m, g, s, !0).changes;
        o && (p = ec(p)), d = [];
        for (let w = 0, y = p.length; w < y; w++)
          d.push(Tt.createFromDiffChange(p[w], m, g));
      }
    }
    return new Xt(u, l, h, f, d);
  }
}
class tc {
  constructor(t, n, r) {
    this.shouldComputeCharChanges = r.shouldComputeCharChanges, this.shouldPostProcessCharChanges = r.shouldPostProcessCharChanges, this.shouldIgnoreTrimWhitespace = r.shouldIgnoreTrimWhitespace, this.shouldMakePrettyDiff = r.shouldMakePrettyDiff, this.originalLines = t, this.modifiedLines = n, this.original = new Ts(t), this.modified = new Ts(n), this.continueLineDiff = Ps(r.maxComputationTime), this.continueCharDiff = Ps(r.maxComputationTime === 0 ? 0 : Math.min(r.maxComputationTime, 5e3));
  }
  computeDiff() {
    if (this.original.lines.length === 1 && this.original.lines[0].length === 0)
      return this.modified.lines.length === 1 && this.modified.lines[0].length === 0 ? {
        quitEarly: !1,
        changes: []
      } : {
        quitEarly: !1,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: 1,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: this.modified.lines.length,
          charChanges: void 0
        }]
      };
    if (this.modified.lines.length === 1 && this.modified.lines[0].length === 0)
      return {
        quitEarly: !1,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: this.original.lines.length,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: 1,
          charChanges: void 0
        }]
      };
    const t = ko(this.original, this.modified, this.continueLineDiff, this.shouldMakePrettyDiff), n = t.changes, r = t.quitEarly;
    if (this.shouldIgnoreTrimWhitespace) {
      const o = [];
      for (let u = 0, l = n.length; u < l; u++)
        o.push(Xt.createFromDiffResult(this.shouldIgnoreTrimWhitespace, n[u], this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
      return {
        quitEarly: r,
        changes: o
      };
    }
    const i = [];
    let s = 0, a = 0;
    for (let o = -1, u = n.length; o < u; o++) {
      const l = o + 1 < u ? n[o + 1] : null, h = l ? l.originalStart : this.originalLines.length, f = l ? l.modifiedStart : this.modifiedLines.length;
      for (; s < h && a < f; ) {
        const d = this.originalLines[s], m = this.modifiedLines[a];
        if (d !== m) {
          {
            let g = _r(d, 1), p = _r(m, 1);
            for (; g > 1 && p > 1; ) {
              const w = d.charCodeAt(g - 2), y = m.charCodeAt(p - 2);
              if (w !== y)
                break;
              g--, p--;
            }
            (g > 1 || p > 1) && this._pushTrimWhitespaceCharChange(i, s + 1, 1, g, a + 1, 1, p);
          }
          {
            let g = Sr(d, 1), p = Sr(m, 1);
            const w = d.length + 1, y = m.length + 1;
            for (; g < w && p < y; ) {
              const N = d.charCodeAt(g - 1), b = d.charCodeAt(p - 1);
              if (N !== b)
                break;
              g++, p++;
            }
            (g < w || p < y) && this._pushTrimWhitespaceCharChange(i, s + 1, g, w, a + 1, p, y);
          }
        }
        s++, a++;
      }
      l && (i.push(Xt.createFromDiffResult(this.shouldIgnoreTrimWhitespace, l, this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges)), s += l.originalLength, a += l.modifiedLength);
    }
    return {
      quitEarly: r,
      changes: i
    };
  }
  _pushTrimWhitespaceCharChange(t, n, r, i, s, a, o) {
    if (this._mergeTrimWhitespaceCharChange(t, n, r, i, s, a, o))
      return;
    let u;
    this.shouldComputeCharChanges && (u = [new Tt(n, r, n, i, s, a, s, o)]), t.push(new Xt(n, n, s, s, u));
  }
  _mergeTrimWhitespaceCharChange(t, n, r, i, s, a, o) {
    const u = t.length;
    if (u === 0)
      return !1;
    const l = t[u - 1];
    return l.originalEndLineNumber === 0 || l.modifiedEndLineNumber === 0 ? !1 : l.originalEndLineNumber === n && l.modifiedEndLineNumber === s ? (this.shouldComputeCharChanges && l.charChanges && l.charChanges.push(new Tt(n, r, n, i, s, a, s, o)), !0) : l.originalEndLineNumber + 1 === n && l.modifiedEndLineNumber + 1 === s ? (l.originalEndLineNumber = n, l.modifiedEndLineNumber = s, this.shouldComputeCharChanges && l.charChanges && l.charChanges.push(new Tt(n, r, n, i, s, a, s, o)), !0) : !1;
  }
}
function _r(e, t) {
  const n = Sl(e);
  return n === -1 ? t : n + 1;
}
function Sr(e, t) {
  const n = Al(e);
  return n === -1 ? t : n + 2;
}
function Ps(e) {
  if (e === 0)
    return () => !0;
  const t = Date.now();
  return () => Date.now() - t < e;
}
class We {
  static trivial(t, n) {
    return new We([new K(j.ofLength(t.length), j.ofLength(n.length))], !1);
  }
  static trivialTimedOut(t, n) {
    return new We([new K(j.ofLength(t.length), j.ofLength(n.length))], !0);
  }
  constructor(t, n) {
    this.diffs = t, this.hitTimeout = n;
  }
}
class K {
  static invert(t, n) {
    const r = [];
    return Uu(t, (i, s) => {
      r.push(K.fromOffsetPairs(i ? i.getEndExclusives() : qe.zero, s ? s.getStarts() : new qe(n, (i ? i.seq2Range.endExclusive - i.seq1Range.endExclusive : 0) + n)));
    }), r;
  }
  static fromOffsetPairs(t, n) {
    return new K(new j(t.offset1, n.offset1), new j(t.offset2, n.offset2));
  }
  static assertSorted(t) {
    let n;
    for (const r of t) {
      if (n && !(n.seq1Range.endExclusive <= r.seq1Range.start && n.seq2Range.endExclusive <= r.seq2Range.start))
        throw new ue("Sequence diffs must be sorted");
      n = r;
    }
  }
  constructor(t, n) {
    this.seq1Range = t, this.seq2Range = n;
  }
  swap() {
    return new K(this.seq2Range, this.seq1Range);
  }
  toString() {
    return `${this.seq1Range} <-> ${this.seq2Range}`;
  }
  join(t) {
    return new K(this.seq1Range.join(t.seq1Range), this.seq2Range.join(t.seq2Range));
  }
  delta(t) {
    return t === 0 ? this : new K(this.seq1Range.delta(t), this.seq2Range.delta(t));
  }
  deltaStart(t) {
    return t === 0 ? this : new K(this.seq1Range.deltaStart(t), this.seq2Range.deltaStart(t));
  }
  deltaEnd(t) {
    return t === 0 ? this : new K(this.seq1Range.deltaEnd(t), this.seq2Range.deltaEnd(t));
  }
  intersect(t) {
    const n = this.seq1Range.intersect(t.seq1Range), r = this.seq2Range.intersect(t.seq2Range);
    if (!(!n || !r))
      return new K(n, r);
  }
  getStarts() {
    return new qe(this.seq1Range.start, this.seq2Range.start);
  }
  getEndExclusives() {
    return new qe(this.seq1Range.endExclusive, this.seq2Range.endExclusive);
  }
}
const it = class it {
  constructor(t, n) {
    this.offset1 = t, this.offset2 = n;
  }
  toString() {
    return `${this.offset1} <-> ${this.offset2}`;
  }
  delta(t) {
    return t === 0 ? this : new it(this.offset1 + t, this.offset2 + t);
  }
  equals(t) {
    return this.offset1 === t.offset1 && this.offset2 === t.offset2;
  }
};
it.zero = new it(0, 0), it.max = new it(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
let qe = it;
const jn = class jn {
  isValid() {
    return !0;
  }
};
jn.instance = new jn();
let rn = jn;
class nc {
  constructor(t) {
    if (this.timeout = t, this.startTime = Date.now(), this.valid = !0, t <= 0)
      throw new ue("timeout must be positive");
  }
  // Recommendation: Set a log-point `{this.disable()}` in the body
  isValid() {
    return !(Date.now() - this.startTime < this.timeout) && this.valid && (this.valid = !1), this.valid;
  }
}
class Zn {
  constructor(t, n) {
    this.width = t, this.height = n, this.array = [], this.array = new Array(t * n);
  }
  get(t, n) {
    return this.array[t + n * this.width];
  }
  set(t, n, r) {
    this.array[t + n * this.width] = r;
  }
}
function Ar(e) {
  return e === 32 || e === 9;
}
const Zt = class Zt {
  static getKey(t) {
    let n = this.chrKeys.get(t);
    return n === void 0 && (n = this.chrKeys.size, this.chrKeys.set(t, n)), n;
  }
  constructor(t, n, r) {
    this.range = t, this.lines = n, this.source = r, this.histogram = [];
    let i = 0;
    for (let s = t.startLineNumber - 1; s < t.endLineNumberExclusive - 1; s++) {
      const a = n[s];
      for (let u = 0; u < a.length; u++) {
        i++;
        const l = a[u], h = Zt.getKey(l);
        this.histogram[h] = (this.histogram[h] || 0) + 1;
      }
      i++;
      const o = Zt.getKey(`
`);
      this.histogram[o] = (this.histogram[o] || 0) + 1;
    }
    this.totalCount = i;
  }
  computeSimilarity(t) {
    let n = 0;
    const r = Math.max(this.histogram.length, t.histogram.length);
    for (let i = 0; i < r; i++)
      n += Math.abs((this.histogram[i] ?? 0) - (t.histogram[i] ?? 0));
    return 1 - n / (this.totalCount + t.totalCount);
  }
};
Zt.chrKeys = /* @__PURE__ */ new Map();
let Mn = Zt;
class rc {
  compute(t, n, r = rn.instance, i) {
    if (t.length === 0 || n.length === 0)
      return We.trivial(t, n);
    const s = new Zn(t.length, n.length), a = new Zn(t.length, n.length), o = new Zn(t.length, n.length);
    for (let g = 0; g < t.length; g++)
      for (let p = 0; p < n.length; p++) {
        if (!r.isValid())
          return We.trivialTimedOut(t, n);
        const w = g === 0 ? 0 : s.get(g - 1, p), y = p === 0 ? 0 : s.get(g, p - 1);
        let N;
        t.getElement(g) === n.getElement(p) ? (g === 0 || p === 0 ? N = 0 : N = s.get(g - 1, p - 1), g > 0 && p > 0 && a.get(g - 1, p - 1) === 3 && (N += o.get(g - 1, p - 1)), N += i ? i(g, p) : 1) : N = -1;
        const b = Math.max(w, y, N);
        if (b === N) {
          const _ = g > 0 && p > 0 ? o.get(g - 1, p - 1) : 0;
          o.set(g, p, _ + 1), a.set(g, p, 3);
        } else b === w ? (o.set(g, p, 0), a.set(g, p, 1)) : b === y && (o.set(g, p, 0), a.set(g, p, 2));
        s.set(g, p, b);
      }
    const u = [];
    let l = t.length, h = n.length;
    function f(g, p) {
      (g + 1 !== l || p + 1 !== h) && u.push(new K(new j(g + 1, l), new j(p + 1, h))), l = g, h = p;
    }
    let d = t.length - 1, m = n.length - 1;
    for (; d >= 0 && m >= 0; )
      a.get(d, m) === 3 ? (f(d, m), d--, m--) : a.get(d, m) === 1 ? d-- : m--;
    return f(-1, -1), u.reverse(), new We(u, !1);
  }
}
class Ro {
  compute(t, n, r = rn.instance) {
    if (t.length === 0 || n.length === 0)
      return We.trivial(t, n);
    const i = t, s = n;
    function a(p, w) {
      for (; p < i.length && w < s.length && i.getElement(p) === s.getElement(w); )
        p++, w++;
      return p;
    }
    let o = 0;
    const u = new ic();
    u.set(0, a(0, 0));
    const l = new sc();
    l.set(0, u.get(0) === 0 ? null : new Cs(null, 0, 0, u.get(0)));
    let h = 0;
    e: for (; ; ) {
      if (o++, !r.isValid())
        return We.trivialTimedOut(i, s);
      const p = -Math.min(o, s.length + o % 2), w = Math.min(o, i.length + o % 2);
      for (h = p; h <= w; h += 2) {
        const y = h === w ? -1 : u.get(h + 1), N = h === p ? -1 : u.get(h - 1) + 1, b = Math.min(Math.max(y, N), i.length), _ = b - h;
        if (b > i.length || _ > s.length)
          continue;
        const L = a(b, _);
        u.set(h, L);
        const S = b === y ? l.get(h + 1) : l.get(h - 1);
        if (l.set(h, L !== b ? new Cs(S, b, _, L - b) : S), u.get(h) === i.length && u.get(h) - h === s.length)
          break e;
      }
    }
    let f = l.get(h);
    const d = [];
    let m = i.length, g = s.length;
    for (; ; ) {
      const p = f ? f.x + f.length : 0, w = f ? f.y + f.length : 0;
      if ((p !== m || w !== g) && d.push(new K(new j(p, m), new j(w, g))), !f)
        break;
      m = f.x, g = f.y, f = f.prev;
    }
    return d.reverse(), new We(d, !1);
  }
}
class Cs {
  constructor(t, n, r, i) {
    this.prev = t, this.x = n, this.y = r, this.length = i;
  }
}
class ic {
  constructor() {
    this.positiveArr = new Int32Array(10), this.negativeArr = new Int32Array(10);
  }
  get(t) {
    return t < 0 ? (t = -t - 1, this.negativeArr[t]) : this.positiveArr[t];
  }
  set(t, n) {
    if (t < 0) {
      if (t = -t - 1, t >= this.negativeArr.length) {
        const r = this.negativeArr;
        this.negativeArr = new Int32Array(r.length * 2), this.negativeArr.set(r);
      }
      this.negativeArr[t] = n;
    } else {
      if (t >= this.positiveArr.length) {
        const r = this.positiveArr;
        this.positiveArr = new Int32Array(r.length * 2), this.positiveArr.set(r);
      }
      this.positiveArr[t] = n;
    }
  }
}
class sc {
  constructor() {
    this.positiveArr = [], this.negativeArr = [];
  }
  get(t) {
    return t < 0 ? (t = -t - 1, this.negativeArr[t]) : this.positiveArr[t];
  }
  set(t, n) {
    t < 0 ? (t = -t - 1, this.negativeArr[t] = n) : this.positiveArr[t] = n;
  }
}
class Tn {
  constructor(t, n, r) {
    this.lines = t, this.range = n, this.considerWhitespaceChanges = r, this.elements = [], this.firstElementOffsetByLineIdx = [], this.lineStartOffsets = [], this.trimmedWsLengthsByLineIdx = [], this.firstElementOffsetByLineIdx.push(0);
    for (let i = this.range.startLineNumber; i <= this.range.endLineNumber; i++) {
      let s = t[i - 1], a = 0;
      i === this.range.startLineNumber && this.range.startColumn > 1 && (a = this.range.startColumn - 1, s = s.substring(a)), this.lineStartOffsets.push(a);
      let o = 0;
      if (!r) {
        const l = s.trimStart();
        o = s.length - l.length, s = l.trimEnd();
      }
      this.trimmedWsLengthsByLineIdx.push(o);
      const u = i === this.range.endLineNumber ? Math.min(this.range.endColumn - 1 - a - o, s.length) : s.length;
      for (let l = 0; l < u; l++)
        this.elements.push(s.charCodeAt(l));
      i < this.range.endLineNumber && (this.elements.push(10), this.firstElementOffsetByLineIdx.push(this.elements.length));
    }
  }
  toString() {
    return `Slice: "${this.text}"`;
  }
  get text() {
    return this.getText(new j(0, this.length));
  }
  getText(t) {
    return this.elements.slice(t.start, t.endExclusive).map((n) => String.fromCharCode(n)).join("");
  }
  getElement(t) {
    return this.elements[t];
  }
  get length() {
    return this.elements.length;
  }
  getBoundaryScore(t) {
    const n = Vs(t > 0 ? this.elements[t - 1] : -1), r = Vs(t < this.elements.length ? this.elements[t] : -1);
    if (n === 7 && r === 8)
      return 0;
    if (n === 8)
      return 150;
    let i = 0;
    return n !== r && (i += 10, n === 0 && r === 1 && (i += 1)), i += Fs(n), i += Fs(r), i;
  }
  translateOffset(t, n = "right") {
    const r = Ft(this.firstElementOffsetByLineIdx, (s) => s <= t), i = t - this.firstElementOffsetByLineIdx[r];
    return new Q(this.range.startLineNumber + r, 1 + this.lineStartOffsets[r] + i + (i === 0 && n === "left" ? 0 : this.trimmedWsLengthsByLineIdx[r]));
  }
  translateRange(t) {
    const n = this.translateOffset(t.start, "right"), r = this.translateOffset(t.endExclusive, "left");
    return r.isBefore(n) ? q.fromPositions(r, r) : q.fromPositions(n, r);
  }
  /**
   * Finds the word that contains the character at the given offset
   */
  findWordContaining(t) {
    if (t < 0 || t >= this.elements.length || !wt(this.elements[t]))
      return;
    let n = t;
    for (; n > 0 && wt(this.elements[n - 1]); )
      n--;
    let r = t;
    for (; r < this.elements.length && wt(this.elements[r]); )
      r++;
    return new j(n, r);
  }
  /** fooBar has the two sub-words foo and bar */
  findSubWordContaining(t) {
    if (t < 0 || t >= this.elements.length || !wt(this.elements[t]))
      return;
    let n = t;
    for (; n > 0 && wt(this.elements[n - 1]) && !Is(this.elements[n]); )
      n--;
    let r = t;
    for (; r < this.elements.length && wt(this.elements[r]) && !Is(this.elements[r]); )
      r++;
    return new j(n, r);
  }
  countLinesIn(t) {
    return this.translateOffset(t.endExclusive).lineNumber - this.translateOffset(t.start).lineNumber;
  }
  isStronglyEqual(t, n) {
    return this.elements[t] === this.elements[n];
  }
  extendToFullLines(t) {
    const n = It(this.firstElementOffsetByLineIdx, (i) => i <= t.start) ?? 0, r = Hu(this.firstElementOffsetByLineIdx, (i) => t.endExclusive <= i) ?? this.elements.length;
    return new j(n, r);
  }
}
function wt(e) {
  return e >= 97 && e <= 122 || e >= 65 && e <= 90 || e >= 48 && e <= 57;
}
function Is(e) {
  return e >= 65 && e <= 90;
}
const ac = {
  0: 0,
  1: 0,
  2: 0,
  3: 10,
  4: 2,
  5: 30,
  6: 3,
  7: 10,
  8: 10
};
function Fs(e) {
  return ac[e];
}
function Vs(e) {
  return e === 10 ? 8 : e === 13 ? 7 : Ar(e) ? 6 : e >= 97 && e <= 122 ? 0 : e >= 65 && e <= 90 ? 1 : e >= 48 && e <= 57 ? 2 : e === -1 ? 3 : e === 44 || e === 59 ? 5 : 4;
}
function oc(e, t, n, r, i, s) {
  let { moves: a, excludedChanges: o } = uc(e, t, n, s);
  if (!s.isValid())
    return [];
  const u = e.filter((h) => !o.has(h)), l = cc(u, r, i, t, n, s);
  return ju(a, l), a = fc(a), a = a.filter((h) => {
    const f = h.original.toOffsetRange().slice(t).map((m) => m.trim());
    return f.join(`
`).length >= 15 && lc(f, (m) => m.length >= 2) >= 2;
  }), a = hc(e, a), a;
}
function lc(e, t) {
  let n = 0;
  for (const r of e)
    t(r) && n++;
  return n;
}
function uc(e, t, n, r) {
  const i = [], s = e.filter((u) => u.modified.isEmpty && u.original.length >= 3).map((u) => new Mn(u.original, t, u)), a = new Set(e.filter((u) => u.original.isEmpty && u.modified.length >= 3).map((u) => new Mn(u.modified, n, u))), o = /* @__PURE__ */ new Set();
  for (const u of s) {
    let l = -1, h;
    for (const f of a) {
      const d = u.computeSimilarity(f);
      d > l && (l = d, h = f);
    }
    if (l > 0.9 && h && (a.delete(h), i.push(new Ae(u.range, h.range)), o.add(u.source), o.add(h.source)), !r.isValid())
      return { moves: i, excludedChanges: o };
  }
  return { moves: i, excludedChanges: o };
}
function cc(e, t, n, r, i, s) {
  const a = [], o = new ku();
  for (const d of e)
    for (let m = d.original.startLineNumber; m < d.original.endLineNumberExclusive - 2; m++) {
      const g = `${t[m - 1]}:${t[m + 1 - 1]}:${t[m + 2 - 1]}`;
      o.add(g, { range: new z(m, m + 3) });
    }
  const u = [];
  e.sort(Gt((d) => d.modified.startLineNumber, Jt));
  for (const d of e) {
    let m = [];
    for (let g = d.modified.startLineNumber; g < d.modified.endLineNumberExclusive - 2; g++) {
      const p = `${n[g - 1]}:${n[g + 1 - 1]}:${n[g + 2 - 1]}`, w = new z(g, g + 3), y = [];
      o.forEach(p, ({ range: N }) => {
        for (const _ of m)
          if (_.originalLineRange.endLineNumberExclusive + 1 === N.endLineNumberExclusive && _.modifiedLineRange.endLineNumberExclusive + 1 === w.endLineNumberExclusive) {
            _.originalLineRange = new z(_.originalLineRange.startLineNumber, N.endLineNumberExclusive), _.modifiedLineRange = new z(_.modifiedLineRange.startLineNumber, w.endLineNumberExclusive), y.push(_);
            return;
          }
        const b = {
          modifiedLineRange: w,
          originalLineRange: N
        };
        u.push(b), y.push(b);
      }), m = y;
    }
    if (!s.isValid())
      return [];
  }
  u.sort(Wu(Gt((d) => d.modifiedLineRange.length, Jt)));
  const l = new Ve(), h = new Ve();
  for (const d of u) {
    const m = d.modifiedLineRange.startLineNumber - d.originalLineRange.startLineNumber, g = l.subtractFrom(d.modifiedLineRange), p = h.subtractFrom(d.originalLineRange).getWithDelta(m), w = g.getIntersection(p);
    for (const y of w.ranges) {
      if (y.length < 3)
        continue;
      const N = y, b = y.delta(-m);
      a.push(new Ae(b, N)), l.addRange(N), h.addRange(b);
    }
  }
  a.sort(Gt((d) => d.original.startLineNumber, Jt));
  const f = new En(e);
  for (let d = 0; d < a.length; d++) {
    const m = a[d], g = f.findLastMonotonous((S) => S.original.startLineNumber <= m.original.startLineNumber), p = It(e, (S) => S.modified.startLineNumber <= m.modified.startLineNumber), w = Math.max(m.original.startLineNumber - g.original.startLineNumber, m.modified.startLineNumber - p.modified.startLineNumber), y = f.findLastMonotonous((S) => S.original.startLineNumber < m.original.endLineNumberExclusive), N = It(e, (S) => S.modified.startLineNumber < m.modified.endLineNumberExclusive), b = Math.max(y.original.endLineNumberExclusive - m.original.endLineNumberExclusive, N.modified.endLineNumberExclusive - m.modified.endLineNumberExclusive);
    let _;
    for (_ = 0; _ < w; _++) {
      const S = m.original.startLineNumber - _ - 1, v = m.modified.startLineNumber - _ - 1;
      if (S > r.length || v > i.length || l.contains(v) || h.contains(S) || !Ds(r[S - 1], i[v - 1], s))
        break;
    }
    _ > 0 && (h.addRange(new z(m.original.startLineNumber - _, m.original.startLineNumber)), l.addRange(new z(m.modified.startLineNumber - _, m.modified.startLineNumber)));
    let L;
    for (L = 0; L < b; L++) {
      const S = m.original.endLineNumberExclusive + L, v = m.modified.endLineNumberExclusive + L;
      if (S > r.length || v > i.length || l.contains(v) || h.contains(S) || !Ds(r[S - 1], i[v - 1], s))
        break;
    }
    L > 0 && (h.addRange(new z(m.original.endLineNumberExclusive, m.original.endLineNumberExclusive + L)), l.addRange(new z(m.modified.endLineNumberExclusive, m.modified.endLineNumberExclusive + L))), (_ > 0 || L > 0) && (a[d] = new Ae(new z(m.original.startLineNumber - _, m.original.endLineNumberExclusive + L), new z(m.modified.startLineNumber - _, m.modified.endLineNumberExclusive + L)));
  }
  return a;
}
function Ds(e, t, n) {
  if (e.trim() === t.trim())
    return !0;
  if (e.length > 300 && t.length > 300)
    return !1;
  const i = new Ro().compute(new Tn([e], new q(1, 1, 1, e.length), !1), new Tn([t], new q(1, 1, 1, t.length), !1), n);
  let s = 0;
  const a = K.invert(i.diffs, e.length);
  for (const h of a)
    h.seq1Range.forEach((f) => {
      Ar(e.charCodeAt(f)) || s++;
    });
  function o(h) {
    let f = 0;
    for (let d = 0; d < e.length; d++)
      Ar(h.charCodeAt(d)) || f++;
    return f;
  }
  const u = o(e.length > t.length ? e : t);
  return s / u > 0.6 && u > 10;
}
function fc(e) {
  if (e.length === 0)
    return e;
  e.sort(Gt((n) => n.original.startLineNumber, Jt));
  const t = [e[0]];
  for (let n = 1; n < e.length; n++) {
    const r = t[t.length - 1], i = e[n], s = i.original.startLineNumber - r.original.endLineNumberExclusive, a = i.modified.startLineNumber - r.modified.endLineNumberExclusive;
    if (s >= 0 && a >= 0 && s + a <= 2) {
      t[t.length - 1] = r.join(i);
      continue;
    }
    t.push(i);
  }
  return t;
}
function hc(e, t) {
  const n = new En(e);
  return t = t.filter((r) => {
    const i = n.findLastMonotonous((o) => o.original.startLineNumber < r.original.endLineNumberExclusive) || new Ae(new z(1, 1), new z(1, 1)), s = It(e, (o) => o.modified.startLineNumber < r.modified.endLineNumberExclusive);
    return i !== s;
  }), t;
}
function Os(e, t, n) {
  let r = n;
  return r = $s(e, t, r), r = $s(e, t, r), r = dc(e, t, r), r;
}
function $s(e, t, n) {
  if (n.length === 0)
    return n;
  const r = [];
  r.push(n[0]);
  for (let s = 1; s < n.length; s++) {
    const a = r[r.length - 1];
    let o = n[s];
    if (o.seq1Range.isEmpty || o.seq2Range.isEmpty) {
      const u = o.seq1Range.start - a.seq1Range.endExclusive;
      let l;
      for (l = 1; l <= u && !(e.getElement(o.seq1Range.start - l) !== e.getElement(o.seq1Range.endExclusive - l) || t.getElement(o.seq2Range.start - l) !== t.getElement(o.seq2Range.endExclusive - l)); l++)
        ;
      if (l--, l === u) {
        r[r.length - 1] = new K(new j(a.seq1Range.start, o.seq1Range.endExclusive - u), new j(a.seq2Range.start, o.seq2Range.endExclusive - u));
        continue;
      }
      o = o.delta(-l);
    }
    r.push(o);
  }
  const i = [];
  for (let s = 0; s < r.length - 1; s++) {
    const a = r[s + 1];
    let o = r[s];
    if (o.seq1Range.isEmpty || o.seq2Range.isEmpty) {
      const u = a.seq1Range.start - o.seq1Range.endExclusive;
      let l;
      for (l = 0; l < u && !(!e.isStronglyEqual(o.seq1Range.start + l, o.seq1Range.endExclusive + l) || !t.isStronglyEqual(o.seq2Range.start + l, o.seq2Range.endExclusive + l)); l++)
        ;
      if (l === u) {
        r[s + 1] = new K(new j(o.seq1Range.start + u, a.seq1Range.endExclusive), new j(o.seq2Range.start + u, a.seq2Range.endExclusive));
        continue;
      }
      l > 0 && (o = o.delta(l));
    }
    i.push(o);
  }
  return r.length > 0 && i.push(r[r.length - 1]), i;
}
function dc(e, t, n) {
  if (!e.getBoundaryScore || !t.getBoundaryScore)
    return n;
  for (let r = 0; r < n.length; r++) {
    const i = r > 0 ? n[r - 1] : void 0, s = n[r], a = r + 1 < n.length ? n[r + 1] : void 0, o = new j(i ? i.seq1Range.endExclusive + 1 : 0, a ? a.seq1Range.start - 1 : e.length), u = new j(i ? i.seq2Range.endExclusive + 1 : 0, a ? a.seq2Range.start - 1 : t.length);
    s.seq1Range.isEmpty ? n[r] = Bs(s, e, t, o, u) : s.seq2Range.isEmpty && (n[r] = Bs(s.swap(), t, e, u, o).swap());
  }
  return n;
}
function Bs(e, t, n, r, i) {
  let a = 1;
  for (; e.seq1Range.start - a >= r.start && e.seq2Range.start - a >= i.start && n.isStronglyEqual(e.seq2Range.start - a, e.seq2Range.endExclusive - a) && a < 100; )
    a++;
  a--;
  let o = 0;
  for (; e.seq1Range.start + o < r.endExclusive && e.seq2Range.endExclusive + o < i.endExclusive && n.isStronglyEqual(e.seq2Range.start + o, e.seq2Range.endExclusive + o) && o < 100; )
    o++;
  if (a === 0 && o === 0)
    return e;
  let u = 0, l = -1;
  for (let h = -a; h <= o; h++) {
    const f = e.seq2Range.start + h, d = e.seq2Range.endExclusive + h, m = e.seq1Range.start + h, g = t.getBoundaryScore(m) + n.getBoundaryScore(f) + n.getBoundaryScore(d);
    g > l && (l = g, u = h);
  }
  return e.delta(u);
}
function gc(e, t, n) {
  const r = [];
  for (const i of n) {
    const s = r[r.length - 1];
    if (!s) {
      r.push(i);
      continue;
    }
    i.seq1Range.start - s.seq1Range.endExclusive <= 2 || i.seq2Range.start - s.seq2Range.endExclusive <= 2 ? r[r.length - 1] = new K(s.seq1Range.join(i.seq1Range), s.seq2Range.join(i.seq2Range)) : r.push(i);
  }
  return r;
}
function Us(e, t, n, r, i = !1) {
  const s = K.invert(n, e.length), a = [];
  let o = new qe(0, 0);
  function u(h, f) {
    if (h.offset1 < o.offset1 || h.offset2 < o.offset2)
      return;
    const d = r(e, h.offset1), m = r(t, h.offset2);
    if (!d || !m)
      return;
    let g = new K(d, m);
    const p = g.intersect(f);
    let w = p.seq1Range.length, y = p.seq2Range.length;
    for (; s.length > 0; ) {
      const N = s[0];
      if (!(N.seq1Range.intersects(g.seq1Range) || N.seq2Range.intersects(g.seq2Range)))
        break;
      const _ = r(e, N.seq1Range.start), L = r(t, N.seq2Range.start), S = new K(_, L), v = S.intersect(N);
      if (w += v.seq1Range.length, y += v.seq2Range.length, g = g.join(S), g.seq1Range.endExclusive >= N.seq1Range.endExclusive)
        s.shift();
      else
        break;
    }
    (i && w + y < g.seq1Range.length + g.seq2Range.length || w + y < (g.seq1Range.length + g.seq2Range.length) * 2 / 3) && a.push(g), o = g.getEndExclusives();
  }
  for (; s.length > 0; ) {
    const h = s.shift();
    h.seq1Range.isEmpty || (u(h.getStarts(), h), u(h.getEndExclusives().delta(-1), h));
  }
  return mc(n, a);
}
function mc(e, t) {
  const n = [];
  for (; e.length > 0 || t.length > 0; ) {
    const r = e[0], i = t[0];
    let s;
    r && (!i || r.seq1Range.start < i.seq1Range.start) ? s = e.shift() : s = t.shift(), n.length > 0 && n[n.length - 1].seq1Range.endExclusive >= s.seq1Range.start ? n[n.length - 1] = n[n.length - 1].join(s) : n.push(s);
  }
  return n;
}
function pc(e, t, n) {
  let r = n;
  if (r.length === 0)
    return r;
  let i = 0, s;
  do {
    s = !1;
    const o = [
      r[0]
    ];
    for (let u = 1; u < r.length; u++) {
      let f = function(m, g) {
        const p = new j(h.seq1Range.endExclusive, l.seq1Range.start);
        return e.getText(p).replace(/\s/g, "").length <= 4 && (m.seq1Range.length + m.seq2Range.length > 5 || g.seq1Range.length + g.seq2Range.length > 5);
      };
      var a = f;
      const l = r[u], h = o[o.length - 1];
      f(h, l) ? (s = !0, o[o.length - 1] = o[o.length - 1].join(l)) : o.push(l);
    }
    r = o;
  } while (i++ < 10 && s);
  return r;
}
function bc(e, t, n) {
  let r = n;
  if (r.length === 0)
    return r;
  let i = 0, s;
  do {
    s = !1;
    const u = [
      r[0]
    ];
    for (let l = 1; l < r.length; l++) {
      let d = function(g, p) {
        const w = new j(f.seq1Range.endExclusive, h.seq1Range.start);
        if (e.countLinesIn(w) > 5 || w.length > 500)
          return !1;
        const N = e.getText(w).trim();
        if (N.length > 20 || N.split(/\r\n|\r|\n/).length > 1)
          return !1;
        const b = e.countLinesIn(g.seq1Range), _ = g.seq1Range.length, L = t.countLinesIn(g.seq2Range), S = g.seq2Range.length, v = e.countLinesIn(p.seq1Range), k = p.seq1Range.length, M = t.countLinesIn(p.seq2Range), V = p.seq2Range.length, T = 2 * 40 + 50;
        function x(A) {
          return Math.min(A, T);
        }
        return Math.pow(Math.pow(x(b * 40 + _), 1.5) + Math.pow(x(L * 40 + S), 1.5), 1.5) + Math.pow(Math.pow(x(v * 40 + k), 1.5) + Math.pow(x(M * 40 + V), 1.5), 1.5) > (T ** 1.5) ** 1.5 * 1.3;
      };
      var o = d;
      const h = r[l], f = u[u.length - 1];
      d(f, h) ? (s = !0, u[u.length - 1] = u[u.length - 1].join(h)) : u.push(h);
    }
    r = u;
  } while (i++ < 10 && s);
  const a = [];
  return qu(r, (u, l, h) => {
    let f = l;
    function d(N) {
      return N.length > 0 && N.trim().length <= 3 && l.seq1Range.length + l.seq2Range.length > 100;
    }
    const m = e.extendToFullLines(l.seq1Range), g = e.getText(new j(m.start, l.seq1Range.start));
    d(g) && (f = f.deltaStart(-g.length));
    const p = e.getText(new j(l.seq1Range.endExclusive, m.endExclusive));
    d(p) && (f = f.deltaEnd(p.length));
    const w = K.fromOffsetPairs(u ? u.getEndExclusives() : qe.zero, h ? h.getStarts() : qe.max), y = f.intersect(w);
    a.length > 0 && y.getStarts().equals(a[a.length - 1].getEndExclusives()) ? a[a.length - 1] = a[a.length - 1].join(y) : a.push(y);
  }), a;
}
class qs {
  constructor(t, n) {
    this.trimmedHash = t, this.lines = n;
  }
  getElement(t) {
    return this.trimmedHash[t];
  }
  get length() {
    return this.trimmedHash.length;
  }
  getBoundaryScore(t) {
    const n = t === 0 ? 0 : js(this.lines[t - 1]), r = t === this.lines.length ? 0 : js(this.lines[t]);
    return 1e3 - (n + r);
  }
  getText(t) {
    return this.lines.slice(t.start, t.endExclusive).join(`
`);
  }
  isStronglyEqual(t, n) {
    return this.lines[t] === this.lines[n];
  }
}
function js(e) {
  let t = 0;
  for (; t < e.length && (e.charCodeAt(t) === 32 || e.charCodeAt(t) === 9); )
    t++;
  return t;
}
class wc {
  constructor() {
    this.dynamicProgrammingDiffing = new rc(), this.myersDiffingAlgorithm = new Ro();
  }
  computeDiff(t, n, r) {
    if (t.length <= 1 && $u(t, n, (v, k) => v === k))
      return new yn([], [], !1);
    if (t.length === 1 && t[0].length === 0 || n.length === 1 && n[0].length === 0)
      return new yn([
        new je(new z(1, t.length + 1), new z(1, n.length + 1), [
          new _e(new q(1, 1, t.length, t[t.length - 1].length + 1), new q(1, 1, n.length, n[n.length - 1].length + 1))
        ])
      ], [], !1);
    const i = r.maxComputationTimeMs === 0 ? rn.instance : new nc(r.maxComputationTimeMs), s = !r.ignoreTrimWhitespace, a = /* @__PURE__ */ new Map();
    function o(v) {
      let k = a.get(v);
      return k === void 0 && (k = a.size, a.set(v, k)), k;
    }
    const u = t.map((v) => o(v.trim())), l = n.map((v) => o(v.trim())), h = new qs(u, t), f = new qs(l, n), d = h.length + f.length < 1700 ? this.dynamicProgrammingDiffing.compute(h, f, i, (v, k) => t[v] === n[k] ? n[k].length === 0 ? 0.1 : 1 + Math.log(1 + n[k].length) : 0.99) : this.myersDiffingAlgorithm.compute(h, f, i);
    let m = d.diffs, g = d.hitTimeout;
    m = Os(h, f, m), m = pc(h, f, m);
    const p = [], w = (v) => {
      if (s)
        for (let k = 0; k < v; k++) {
          const M = y + k, V = N + k;
          if (t[M] !== n[V]) {
            const T = this.refineDiff(t, n, new K(new j(M, M + 1), new j(V, V + 1)), i, s, r);
            for (const x of T.mappings)
              p.push(x);
            T.hitTimeout && (g = !0);
          }
        }
    };
    let y = 0, N = 0;
    for (const v of m) {
      Ln(() => v.seq1Range.start - y === v.seq2Range.start - N);
      const k = v.seq1Range.start - y;
      w(k), y = v.seq1Range.endExclusive, N = v.seq2Range.endExclusive;
      const M = this.refineDiff(t, n, v, i, s, r);
      M.hitTimeout && (g = !0);
      for (const V of M.mappings)
        p.push(V);
    }
    w(t.length - y);
    const b = new dn(t), _ = new dn(n), L = Ms(p, b, _);
    let S = [];
    return r.computeMoves && (S = this.computeMoves(L, t, n, u, l, i, s, r)), Ln(() => {
      function v(M, V) {
        if (M.lineNumber < 1 || M.lineNumber > V.length)
          return !1;
        const T = V[M.lineNumber - 1];
        return !(M.column < 1 || M.column > T.length + 1);
      }
      function k(M, V) {
        return !(M.startLineNumber < 1 || M.startLineNumber > V.length + 1 || M.endLineNumberExclusive < 1 || M.endLineNumberExclusive > V.length + 1);
      }
      for (const M of L) {
        if (!M.innerChanges)
          return !1;
        for (const V of M.innerChanges)
          if (!(v(V.modifiedRange.getStartPosition(), n) && v(V.modifiedRange.getEndPosition(), n) && v(V.originalRange.getStartPosition(), t) && v(V.originalRange.getEndPosition(), t)))
            return !1;
        if (!k(M.modified, n) || !k(M.original, t))
          return !1;
      }
      return !0;
    }), new yn(L, S, g);
  }
  computeMoves(t, n, r, i, s, a, o, u) {
    return oc(t, n, r, i, s, a).map((f) => {
      const d = this.refineDiff(n, r, new K(f.original.toOffsetRange(), f.modified.toOffsetRange()), a, o, u), m = Ms(d.mappings, new dn(n), new dn(r), !0);
      return new Ou(f, m);
    });
  }
  refineDiff(t, n, r, i, s, a) {
    const u = xc(r).toRangeMapping2(t, n), l = new Tn(t, u.originalRange, s), h = new Tn(n, u.modifiedRange, s), f = l.length + h.length < 500 ? this.dynamicProgrammingDiffing.compute(l, h, i) : this.myersDiffingAlgorithm.compute(l, h, i);
    let d = f.diffs;
    return d = Os(l, h, d), d = Us(l, h, d, (g, p) => g.findWordContaining(p)), a.extendToSubwords && (d = Us(l, h, d, (g, p) => g.findSubWordContaining(p), !0)), d = gc(l, h, d), d = bc(l, h, d), {
      mappings: d.map((g) => new _e(l.translateRange(g.seq1Range), h.translateRange(g.seq2Range))),
      hitTimeout: f.hitTimeout
    };
  }
}
function xc(e) {
  return new Ae(new z(e.seq1Range.start + 1, e.seq1Range.endExclusive + 1), new z(e.seq2Range.start + 1, e.seq2Range.endExclusive + 1));
}
const Ws = {
  getLegacy: () => new Yu(),
  getDefault: () => new wc()
};
function Ke(e, t) {
  const n = Math.pow(10, t);
  return Math.round(e * n) / n;
}
class R {
  constructor(t, n, r, i = 1) {
    this._rgbaBrand = void 0, this.r = Math.min(255, Math.max(0, t)) | 0, this.g = Math.min(255, Math.max(0, n)) | 0, this.b = Math.min(255, Math.max(0, r)) | 0, this.a = Ke(Math.max(Math.min(1, i), 0), 3);
  }
  static equals(t, n) {
    return t.r === n.r && t.g === n.g && t.b === n.b && t.a === n.a;
  }
}
class Se {
  constructor(t, n, r, i) {
    this._hslaBrand = void 0, this.h = Math.max(Math.min(360, t), 0) | 0, this.s = Ke(Math.max(Math.min(1, n), 0), 3), this.l = Ke(Math.max(Math.min(1, r), 0), 3), this.a = Ke(Math.max(Math.min(1, i), 0), 3);
  }
  static equals(t, n) {
    return t.h === n.h && t.s === n.s && t.l === n.l && t.a === n.a;
  }
  /**
   * Converts an RGB color value to HSL. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes r, g, and b are contained in the set [0, 255] and
   * returns h in the set [0, 360], s, and l in the set [0, 1].
   */
  static fromRGBA(t) {
    const n = t.r / 255, r = t.g / 255, i = t.b / 255, s = t.a, a = Math.max(n, r, i), o = Math.min(n, r, i);
    let u = 0, l = 0;
    const h = (o + a) / 2, f = a - o;
    if (f > 0) {
      switch (l = Math.min(h <= 0.5 ? f / (2 * h) : f / (2 - 2 * h), 1), a) {
        case n:
          u = (r - i) / f + (r < i ? 6 : 0);
          break;
        case r:
          u = (i - n) / f + 2;
          break;
        case i:
          u = (n - r) / f + 4;
          break;
      }
      u *= 60, u = Math.round(u);
    }
    return new Se(u, l, h, s);
  }
  static _hue2rgb(t, n, r) {
    return r < 0 && (r += 1), r > 1 && (r -= 1), r < 1 / 6 ? t + (n - t) * 6 * r : r < 1 / 2 ? n : r < 2 / 3 ? t + (n - t) * (2 / 3 - r) * 6 : t;
  }
  /**
   * Converts an HSL color value to RGB. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes h in the set [0, 360] s, and l are contained in the set [0, 1] and
   * returns r, g, and b in the set [0, 255].
   */
  static toRGBA(t) {
    const n = t.h / 360, { s: r, l: i, a: s } = t;
    let a, o, u;
    if (r === 0)
      a = o = u = i;
    else {
      const l = i < 0.5 ? i * (1 + r) : i + r - i * r, h = 2 * i - l;
      a = Se._hue2rgb(h, l, n + 1 / 3), o = Se._hue2rgb(h, l, n), u = Se._hue2rgb(h, l, n - 1 / 3);
    }
    return new R(Math.round(a * 255), Math.round(o * 255), Math.round(u * 255), s);
  }
}
class Nt {
  constructor(t, n, r, i) {
    this._hsvaBrand = void 0, this.h = Math.max(Math.min(360, t), 0) | 0, this.s = Ke(Math.max(Math.min(1, n), 0), 3), this.v = Ke(Math.max(Math.min(1, r), 0), 3), this.a = Ke(Math.max(Math.min(1, i), 0), 3);
  }
  static equals(t, n) {
    return t.h === n.h && t.s === n.s && t.v === n.v && t.a === n.a;
  }
  // from http://www.rapidtables.com/convert/color/rgb-to-hsv.htm
  static fromRGBA(t) {
    const n = t.r / 255, r = t.g / 255, i = t.b / 255, s = Math.max(n, r, i), a = Math.min(n, r, i), o = s - a, u = s === 0 ? 0 : o / s;
    let l;
    return o === 0 ? l = 0 : s === n ? l = ((r - i) / o % 6 + 6) % 6 : s === r ? l = (i - n) / o + 2 : l = (n - r) / o + 4, new Nt(Math.round(l * 60), u, s, t.a);
  }
  // from http://www.rapidtables.com/convert/color/hsv-to-rgb.htm
  static toRGBA(t) {
    const { h: n, s: r, v: i, a: s } = t, a = i * r, o = a * (1 - Math.abs(n / 60 % 2 - 1)), u = i - a;
    let [l, h, f] = [0, 0, 0];
    return n < 60 ? (l = a, h = o) : n < 120 ? (l = o, h = a) : n < 180 ? (h = a, f = o) : n < 240 ? (h = o, f = a) : n < 300 ? (l = o, f = a) : n <= 360 && (l = a, f = o), l = Math.round((l + u) * 255), h = Math.round((h + u) * 255), f = Math.round((f + u) * 255), new R(l, h, f, s);
  }
}
var J;
let Pn = (J = class {
  static fromHex(t) {
    return J.Format.CSS.parseHex(t) || J.red;
  }
  static equals(t, n) {
    return !t && !n ? !0 : !t || !n ? !1 : t.equals(n);
  }
  get hsla() {
    return this._hsla ? this._hsla : Se.fromRGBA(this.rgba);
  }
  get hsva() {
    return this._hsva ? this._hsva : Nt.fromRGBA(this.rgba);
  }
  constructor(t) {
    if (t)
      if (t instanceof R)
        this.rgba = t;
      else if (t instanceof Se)
        this._hsla = t, this.rgba = Se.toRGBA(t);
      else if (t instanceof Nt)
        this._hsva = t, this.rgba = Nt.toRGBA(t);
      else
        throw new Error("Invalid color ctor argument");
    else throw new Error("Color needs a value");
  }
  equals(t) {
    return !!t && R.equals(this.rgba, t.rgba) && Se.equals(this.hsla, t.hsla) && Nt.equals(this.hsva, t.hsva);
  }
  /**
   * http://www.w3.org/TR/WCAG20/#relativeluminancedef
   * Returns the number in the set [0, 1]. O => Darkest Black. 1 => Lightest white.
   */
  getRelativeLuminance() {
    const t = J._relativeLuminanceForComponent(this.rgba.r), n = J._relativeLuminanceForComponent(this.rgba.g), r = J._relativeLuminanceForComponent(this.rgba.b), i = 0.2126 * t + 0.7152 * n + 0.0722 * r;
    return Ke(i, 4);
  }
  static _relativeLuminanceForComponent(t) {
    const n = t / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  }
  /**
   *	http://24ways.org/2010/calculating-color-contrast
   *  Return 'true' if lighter color otherwise 'false'
   */
  isLighter() {
    return (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1e3 >= 128;
  }
  isLighterThan(t) {
    const n = this.getRelativeLuminance(), r = t.getRelativeLuminance();
    return n > r;
  }
  isDarkerThan(t) {
    const n = this.getRelativeLuminance(), r = t.getRelativeLuminance();
    return n < r;
  }
  lighten(t) {
    return new J(new Se(this.hsla.h, this.hsla.s, this.hsla.l + this.hsla.l * t, this.hsla.a));
  }
  darken(t) {
    return new J(new Se(this.hsla.h, this.hsla.s, this.hsla.l - this.hsla.l * t, this.hsla.a));
  }
  transparent(t) {
    const { r: n, g: r, b: i, a: s } = this.rgba;
    return new J(new R(n, r, i, s * t));
  }
  isTransparent() {
    return this.rgba.a === 0;
  }
  isOpaque() {
    return this.rgba.a === 1;
  }
  opposite() {
    return new J(new R(255 - this.rgba.r, 255 - this.rgba.g, 255 - this.rgba.b, this.rgba.a));
  }
  /**
   * Mixes the current color with the provided color based on the given factor.
   * @param color The color to mix with
   * @param factor The factor of mixing (0 means this color, 1 means the input color, 0.5 means equal mix)
   * @returns A new color representing the mix
   */
  mix(t, n = 0.5) {
    const r = Math.min(Math.max(n, 0), 1), i = this.rgba, s = t.rgba, a = i.r + (s.r - i.r) * r, o = i.g + (s.g - i.g) * r, u = i.b + (s.b - i.b) * r, l = i.a + (s.a - i.a) * r;
    return new J(new R(a, o, u, l));
  }
  makeOpaque(t) {
    if (this.isOpaque() || t.rgba.a !== 1)
      return this;
    const { r: n, g: r, b: i, a: s } = this.rgba;
    return new J(new R(t.rgba.r - s * (t.rgba.r - n), t.rgba.g - s * (t.rgba.g - r), t.rgba.b - s * (t.rgba.b - i), 1));
  }
  toString() {
    return this._toString || (this._toString = J.Format.CSS.format(this)), this._toString;
  }
  toNumber32Bit() {
    return this._toNumber32Bit || (this._toNumber32Bit = (this.rgba.r << 24 | this.rgba.g << 16 | this.rgba.b << 8 | this.rgba.a * 255 << 0) >>> 0), this._toNumber32Bit;
  }
  static getLighterColor(t, n, r) {
    if (t.isLighterThan(n))
      return t;
    r = r || 0.5;
    const i = t.getRelativeLuminance(), s = n.getRelativeLuminance();
    return r = r * (s - i) / s, t.lighten(r);
  }
  static getDarkerColor(t, n, r) {
    if (t.isDarkerThan(n))
      return t;
    r = r || 0.5;
    const i = t.getRelativeLuminance(), s = n.getRelativeLuminance();
    return r = r * (i - s) / i, t.darken(r);
  }
}, J.white = new J(new R(255, 255, 255, 1)), J.black = new J(new R(0, 0, 0, 1)), J.red = new J(new R(255, 0, 0, 1)), J.blue = new J(new R(0, 0, 255, 1)), J.green = new J(new R(0, 255, 0, 1)), J.cyan = new J(new R(0, 255, 255, 1)), J.lightgrey = new J(new R(211, 211, 211, 1)), J.transparent = new J(new R(0, 0, 0, 0)), J);
(function(e) {
  (function(t) {
    (function(n) {
      function r(p) {
        return p.rgba.a === 1 ? `rgb(${p.rgba.r}, ${p.rgba.g}, ${p.rgba.b})` : e.Format.CSS.formatRGBA(p);
      }
      n.formatRGB = r;
      function i(p) {
        return `rgba(${p.rgba.r}, ${p.rgba.g}, ${p.rgba.b}, ${+p.rgba.a.toFixed(2)})`;
      }
      n.formatRGBA = i;
      function s(p) {
        return p.hsla.a === 1 ? `hsl(${p.hsla.h}, ${Math.round(p.hsla.s * 100)}%, ${Math.round(p.hsla.l * 100)}%)` : e.Format.CSS.formatHSLA(p);
      }
      n.formatHSL = s;
      function a(p) {
        return `hsla(${p.hsla.h}, ${Math.round(p.hsla.s * 100)}%, ${Math.round(p.hsla.l * 100)}%, ${p.hsla.a.toFixed(2)})`;
      }
      n.formatHSLA = a;
      function o(p) {
        const w = p.toString(16);
        return w.length !== 2 ? "0" + w : w;
      }
      function u(p) {
        return `#${o(p.rgba.r)}${o(p.rgba.g)}${o(p.rgba.b)}`;
      }
      n.formatHex = u;
      function l(p, w = !1) {
        return w && p.rgba.a === 1 ? e.Format.CSS.formatHex(p) : `#${o(p.rgba.r)}${o(p.rgba.g)}${o(p.rgba.b)}${o(Math.round(p.rgba.a * 255))}`;
      }
      n.formatHexA = l;
      function h(p) {
        return p.isOpaque() ? e.Format.CSS.formatHex(p) : e.Format.CSS.formatRGBA(p);
      }
      n.format = h;
      function f(p) {
        var w, y, N, b, _, L, S;
        if (p === "transparent")
          return e.transparent;
        if (p.startsWith("#"))
          return m(p);
        if (p.startsWith("rgba(")) {
          const v = p.match(/rgba\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+), *(?<a>(?:\+|-)?\d+(\.\d+)?)\)/);
          if (!v)
            throw new Error("Invalid color format " + p);
          const k = parseInt(((w = v.groups) == null ? void 0 : w.r) ?? "0"), M = parseInt(((y = v.groups) == null ? void 0 : y.g) ?? "0"), V = parseInt(((N = v.groups) == null ? void 0 : N.b) ?? "0"), T = parseFloat(((b = v.groups) == null ? void 0 : b.a) ?? "0");
          return new e(new R(k, M, V, T));
        }
        if (p.startsWith("rgb(")) {
          const v = p.match(/rgb\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+)\)/);
          if (!v)
            throw new Error("Invalid color format " + p);
          const k = parseInt(((_ = v.groups) == null ? void 0 : _.r) ?? "0"), M = parseInt(((L = v.groups) == null ? void 0 : L.g) ?? "0"), V = parseInt(((S = v.groups) == null ? void 0 : S.b) ?? "0");
          return new e(new R(k, M, V));
        }
        return d(p);
      }
      n.parse = f;
      function d(p) {
        switch (p) {
          case "aliceblue":
            return new e(new R(240, 248, 255, 1));
          case "antiquewhite":
            return new e(new R(250, 235, 215, 1));
          case "aqua":
            return new e(new R(0, 255, 255, 1));
          case "aquamarine":
            return new e(new R(127, 255, 212, 1));
          case "azure":
            return new e(new R(240, 255, 255, 1));
          case "beige":
            return new e(new R(245, 245, 220, 1));
          case "bisque":
            return new e(new R(255, 228, 196, 1));
          case "black":
            return new e(new R(0, 0, 0, 1));
          case "blanchedalmond":
            return new e(new R(255, 235, 205, 1));
          case "blue":
            return new e(new R(0, 0, 255, 1));
          case "blueviolet":
            return new e(new R(138, 43, 226, 1));
          case "brown":
            return new e(new R(165, 42, 42, 1));
          case "burlywood":
            return new e(new R(222, 184, 135, 1));
          case "cadetblue":
            return new e(new R(95, 158, 160, 1));
          case "chartreuse":
            return new e(new R(127, 255, 0, 1));
          case "chocolate":
            return new e(new R(210, 105, 30, 1));
          case "coral":
            return new e(new R(255, 127, 80, 1));
          case "cornflowerblue":
            return new e(new R(100, 149, 237, 1));
          case "cornsilk":
            return new e(new R(255, 248, 220, 1));
          case "crimson":
            return new e(new R(220, 20, 60, 1));
          case "cyan":
            return new e(new R(0, 255, 255, 1));
          case "darkblue":
            return new e(new R(0, 0, 139, 1));
          case "darkcyan":
            return new e(new R(0, 139, 139, 1));
          case "darkgoldenrod":
            return new e(new R(184, 134, 11, 1));
          case "darkgray":
            return new e(new R(169, 169, 169, 1));
          case "darkgreen":
            return new e(new R(0, 100, 0, 1));
          case "darkgrey":
            return new e(new R(169, 169, 169, 1));
          case "darkkhaki":
            return new e(new R(189, 183, 107, 1));
          case "darkmagenta":
            return new e(new R(139, 0, 139, 1));
          case "darkolivegreen":
            return new e(new R(85, 107, 47, 1));
          case "darkorange":
            return new e(new R(255, 140, 0, 1));
          case "darkorchid":
            return new e(new R(153, 50, 204, 1));
          case "darkred":
            return new e(new R(139, 0, 0, 1));
          case "darksalmon":
            return new e(new R(233, 150, 122, 1));
          case "darkseagreen":
            return new e(new R(143, 188, 143, 1));
          case "darkslateblue":
            return new e(new R(72, 61, 139, 1));
          case "darkslategray":
            return new e(new R(47, 79, 79, 1));
          case "darkslategrey":
            return new e(new R(47, 79, 79, 1));
          case "darkturquoise":
            return new e(new R(0, 206, 209, 1));
          case "darkviolet":
            return new e(new R(148, 0, 211, 1));
          case "deeppink":
            return new e(new R(255, 20, 147, 1));
          case "deepskyblue":
            return new e(new R(0, 191, 255, 1));
          case "dimgray":
            return new e(new R(105, 105, 105, 1));
          case "dimgrey":
            return new e(new R(105, 105, 105, 1));
          case "dodgerblue":
            return new e(new R(30, 144, 255, 1));
          case "firebrick":
            return new e(new R(178, 34, 34, 1));
          case "floralwhite":
            return new e(new R(255, 250, 240, 1));
          case "forestgreen":
            return new e(new R(34, 139, 34, 1));
          case "fuchsia":
            return new e(new R(255, 0, 255, 1));
          case "gainsboro":
            return new e(new R(220, 220, 220, 1));
          case "ghostwhite":
            return new e(new R(248, 248, 255, 1));
          case "gold":
            return new e(new R(255, 215, 0, 1));
          case "goldenrod":
            return new e(new R(218, 165, 32, 1));
          case "gray":
            return new e(new R(128, 128, 128, 1));
          case "green":
            return new e(new R(0, 128, 0, 1));
          case "greenyellow":
            return new e(new R(173, 255, 47, 1));
          case "grey":
            return new e(new R(128, 128, 128, 1));
          case "honeydew":
            return new e(new R(240, 255, 240, 1));
          case "hotpink":
            return new e(new R(255, 105, 180, 1));
          case "indianred":
            return new e(new R(205, 92, 92, 1));
          case "indigo":
            return new e(new R(75, 0, 130, 1));
          case "ivory":
            return new e(new R(255, 255, 240, 1));
          case "khaki":
            return new e(new R(240, 230, 140, 1));
          case "lavender":
            return new e(new R(230, 230, 250, 1));
          case "lavenderblush":
            return new e(new R(255, 240, 245, 1));
          case "lawngreen":
            return new e(new R(124, 252, 0, 1));
          case "lemonchiffon":
            return new e(new R(255, 250, 205, 1));
          case "lightblue":
            return new e(new R(173, 216, 230, 1));
          case "lightcoral":
            return new e(new R(240, 128, 128, 1));
          case "lightcyan":
            return new e(new R(224, 255, 255, 1));
          case "lightgoldenrodyellow":
            return new e(new R(250, 250, 210, 1));
          case "lightgray":
            return new e(new R(211, 211, 211, 1));
          case "lightgreen":
            return new e(new R(144, 238, 144, 1));
          case "lightgrey":
            return new e(new R(211, 211, 211, 1));
          case "lightpink":
            return new e(new R(255, 182, 193, 1));
          case "lightsalmon":
            return new e(new R(255, 160, 122, 1));
          case "lightseagreen":
            return new e(new R(32, 178, 170, 1));
          case "lightskyblue":
            return new e(new R(135, 206, 250, 1));
          case "lightslategray":
            return new e(new R(119, 136, 153, 1));
          case "lightslategrey":
            return new e(new R(119, 136, 153, 1));
          case "lightsteelblue":
            return new e(new R(176, 196, 222, 1));
          case "lightyellow":
            return new e(new R(255, 255, 224, 1));
          case "lime":
            return new e(new R(0, 255, 0, 1));
          case "limegreen":
            return new e(new R(50, 205, 50, 1));
          case "linen":
            return new e(new R(250, 240, 230, 1));
          case "magenta":
            return new e(new R(255, 0, 255, 1));
          case "maroon":
            return new e(new R(128, 0, 0, 1));
          case "mediumaquamarine":
            return new e(new R(102, 205, 170, 1));
          case "mediumblue":
            return new e(new R(0, 0, 205, 1));
          case "mediumorchid":
            return new e(new R(186, 85, 211, 1));
          case "mediumpurple":
            return new e(new R(147, 112, 219, 1));
          case "mediumseagreen":
            return new e(new R(60, 179, 113, 1));
          case "mediumslateblue":
            return new e(new R(123, 104, 238, 1));
          case "mediumspringgreen":
            return new e(new R(0, 250, 154, 1));
          case "mediumturquoise":
            return new e(new R(72, 209, 204, 1));
          case "mediumvioletred":
            return new e(new R(199, 21, 133, 1));
          case "midnightblue":
            return new e(new R(25, 25, 112, 1));
          case "mintcream":
            return new e(new R(245, 255, 250, 1));
          case "mistyrose":
            return new e(new R(255, 228, 225, 1));
          case "moccasin":
            return new e(new R(255, 228, 181, 1));
          case "navajowhite":
            return new e(new R(255, 222, 173, 1));
          case "navy":
            return new e(new R(0, 0, 128, 1));
          case "oldlace":
            return new e(new R(253, 245, 230, 1));
          case "olive":
            return new e(new R(128, 128, 0, 1));
          case "olivedrab":
            return new e(new R(107, 142, 35, 1));
          case "orange":
            return new e(new R(255, 165, 0, 1));
          case "orangered":
            return new e(new R(255, 69, 0, 1));
          case "orchid":
            return new e(new R(218, 112, 214, 1));
          case "palegoldenrod":
            return new e(new R(238, 232, 170, 1));
          case "palegreen":
            return new e(new R(152, 251, 152, 1));
          case "paleturquoise":
            return new e(new R(175, 238, 238, 1));
          case "palevioletred":
            return new e(new R(219, 112, 147, 1));
          case "papayawhip":
            return new e(new R(255, 239, 213, 1));
          case "peachpuff":
            return new e(new R(255, 218, 185, 1));
          case "peru":
            return new e(new R(205, 133, 63, 1));
          case "pink":
            return new e(new R(255, 192, 203, 1));
          case "plum":
            return new e(new R(221, 160, 221, 1));
          case "powderblue":
            return new e(new R(176, 224, 230, 1));
          case "purple":
            return new e(new R(128, 0, 128, 1));
          case "rebeccapurple":
            return new e(new R(102, 51, 153, 1));
          case "red":
            return new e(new R(255, 0, 0, 1));
          case "rosybrown":
            return new e(new R(188, 143, 143, 1));
          case "royalblue":
            return new e(new R(65, 105, 225, 1));
          case "saddlebrown":
            return new e(new R(139, 69, 19, 1));
          case "salmon":
            return new e(new R(250, 128, 114, 1));
          case "sandybrown":
            return new e(new R(244, 164, 96, 1));
          case "seagreen":
            return new e(new R(46, 139, 87, 1));
          case "seashell":
            return new e(new R(255, 245, 238, 1));
          case "sienna":
            return new e(new R(160, 82, 45, 1));
          case "silver":
            return new e(new R(192, 192, 192, 1));
          case "skyblue":
            return new e(new R(135, 206, 235, 1));
          case "slateblue":
            return new e(new R(106, 90, 205, 1));
          case "slategray":
            return new e(new R(112, 128, 144, 1));
          case "slategrey":
            return new e(new R(112, 128, 144, 1));
          case "snow":
            return new e(new R(255, 250, 250, 1));
          case "springgreen":
            return new e(new R(0, 255, 127, 1));
          case "steelblue":
            return new e(new R(70, 130, 180, 1));
          case "tan":
            return new e(new R(210, 180, 140, 1));
          case "teal":
            return new e(new R(0, 128, 128, 1));
          case "thistle":
            return new e(new R(216, 191, 216, 1));
          case "tomato":
            return new e(new R(255, 99, 71, 1));
          case "turquoise":
            return new e(new R(64, 224, 208, 1));
          case "violet":
            return new e(new R(238, 130, 238, 1));
          case "wheat":
            return new e(new R(245, 222, 179, 1));
          case "white":
            return new e(new R(255, 255, 255, 1));
          case "whitesmoke":
            return new e(new R(245, 245, 245, 1));
          case "yellow":
            return new e(new R(255, 255, 0, 1));
          case "yellowgreen":
            return new e(new R(154, 205, 50, 1));
          default:
            return null;
        }
      }
      function m(p) {
        const w = p.length;
        if (w === 0 || p.charCodeAt(0) !== 35)
          return null;
        if (w === 7) {
          const y = 16 * g(p.charCodeAt(1)) + g(p.charCodeAt(2)), N = 16 * g(p.charCodeAt(3)) + g(p.charCodeAt(4)), b = 16 * g(p.charCodeAt(5)) + g(p.charCodeAt(6));
          return new e(new R(y, N, b, 1));
        }
        if (w === 9) {
          const y = 16 * g(p.charCodeAt(1)) + g(p.charCodeAt(2)), N = 16 * g(p.charCodeAt(3)) + g(p.charCodeAt(4)), b = 16 * g(p.charCodeAt(5)) + g(p.charCodeAt(6)), _ = 16 * g(p.charCodeAt(7)) + g(p.charCodeAt(8));
          return new e(new R(y, N, b, _ / 255));
        }
        if (w === 4) {
          const y = g(p.charCodeAt(1)), N = g(p.charCodeAt(2)), b = g(p.charCodeAt(3));
          return new e(new R(16 * y + y, 16 * N + N, 16 * b + b));
        }
        if (w === 5) {
          const y = g(p.charCodeAt(1)), N = g(p.charCodeAt(2)), b = g(p.charCodeAt(3)), _ = g(p.charCodeAt(4));
          return new e(new R(16 * y + y, 16 * N + N, 16 * b + b, (16 * _ + _) / 255));
        }
        return null;
      }
      n.parseHex = m;
      function g(p) {
        switch (p) {
          case 48:
            return 0;
          case 49:
            return 1;
          case 50:
            return 2;
          case 51:
            return 3;
          case 52:
            return 4;
          case 53:
            return 5;
          case 54:
            return 6;
          case 55:
            return 7;
          case 56:
            return 8;
          case 57:
            return 9;
          case 97:
            return 10;
          case 65:
            return 10;
          case 98:
            return 11;
          case 66:
            return 11;
          case 99:
            return 12;
          case 67:
            return 12;
          case 100:
            return 13;
          case 68:
            return 13;
          case 101:
            return 14;
          case 69:
            return 14;
          case 102:
            return 15;
          case 70:
            return 15;
        }
        return 0;
      }
    })(t.CSS || (t.CSS = {}));
  })(e.Format || (e.Format = {}));
})(Pn || (Pn = {}));
function Eo(e) {
  const t = [];
  for (const n of e) {
    const r = Number(n);
    (r || r === 0 && n.replace(/\s/g, "") !== "") && t.push(r);
  }
  return t;
}
function ti(e, t, n, r) {
  return {
    red: e / 255,
    blue: n / 255,
    green: t / 255,
    alpha: r
  };
}
function Ut(e, t) {
  const n = t.index, r = t[0].length;
  if (n === void 0)
    return;
  const i = e.positionAt(n);
  return {
    startLineNumber: i.lineNumber,
    startColumn: i.column,
    endLineNumber: i.lineNumber,
    endColumn: i.column + r
  };
}
function vc(e, t) {
  if (!e)
    return;
  const n = Pn.Format.CSS.parseHex(t);
  if (n)
    return {
      range: e,
      color: ti(n.rgba.r, n.rgba.g, n.rgba.b, n.rgba.a)
    };
}
function Hs(e, t, n) {
  if (!e || t.length !== 1)
    return;
  const i = t[0].values(), s = Eo(i);
  return {
    range: e,
    color: ti(s[0], s[1], s[2], n ? s[3] : 1)
  };
}
function zs(e, t, n) {
  if (!e || t.length !== 1)
    return;
  const i = t[0].values(), s = Eo(i), a = new Pn(new Se(s[0], s[1] / 100, s[2] / 100, n ? s[3] : 1));
  return {
    range: e,
    color: ti(a.rgba.r, a.rgba.g, a.rgba.b, a.rgba.a)
  };
}
function qt(e, t) {
  return typeof e == "string" ? [...e.matchAll(t)] : e.findMatches(t);
}
function yc(e) {
  const t = [], n = new RegExp(`\\b(rgb|rgba|hsl|hsla)(\\([0-9\\s,.\\%]*\\))|^(#)([A-Fa-f0-9]{3})\\b|^(#)([A-Fa-f0-9]{4})\\b|^(#)([A-Fa-f0-9]{6})\\b|^(#)([A-Fa-f0-9]{8})\\b|(?<=['"\\s])(#)([A-Fa-f0-9]{3})\\b|(?<=['"\\s])(#)([A-Fa-f0-9]{4})\\b|(?<=['"\\s])(#)([A-Fa-f0-9]{6})\\b|(?<=['"\\s])(#)([A-Fa-f0-9]{8})\\b`, "gm"), r = qt(e, n);
  if (r.length > 0)
    for (const i of r) {
      const s = i.filter((l) => l !== void 0), a = s[1], o = s[2];
      if (!o)
        continue;
      let u;
      if (a === "rgb") {
        const l = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*\)$/gm;
        u = Hs(Ut(e, i), qt(o, l), !1);
      } else if (a === "rgba") {
        const l = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
        u = Hs(Ut(e, i), qt(o, l), !0);
      } else if (a === "hsl") {
        const l = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*\)$/gm;
        u = zs(Ut(e, i), qt(o, l), !1);
      } else if (a === "hsla") {
        const l = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(0[.][0-9]+|[.][0-9]+|[01][.]0*|[01])\s*\)$/gm;
        u = zs(Ut(e, i), qt(o, l), !0);
      } else a === "#" && (u = vc(Ut(e, i), a + o));
      u && t.push(u);
    }
  return t;
}
function Lc(e) {
  return !e || typeof e.getValue != "function" || typeof e.positionAt != "function" ? [] : yc(e);
}
const Nc = /^-+|-+$/g, Gs = 100, _c = 5;
function Sc(e, t) {
  var r;
  let n = [];
  if (t.findRegionSectionHeaders && ((r = t.foldingRules) != null && r.markers)) {
    const i = Ac(e, t);
    n = n.concat(i);
  }
  if (t.findMarkSectionHeaders) {
    const i = kc(e, t);
    n = n.concat(i);
  }
  return n;
}
function Ac(e, t) {
  const n = [], r = e.getLineCount();
  for (let i = 1; i <= r; i++) {
    const s = e.getLineContent(i), a = s.match(t.foldingRules.markers.start);
    if (a) {
      const o = { startLineNumber: i, startColumn: a[0].length + 1, endLineNumber: i, endColumn: s.length + 1 };
      if (o.endColumn > o.startColumn) {
        const u = {
          range: o,
          ...Rc(s.substring(a[0].length)),
          shouldBeInComments: !1
        };
        (u.text || u.hasSeparatorLine) && n.push(u);
      }
    }
  }
  return n;
}
function kc(e, t) {
  const n = [], r = e.getLineCount();
  if (!t.markSectionHeaderRegex || t.markSectionHeaderRegex.trim() === "")
    return n;
  const i = Ru(t.markSectionHeaderRegex), s = new RegExp(t.markSectionHeaderRegex, `gdm${i ? "s" : ""}`);
  if (Nl(s))
    return n;
  for (let a = 1; a <= r; a += Gs - _c) {
    const o = Math.min(a + Gs - 1, r), u = [];
    for (let f = a; f <= o; f++)
      u.push(e.getLineContent(f));
    const l = u.join(`
`);
    s.lastIndex = 0;
    let h;
    for (; (h = s.exec(l)) !== null; ) {
      const f = l.substring(0, h.index), d = (f.match(/\n/g) || []).length, m = a + d, g = h[0].split(`
`), p = g.length, w = m + p - 1, y = f.lastIndexOf(`
`) + 1, N = h.index - y + 1, b = g[g.length - 1], _ = p === 1 ? N + h[0].length : b.length + 1, L = {
        startLineNumber: m,
        startColumn: N,
        endLineNumber: w,
        endColumn: _
      }, S = (h.groups ?? {}).label ?? "", v = ((h.groups ?? {}).separator ?? "") !== "", k = {
        range: L,
        text: S,
        hasSeparatorLine: v,
        shouldBeInComments: !0
      };
      (k.text || k.hasSeparatorLine) && (n.length === 0 || n[n.length - 1].range.endLineNumber < k.range.startLineNumber) && n.push(k), s.lastIndex = h.index + h[0].length;
    }
  }
  return n;
}
function Rc(e) {
  e = e.trim();
  const t = e.startsWith("-");
  return e = e.replace(Nc, ""), { text: e, hasSeparatorLine: t };
}
class Ec {
  get isRejected() {
    var t;
    return ((t = this.outcome) == null ? void 0 : t.outcome) === 1;
  }
  get isSettled() {
    return !!this.outcome;
  }
  constructor() {
    this.p = new Promise((t, n) => {
      this.completeCallback = t, this.errorCallback = n;
    });
  }
  complete(t) {
    return this.isSettled ? Promise.resolve() : new Promise((n) => {
      this.completeCallback(t), this.outcome = { outcome: 0, value: t }, n();
    });
  }
  error(t) {
    return this.isSettled ? Promise.resolve() : new Promise((n) => {
      this.errorCallback(t), this.outcome = { outcome: 1, value: t }, n();
    });
  }
  cancel() {
    return this.error(new co());
  }
}
var Js;
(function(e) {
  async function t(r) {
    let i;
    const s = await Promise.all(r.map((a) => a.then((o) => o, (o) => {
      i || (i = o);
    })));
    if (typeof i < "u")
      throw i;
    return s;
  }
  e.settled = t;
  function n(r) {
    return new Promise(async (i, s) => {
      try {
        await r(i, s);
      } catch (a) {
        s(a);
      }
    });
  }
  e.withAsyncBody = n;
})(Js || (Js = {}));
class Mc {
  constructor() {
    this._unsatisfiedConsumers = [], this._unconsumedValues = [];
  }
  get hasFinalValue() {
    return !!this._finalValue;
  }
  produce(t) {
    if (this._ensureNoFinalValue(), this._unsatisfiedConsumers.length > 0) {
      const n = this._unsatisfiedConsumers.shift();
      this._resolveOrRejectDeferred(n, t);
    } else
      this._unconsumedValues.push(t);
  }
  produceFinal(t) {
    this._ensureNoFinalValue(), this._finalValue = t;
    for (const n of this._unsatisfiedConsumers)
      this._resolveOrRejectDeferred(n, t);
    this._unsatisfiedConsumers.length = 0;
  }
  _ensureNoFinalValue() {
    if (this._finalValue)
      throw new ue("ProducerConsumer: cannot produce after final value has been set");
  }
  _resolveOrRejectDeferred(t, n) {
    n.ok ? t.complete(n.value) : t.error(n.error);
  }
  consume() {
    if (this._unconsumedValues.length > 0 || this._finalValue) {
      const t = this._unconsumedValues.length > 0 ? this._unconsumedValues.shift() : this._finalValue;
      return t.ok ? Promise.resolve(t.value) : Promise.reject(t.error);
    } else {
      const t = new Ec();
      return this._unsatisfiedConsumers.push(t), t.p;
    }
  }
}
const me = class me {
  constructor(t, n) {
    this._onReturn = n, this._producerConsumer = new Mc(), this._iterator = {
      next: () => this._producerConsumer.consume(),
      return: () => {
        var r;
        return (r = this._onReturn) == null || r.call(this), Promise.resolve({ done: !0, value: void 0 });
      },
      throw: async (r) => (this._finishError(r), { done: !0, value: void 0 })
    }, queueMicrotask(async () => {
      const r = t({
        emitOne: (i) => this._producerConsumer.produce({ ok: !0, value: { done: !1, value: i } }),
        emitMany: (i) => {
          for (const s of i)
            this._producerConsumer.produce({ ok: !0, value: { done: !1, value: s } });
        },
        reject: (i) => this._finishError(i)
      });
      if (!this._producerConsumer.hasFinalValue)
        try {
          await r, this._finishOk();
        } catch (i) {
          this._finishError(i);
        }
    });
  }
  static fromArray(t) {
    return new me((n) => {
      n.emitMany(t);
    });
  }
  static fromPromise(t) {
    return new me(async (n) => {
      n.emitMany(await t);
    });
  }
  static fromPromisesResolveOrder(t) {
    return new me(async (n) => {
      await Promise.all(t.map(async (r) => n.emitOne(await r)));
    });
  }
  static merge(t) {
    return new me(async (n) => {
      await Promise.all(t.map(async (r) => {
        for await (const i of r)
          n.emitOne(i);
      }));
    });
  }
  static map(t, n) {
    return new me(async (r) => {
      for await (const i of t)
        r.emitOne(n(i));
    });
  }
  map(t) {
    return me.map(this, t);
  }
  static coalesce(t) {
    return me.filter(t, (n) => !!n);
  }
  coalesce() {
    return me.coalesce(this);
  }
  static filter(t, n) {
    return new me(async (r) => {
      for await (const i of t)
        n(i) && r.emitOne(i);
    });
  }
  filter(t) {
    return me.filter(this, t);
  }
  _finishOk() {
    this._producerConsumer.hasFinalValue || this._producerConsumer.produceFinal({ ok: !0, value: { done: !0, value: void 0 } });
  }
  _finishError(t) {
    this._producerConsumer.hasFinalValue || this._producerConsumer.produceFinal({ ok: !1, error: t });
  }
  [Symbol.asyncIterator]() {
    return this._iterator;
  }
};
me.EMPTY = me.fromArray([]);
let Xs = me;
class Tc {
  constructor(t) {
    this.values = t, this.prefixSum = new Uint32Array(t.length), this.prefixSumValidIndex = new Int32Array(1), this.prefixSumValidIndex[0] = -1;
  }
  insertValues(t, n) {
    t = mt(t);
    const r = this.values, i = this.prefixSum, s = n.length;
    return s === 0 ? !1 : (this.values = new Uint32Array(r.length + s), this.values.set(r.subarray(0, t), 0), this.values.set(r.subarray(t), t + s), this.values.set(n, t), t - 1 < this.prefixSumValidIndex[0] && (this.prefixSumValidIndex[0] = t - 1), this.prefixSum = new Uint32Array(this.values.length), this.prefixSumValidIndex[0] >= 0 && this.prefixSum.set(i.subarray(0, this.prefixSumValidIndex[0] + 1)), !0);
  }
  setValue(t, n) {
    return t = mt(t), n = mt(n), this.values[t] === n ? !1 : (this.values[t] = n, t - 1 < this.prefixSumValidIndex[0] && (this.prefixSumValidIndex[0] = t - 1), !0);
  }
  removeValues(t, n) {
    t = mt(t), n = mt(n);
    const r = this.values, i = this.prefixSum;
    if (t >= r.length)
      return !1;
    const s = r.length - t;
    return n >= s && (n = s), n === 0 ? !1 : (this.values = new Uint32Array(r.length - n), this.values.set(r.subarray(0, t), 0), this.values.set(r.subarray(t + n), t), this.prefixSum = new Uint32Array(this.values.length), t - 1 < this.prefixSumValidIndex[0] && (this.prefixSumValidIndex[0] = t - 1), this.prefixSumValidIndex[0] >= 0 && this.prefixSum.set(i.subarray(0, this.prefixSumValidIndex[0] + 1)), !0);
  }
  getTotalSum() {
    return this.values.length === 0 ? 0 : this._getPrefixSum(this.values.length - 1);
  }
  /**
   * Returns the sum of the first `index + 1` many items.
   * @returns `SUM(0 <= j <= index, values[j])`.
   */
  getPrefixSum(t) {
    return t < 0 ? 0 : (t = mt(t), this._getPrefixSum(t));
  }
  _getPrefixSum(t) {
    if (t <= this.prefixSumValidIndex[0])
      return this.prefixSum[t];
    let n = this.prefixSumValidIndex[0] + 1;
    n === 0 && (this.prefixSum[0] = this.values[0], n++), t >= this.values.length && (t = this.values.length - 1);
    for (let r = n; r <= t; r++)
      this.prefixSum[r] = this.prefixSum[r - 1] + this.values[r];
    return this.prefixSumValidIndex[0] = Math.max(this.prefixSumValidIndex[0], t), this.prefixSum[t];
  }
  getIndexOf(t) {
    t = Math.floor(t), this.getTotalSum();
    let n = 0, r = this.values.length - 1, i = 0, s = 0, a = 0;
    for (; n <= r; )
      if (i = n + (r - n) / 2 | 0, s = this.prefixSum[i], a = s - this.values[i], t < a)
        r = i - 1;
      else if (t >= s)
        n = i + 1;
      else
        break;
    return new Pc(i, t - a);
  }
}
class Pc {
  constructor(t, n) {
    this.index = t, this.remainder = n, this._prefixSumIndexOfResultBrand = void 0, this.index = t, this.remainder = n;
  }
}
class Cc {
  constructor(t, n, r, i) {
    this._uri = t, this._lines = n, this._eol = r, this._versionId = i, this._lineStarts = null, this._cachedTextValue = null;
  }
  dispose() {
    this._lines.length = 0;
  }
  get version() {
    return this._versionId;
  }
  getText() {
    return this._cachedTextValue === null && (this._cachedTextValue = this._lines.join(this._eol)), this._cachedTextValue;
  }
  onEvents(t) {
    t.eol && t.eol !== this._eol && (this._eol = t.eol, this._lineStarts = null);
    const n = t.changes;
    for (const r of n)
      this._acceptDeleteRange(r.range), this._acceptInsertText(new Q(r.range.startLineNumber, r.range.startColumn), r.text);
    this._versionId = t.versionId, this._cachedTextValue = null;
  }
  _ensureLineStarts() {
    if (!this._lineStarts) {
      const t = this._eol.length, n = this._lines.length, r = new Uint32Array(n);
      for (let i = 0; i < n; i++)
        r[i] = this._lines[i].length + t;
      this._lineStarts = new Tc(r);
    }
  }
  /**
   * All changes to a line's text go through this method
   */
  _setLineText(t, n) {
    this._lines[t] = n, this._lineStarts && this._lineStarts.setValue(t, this._lines[t].length + this._eol.length);
  }
  _acceptDeleteRange(t) {
    if (t.startLineNumber === t.endLineNumber) {
      if (t.startColumn === t.endColumn)
        return;
      this._setLineText(t.startLineNumber - 1, this._lines[t.startLineNumber - 1].substring(0, t.startColumn - 1) + this._lines[t.startLineNumber - 1].substring(t.endColumn - 1));
      return;
    }
    this._setLineText(t.startLineNumber - 1, this._lines[t.startLineNumber - 1].substring(0, t.startColumn - 1) + this._lines[t.endLineNumber - 1].substring(t.endColumn - 1)), this._lines.splice(t.startLineNumber, t.endLineNumber - t.startLineNumber), this._lineStarts && this._lineStarts.removeValues(t.startLineNumber, t.endLineNumber - t.startLineNumber);
  }
  _acceptInsertText(t, n) {
    if (n.length === 0)
      return;
    const r = _l(n);
    if (r.length === 1) {
      this._setLineText(t.lineNumber - 1, this._lines[t.lineNumber - 1].substring(0, t.column - 1) + r[0] + this._lines[t.lineNumber - 1].substring(t.column - 1));
      return;
    }
    r[r.length - 1] += this._lines[t.lineNumber - 1].substring(t.column - 1), this._setLineText(t.lineNumber - 1, this._lines[t.lineNumber - 1].substring(0, t.column - 1) + r[0]);
    const i = new Uint32Array(r.length - 1);
    for (let s = 1; s < r.length; s++)
      this._lines.splice(t.lineNumber + s - 1, 0, r[s]), i[s - 1] = r[s].length + this._eol.length;
    this._lineStarts && this._lineStarts.insertValues(t.lineNumber, i);
  }
}
class Ic {
  constructor() {
    this._models = /* @__PURE__ */ Object.create(null);
  }
  getModel(t) {
    return this._models[t];
  }
  getModels() {
    const t = [];
    return Object.keys(this._models).forEach((n) => t.push(this._models[n])), t;
  }
  $acceptNewModel(t) {
    this._models[t.url] = new Fc(Kr.parse(t.url), t.lines, t.EOL, t.versionId);
  }
  $acceptModelChanged(t, n) {
    if (!this._models[t])
      return;
    this._models[t].onEvents(n);
  }
  $acceptRemovedModel(t) {
    this._models[t] && delete this._models[t];
  }
}
class Fc extends Cc {
  get uri() {
    return this._uri;
  }
  get eol() {
    return this._eol;
  }
  getValue() {
    return this.getText();
  }
  findMatches(t) {
    const n = [];
    for (let r = 0; r < this._lines.length; r++) {
      const i = this._lines[r], s = this.offsetAt(new Q(r + 1, 1)), a = i.matchAll(t);
      for (const o of a)
        (o.index || o.index === 0) && (o.index = o.index + s), n.push(o);
    }
    return n;
  }
  getLinesContent() {
    return this._lines.slice(0);
  }
  getLineCount() {
    return this._lines.length;
  }
  getLineContent(t) {
    return this._lines[t - 1];
  }
  getWordAtPosition(t, n) {
    const r = ei(t.column, So(n), this._lines[t.lineNumber - 1], 0);
    return r ? new q(t.lineNumber, r.startColumn, t.lineNumber, r.endColumn) : null;
  }
  words(t) {
    const n = this._lines, r = this._wordenize.bind(this);
    let i = 0, s = "", a = 0, o = [];
    return {
      *[Symbol.iterator]() {
        for (; ; )
          if (a < o.length) {
            const u = s.substring(o[a].start, o[a].end);
            a += 1, yield u;
          } else if (i < n.length)
            s = n[i], o = r(s, t), a = 0, i += 1;
          else
            break;
      }
    };
  }
  getLineWords(t, n) {
    const r = this._lines[t - 1], i = this._wordenize(r, n), s = [];
    for (const a of i)
      s.push({
        word: r.substring(a.start, a.end),
        startColumn: a.start + 1,
        endColumn: a.end + 1
      });
    return s;
  }
  _wordenize(t, n) {
    const r = [];
    let i;
    for (n.lastIndex = 0; (i = n.exec(t)) && i[0].length !== 0; )
      r.push({ start: i.index, end: i.index + i[0].length });
    return r;
  }
  getValueInRange(t) {
    if (t = this._validateRange(t), t.startLineNumber === t.endLineNumber)
      return this._lines[t.startLineNumber - 1].substring(t.startColumn - 1, t.endColumn - 1);
    const n = this._eol, r = t.startLineNumber - 1, i = t.endLineNumber - 1, s = [];
    s.push(this._lines[r].substring(t.startColumn - 1));
    for (let a = r + 1; a < i; a++)
      s.push(this._lines[a]);
    return s.push(this._lines[i].substring(0, t.endColumn - 1)), s.join(n);
  }
  offsetAt(t) {
    return t = this._validatePosition(t), this._ensureLineStarts(), this._lineStarts.getPrefixSum(t.lineNumber - 2) + (t.column - 1);
  }
  positionAt(t) {
    t = Math.floor(t), t = Math.max(0, t), this._ensureLineStarts();
    const n = this._lineStarts.getIndexOf(t), r = this._lines[n.index].length;
    return {
      lineNumber: 1 + n.index,
      column: 1 + Math.min(n.remainder, r)
    };
  }
  _validateRange(t) {
    const n = this._validatePosition({ lineNumber: t.startLineNumber, column: t.startColumn }), r = this._validatePosition({ lineNumber: t.endLineNumber, column: t.endColumn });
    return n.lineNumber !== t.startLineNumber || n.column !== t.startColumn || r.lineNumber !== t.endLineNumber || r.column !== t.endColumn ? {
      startLineNumber: n.lineNumber,
      startColumn: n.column,
      endLineNumber: r.lineNumber,
      endColumn: r.column
    } : t;
  }
  _validatePosition(t) {
    if (!Q.isIPosition(t))
      throw new Error("bad position");
    let { lineNumber: n, column: r } = t, i = !1;
    if (n < 1)
      n = 1, r = 1, i = !0;
    else if (n > this._lines.length)
      n = this._lines.length, r = this._lines[n - 1].length + 1, i = !0;
    else {
      const s = this._lines[n - 1].length + 1;
      r < 1 ? (r = 1, i = !0) : r > s && (r = s, i = !0);
    }
    return i ? { lineNumber: n, column: r } : t;
  }
}
const st = class st {
  constructor(t = null) {
    this._foreignModule = t, this._requestHandlerBrand = void 0, this._workerTextModelSyncServer = new Ic();
  }
  dispose() {
  }
  async $ping() {
    return "pong";
  }
  _getModel(t) {
    return this._workerTextModelSyncServer.getModel(t);
  }
  getModels() {
    return this._workerTextModelSyncServer.getModels();
  }
  $acceptNewModel(t) {
    this._workerTextModelSyncServer.$acceptNewModel(t);
  }
  $acceptModelChanged(t, n) {
    this._workerTextModelSyncServer.$acceptModelChanged(t, n);
  }
  $acceptRemovedModel(t) {
    this._workerTextModelSyncServer.$acceptRemovedModel(t);
  }
  async $computeUnicodeHighlights(t, n, r) {
    const i = this._getModel(t);
    return i ? Vu.computeUnicodeHighlights(i, n, r) : { ranges: [], hasMore: !1, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
  }
  async $findSectionHeaders(t, n) {
    const r = this._getModel(t);
    return r ? Sc(r, n) : [];
  }
  // ---- BEGIN diff --------------------------------------------------------------------------
  async $computeDiff(t, n, r, i) {
    const s = this._getModel(t), a = this._getModel(n);
    return !s || !a ? null : st.computeDiff(s, a, r, i);
  }
  static computeDiff(t, n, r, i) {
    const s = i === "advanced" ? Ws.getDefault() : Ws.getLegacy(), a = t.getLinesContent(), o = n.getLinesContent(), u = s.computeDiff(a, o, r), l = u.changes.length > 0 ? !1 : this._modelsAreIdentical(t, n);
    function h(f) {
      return f.map((d) => {
        var m;
        return [d.original.startLineNumber, d.original.endLineNumberExclusive, d.modified.startLineNumber, d.modified.endLineNumberExclusive, (m = d.innerChanges) == null ? void 0 : m.map((g) => [
          g.originalRange.startLineNumber,
          g.originalRange.startColumn,
          g.originalRange.endLineNumber,
          g.originalRange.endColumn,
          g.modifiedRange.startLineNumber,
          g.modifiedRange.startColumn,
          g.modifiedRange.endLineNumber,
          g.modifiedRange.endColumn
        ])];
      });
    }
    return {
      identical: l,
      quitEarly: u.hitTimeout,
      changes: h(u.changes),
      moves: u.moves.map((f) => [
        f.lineRangeMapping.original.startLineNumber,
        f.lineRangeMapping.original.endLineNumberExclusive,
        f.lineRangeMapping.modified.startLineNumber,
        f.lineRangeMapping.modified.endLineNumberExclusive,
        h(f.changes)
      ])
    };
  }
  static _modelsAreIdentical(t, n) {
    const r = t.getLineCount(), i = n.getLineCount();
    if (r !== i)
      return !1;
    for (let s = 1; s <= r; s++) {
      const a = t.getLineContent(s), o = n.getLineContent(s);
      if (a !== o)
        return !1;
    }
    return !0;
  }
  async $computeMoreMinimalEdits(t, n, r) {
    const i = this._getModel(t);
    if (!i)
      return n;
    const s = [];
    let a;
    n = n.slice(0).sort((u, l) => {
      if (u.range && l.range)
        return q.compareRangesUsingStarts(u.range, l.range);
      const h = u.range ? 0 : 1, f = l.range ? 0 : 1;
      return h - f;
    });
    let o = 0;
    for (let u = 1; u < n.length; u++)
      q.getEndPosition(n[o].range).equals(q.getStartPosition(n[u].range)) ? (n[o].range = q.fromPositions(q.getStartPosition(n[o].range), q.getEndPosition(n[u].range)), n[o].text += n[u].text) : (o++, n[o] = n[u]);
    n.length = o + 1;
    for (let { range: u, text: l, eol: h } of n) {
      if (typeof h == "number" && (a = h), q.isEmpty(u) && !l)
        continue;
      const f = i.getValueInRange(u);
      if (l = l.replace(/\r\n|\n|\r/g, i.eol), f === l)
        continue;
      if (Math.max(l.length, f.length) > st._diffLimit) {
        s.push({ range: u, text: l });
        continue;
      }
      const d = jl(f, l, r), m = i.offsetAt(q.lift(u).getStartPosition());
      for (const g of d) {
        const p = i.positionAt(m + g.originalStart), w = i.positionAt(m + g.originalStart + g.originalLength), y = {
          text: l.substr(g.modifiedStart, g.modifiedLength),
          range: { startLineNumber: p.lineNumber, startColumn: p.column, endLineNumber: w.lineNumber, endColumn: w.column }
        };
        i.getValueInRange(y.range) !== y.text && s.push(y);
      }
    }
    return typeof a == "number" && s.push({ eol: a, text: "", range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } }), s;
  }
  // ---- END minimal edits ---------------------------------------------------------------
  async $computeLinks(t) {
    const n = this._getModel(t);
    return n ? Jl(n) : null;
  }
  // --- BEGIN default document colors -----------------------------------------------------------
  async $computeDefaultDocumentColors(t) {
    const n = this._getModel(t);
    return n ? Lc(n) : null;
  }
  async $textualSuggest(t, n, r, i) {
    const s = new Wn(), a = new RegExp(r, i), o = /* @__PURE__ */ new Set();
    e: for (const u of t) {
      const l = this._getModel(u);
      if (l) {
        for (const h of l.words(a))
          if (!(h === n || !isNaN(Number(h))) && (o.add(h), o.size > st._suggestionsLimit))
            break e;
      }
    }
    return { words: Array.from(o), duration: s.elapsed() };
  }
  // ---- END suggest --------------------------------------------------------------------------
  //#region -- word ranges --
  async $computeWordRanges(t, n, r, i) {
    const s = this._getModel(t);
    if (!s)
      return /* @__PURE__ */ Object.create(null);
    const a = new RegExp(r, i), o = /* @__PURE__ */ Object.create(null);
    for (let u = n.startLineNumber; u < n.endLineNumber; u++) {
      const l = s.getLineWords(u, a);
      for (const h of l) {
        if (!isNaN(Number(h.word)))
          continue;
        let f = o[h.word];
        f || (f = [], o[h.word] = f), f.push({
          startLineNumber: u,
          startColumn: h.startColumn,
          endLineNumber: u,
          endColumn: h.endColumn
        });
      }
    }
    return o;
  }
  //#endregion
  async $navigateValueSet(t, n, r, i, s) {
    const a = this._getModel(t);
    if (!a)
      return null;
    const o = new RegExp(i, s);
    n.startColumn === n.endColumn && (n = {
      startLineNumber: n.startLineNumber,
      startColumn: n.startColumn,
      endLineNumber: n.endLineNumber,
      endColumn: n.endColumn + 1
    });
    const u = a.getValueInRange(n), l = a.getWordAtPosition({ lineNumber: n.startLineNumber, column: n.startColumn }, o);
    if (!l)
      return null;
    const h = a.getValueInRange(l);
    return fr.INSTANCE.navigateValueSet(n, u, l, h, r);
  }
  // ---- BEGIN foreign module support --------------------------------------------------------------------------
  // foreign method request
  $fmr(t, n) {
    if (!this._foreignModule || typeof this._foreignModule[t] != "function")
      return Promise.reject(new Error("Missing requestHandler or method: " + t));
    try {
      return Promise.resolve(this._foreignModule[t].apply(this._foreignModule, n));
    } catch (r) {
      return Promise.reject(r);
    }
  }
};
st._diffLimit = 1e5, st._suggestionsLimit = 1e4;
let kr = st;
typeof importScripts == "function" && (globalThis.monaco = Nu());
const Yt = class Yt {
  static getChannel(t) {
    return t.getChannel(Yt.CHANNEL_NAME);
  }
  static setChannel(t, n) {
    t.setChannel(Yt.CHANNEL_NAME, n);
  }
};
Yt.CHANNEL_NAME = "editorWorkerHost";
let Rr = Yt;
function Vc(e) {
  let t;
  const n = Ul((r) => {
    const i = Rr.getChannel(r), a = {
      host: new Proxy({}, {
        get(o, u, l) {
          if (u !== "then") {
            if (typeof u != "string")
              throw new Error("Not supported");
            return (...h) => i.$fhr(u, h);
          }
        }
      }),
      getMirrorModels: () => n.requestHandler.getModels()
    };
    return t = e(a), new kr(t);
  });
  return t;
}
function Dc(e) {
  self.onmessage = (t) => {
    Vc((n) => e(n, t.data));
  };
}
function ni(e, t = !1) {
  const n = e.length;
  let r = 0, i = "", s = 0, a = 16, o = 0, u = 0, l = 0, h = 0, f = 0;
  function d(b, _) {
    let L = 0, S = 0;
    for (; L < b; ) {
      let v = e.charCodeAt(r);
      if (v >= 48 && v <= 57)
        S = S * 16 + v - 48;
      else if (v >= 65 && v <= 70)
        S = S * 16 + v - 65 + 10;
      else if (v >= 97 && v <= 102)
        S = S * 16 + v - 97 + 10;
      else
        break;
      r++, L++;
    }
    return L < b && (S = -1), S;
  }
  function m(b) {
    r = b, i = "", s = 0, a = 16, f = 0;
  }
  function g() {
    let b = r;
    if (e.charCodeAt(r) === 48)
      r++;
    else
      for (r++; r < e.length && xt(e.charCodeAt(r)); )
        r++;
    if (r < e.length && e.charCodeAt(r) === 46)
      if (r++, r < e.length && xt(e.charCodeAt(r)))
        for (r++; r < e.length && xt(e.charCodeAt(r)); )
          r++;
      else
        return f = 3, e.substring(b, r);
    let _ = r;
    if (r < e.length && (e.charCodeAt(r) === 69 || e.charCodeAt(r) === 101))
      if (r++, (r < e.length && e.charCodeAt(r) === 43 || e.charCodeAt(r) === 45) && r++, r < e.length && xt(e.charCodeAt(r))) {
        for (r++; r < e.length && xt(e.charCodeAt(r)); )
          r++;
        _ = r;
      } else
        f = 3;
    return e.substring(b, _);
  }
  function p() {
    let b = "", _ = r;
    for (; ; ) {
      if (r >= n) {
        b += e.substring(_, r), f = 2;
        break;
      }
      const L = e.charCodeAt(r);
      if (L === 34) {
        b += e.substring(_, r), r++;
        break;
      }
      if (L === 92) {
        if (b += e.substring(_, r), r++, r >= n) {
          f = 2;
          break;
        }
        switch (e.charCodeAt(r++)) {
          case 34:
            b += '"';
            break;
          case 92:
            b += "\\";
            break;
          case 47:
            b += "/";
            break;
          case 98:
            b += "\b";
            break;
          case 102:
            b += "\f";
            break;
          case 110:
            b += `
`;
            break;
          case 114:
            b += "\r";
            break;
          case 116:
            b += "	";
            break;
          case 117:
            const v = d(4);
            v >= 0 ? b += String.fromCharCode(v) : f = 4;
            break;
          default:
            f = 5;
        }
        _ = r;
        continue;
      }
      if (L >= 0 && L <= 31)
        if (jt(L)) {
          b += e.substring(_, r), f = 2;
          break;
        } else
          f = 6;
      r++;
    }
    return b;
  }
  function w() {
    if (i = "", f = 0, s = r, u = o, h = l, r >= n)
      return s = n, a = 17;
    let b = e.charCodeAt(r);
    if (Yn(b)) {
      do
        r++, i += String.fromCharCode(b), b = e.charCodeAt(r);
      while (Yn(b));
      return a = 15;
    }
    if (jt(b))
      return r++, i += String.fromCharCode(b), b === 13 && e.charCodeAt(r) === 10 && (r++, i += `
`), o++, l = r, a = 14;
    switch (b) {
      case 123:
        return r++, a = 1;
      case 125:
        return r++, a = 2;
      case 91:
        return r++, a = 3;
      case 93:
        return r++, a = 4;
      case 58:
        return r++, a = 6;
      case 44:
        return r++, a = 5;
      case 34:
        return r++, i = p(), a = 10;
      case 47:
        const _ = r - 1;
        if (e.charCodeAt(r + 1) === 47) {
          for (r += 2; r < n && !jt(e.charCodeAt(r)); )
            r++;
          return i = e.substring(_, r), a = 12;
        }
        if (e.charCodeAt(r + 1) === 42) {
          r += 2;
          const L = n - 1;
          let S = !1;
          for (; r < L; ) {
            const v = e.charCodeAt(r);
            if (v === 42 && e.charCodeAt(r + 1) === 47) {
              r += 2, S = !0;
              break;
            }
            r++, jt(v) && (v === 13 && e.charCodeAt(r) === 10 && r++, o++, l = r);
          }
          return S || (r++, f = 1), i = e.substring(_, r), a = 13;
        }
        return i += String.fromCharCode(b), r++, a = 16;
      case 45:
        if (i += String.fromCharCode(b), r++, r === n || !xt(e.charCodeAt(r)))
          return a = 16;
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        return i += g(), a = 11;
      default:
        for (; r < n && y(b); )
          r++, b = e.charCodeAt(r);
        if (s !== r) {
          switch (i = e.substring(s, r), i) {
            case "true":
              return a = 8;
            case "false":
              return a = 9;
            case "null":
              return a = 7;
          }
          return a = 16;
        }
        return i += String.fromCharCode(b), r++, a = 16;
    }
  }
  function y(b) {
    if (Yn(b) || jt(b))
      return !1;
    switch (b) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return !1;
    }
    return !0;
  }
  function N() {
    let b;
    do
      b = w();
    while (b >= 12 && b <= 15);
    return b;
  }
  return {
    setPosition: m,
    getPosition: () => r,
    scan: t ? N : w,
    getToken: () => a,
    getTokenValue: () => i,
    getTokenOffset: () => s,
    getTokenLength: () => r - s,
    getTokenStartLine: () => u,
    getTokenStartCharacter: () => s - h,
    getTokenError: () => f
  };
}
function Yn(e) {
  return e === 32 || e === 9;
}
function jt(e) {
  return e === 10 || e === 13;
}
function xt(e) {
  return e >= 48 && e <= 57;
}
var Qs;
(function(e) {
  e[e.lineFeed = 10] = "lineFeed", e[e.carriageReturn = 13] = "carriageReturn", e[e.space = 32] = "space", e[e._0 = 48] = "_0", e[e._1 = 49] = "_1", e[e._2 = 50] = "_2", e[e._3 = 51] = "_3", e[e._4 = 52] = "_4", e[e._5 = 53] = "_5", e[e._6 = 54] = "_6", e[e._7 = 55] = "_7", e[e._8 = 56] = "_8", e[e._9 = 57] = "_9", e[e.a = 97] = "a", e[e.b = 98] = "b", e[e.c = 99] = "c", e[e.d = 100] = "d", e[e.e = 101] = "e", e[e.f = 102] = "f", e[e.g = 103] = "g", e[e.h = 104] = "h", e[e.i = 105] = "i", e[e.j = 106] = "j", e[e.k = 107] = "k", e[e.l = 108] = "l", e[e.m = 109] = "m", e[e.n = 110] = "n", e[e.o = 111] = "o", e[e.p = 112] = "p", e[e.q = 113] = "q", e[e.r = 114] = "r", e[e.s = 115] = "s", e[e.t = 116] = "t", e[e.u = 117] = "u", e[e.v = 118] = "v", e[e.w = 119] = "w", e[e.x = 120] = "x", e[e.y = 121] = "y", e[e.z = 122] = "z", e[e.A = 65] = "A", e[e.B = 66] = "B", e[e.C = 67] = "C", e[e.D = 68] = "D", e[e.E = 69] = "E", e[e.F = 70] = "F", e[e.G = 71] = "G", e[e.H = 72] = "H", e[e.I = 73] = "I", e[e.J = 74] = "J", e[e.K = 75] = "K", e[e.L = 76] = "L", e[e.M = 77] = "M", e[e.N = 78] = "N", e[e.O = 79] = "O", e[e.P = 80] = "P", e[e.Q = 81] = "Q", e[e.R = 82] = "R", e[e.S = 83] = "S", e[e.T = 84] = "T", e[e.U = 85] = "U", e[e.V = 86] = "V", e[e.W = 87] = "W", e[e.X = 88] = "X", e[e.Y = 89] = "Y", e[e.Z = 90] = "Z", e[e.asterisk = 42] = "asterisk", e[e.backslash = 92] = "backslash", e[e.closeBrace = 125] = "closeBrace", e[e.closeBracket = 93] = "closeBracket", e[e.colon = 58] = "colon", e[e.comma = 44] = "comma", e[e.dot = 46] = "dot", e[e.doubleQuote = 34] = "doubleQuote", e[e.minus = 45] = "minus", e[e.openBrace = 123] = "openBrace", e[e.openBracket = 91] = "openBracket", e[e.plus = 43] = "plus", e[e.slash = 47] = "slash", e[e.formFeed = 12] = "formFeed", e[e.tab = 9] = "tab";
})(Qs || (Qs = {}));
const Ne = new Array(20).fill(0).map((e, t) => " ".repeat(t)), vt = 200, Zs = {
  " ": {
    "\n": new Array(vt).fill(0).map((e, t) => `
` + " ".repeat(t)),
    "\r": new Array(vt).fill(0).map((e, t) => "\r" + " ".repeat(t)),
    "\r\n": new Array(vt).fill(0).map((e, t) => `\r
` + " ".repeat(t))
  },
  "	": {
    "\n": new Array(vt).fill(0).map((e, t) => `
` + "	".repeat(t)),
    "\r": new Array(vt).fill(0).map((e, t) => "\r" + "	".repeat(t)),
    "\r\n": new Array(vt).fill(0).map((e, t) => `\r
` + "	".repeat(t))
  }
}, Oc = [`
`, "\r", `\r
`];
function $c(e, t, n) {
  let r, i, s, a, o;
  if (t) {
    for (a = t.offset, o = a + t.length, s = a; s > 0 && !Ys(e, s - 1); )
      s--;
    let L = o;
    for (; L < e.length && !Ys(e, L); )
      L++;
    i = e.substring(s, L), r = Bc(i, n);
  } else
    i = e, r = 0, s = 0, a = 0, o = e.length;
  const u = Uc(n, e), l = Oc.includes(u);
  let h = 0, f = 0, d;
  n.insertSpaces ? d = Ne[n.tabSize || 4] ?? yt(Ne[1], n.tabSize || 4) : d = "	";
  const m = d === "	" ? "	" : " ";
  let g = ni(i, !1), p = !1;
  function w() {
    if (h > 1)
      return yt(u, h) + yt(d, r + f);
    const L = d.length * (r + f);
    return !l || L > Zs[m][u].length ? u + yt(d, r + f) : L <= 0 ? u : Zs[m][u][L];
  }
  function y() {
    let L = g.scan();
    for (h = 0; L === 15 || L === 14; )
      L === 14 && n.keepLines ? h += 1 : L === 14 && (h = 1), L = g.scan();
    return p = L === 16 || g.getTokenError() !== 0, L;
  }
  const N = [];
  function b(L, S, v) {
    !p && (!t || S < o && v > a) && e.substring(S, v) !== L && N.push({ offset: S, length: v - S, content: L });
  }
  let _ = y();
  if (n.keepLines && h > 0 && b(yt(u, h), 0, 0), _ !== 17) {
    let L = g.getTokenOffset() + s, S = d.length * r < 20 && n.insertSpaces ? Ne[d.length * r] : yt(d, r);
    b(S, s, L);
  }
  for (; _ !== 17; ) {
    let L = g.getTokenOffset() + g.getTokenLength() + s, S = y(), v = "", k = !1;
    for (; h === 0 && (S === 12 || S === 13); ) {
      let V = g.getTokenOffset() + s;
      b(Ne[1], L, V), L = g.getTokenOffset() + g.getTokenLength() + s, k = S === 12, v = k ? w() : "", S = y();
    }
    if (S === 2)
      _ !== 1 && f--, n.keepLines && h > 0 || !n.keepLines && _ !== 1 ? v = w() : n.keepLines && (v = Ne[1]);
    else if (S === 4)
      _ !== 3 && f--, n.keepLines && h > 0 || !n.keepLines && _ !== 3 ? v = w() : n.keepLines && (v = Ne[1]);
    else {
      switch (_) {
        case 3:
        case 1:
          f++, n.keepLines && h > 0 || !n.keepLines ? v = w() : v = Ne[1];
          break;
        case 5:
          n.keepLines && h > 0 || !n.keepLines ? v = w() : v = Ne[1];
          break;
        case 12:
          v = w();
          break;
        case 13:
          h > 0 ? v = w() : k || (v = Ne[1]);
          break;
        case 6:
          n.keepLines && h > 0 ? v = w() : k || (v = Ne[1]);
          break;
        case 10:
          n.keepLines && h > 0 ? v = w() : S === 6 && !k && (v = "");
          break;
        case 7:
        case 8:
        case 9:
        case 11:
        case 2:
        case 4:
          n.keepLines && h > 0 ? v = w() : (S === 12 || S === 13) && !k ? v = Ne[1] : S !== 5 && S !== 17 && (p = !0);
          break;
        case 16:
          p = !0;
          break;
      }
      h > 0 && (S === 12 || S === 13) && (v = w());
    }
    S === 17 && (n.keepLines && h > 0 ? v = w() : v = n.insertFinalNewline ? u : "");
    const M = g.getTokenOffset() + s;
    b(v, L, M), _ = S;
  }
  return N;
}
function yt(e, t) {
  let n = "";
  for (let r = 0; r < t; r++)
    n += e;
  return n;
}
function Bc(e, t) {
  let n = 0, r = 0;
  const i = t.tabSize || 4;
  for (; n < e.length; ) {
    let s = e.charAt(n);
    if (s === Ne[1])
      r++;
    else if (s === "	")
      r += i;
    else
      break;
    n++;
  }
  return Math.floor(r / i);
}
function Uc(e, t) {
  for (let n = 0; n < t.length; n++) {
    const r = t.charAt(n);
    if (r === "\r")
      return n + 1 < t.length && t.charAt(n + 1) === `
` ? `\r
` : "\r";
    if (r === `
`)
      return `
`;
  }
  return e && e.eol || `
`;
}
function Ys(e, t) {
  return `\r
`.indexOf(e.charAt(t)) !== -1;
}
var Cn;
(function(e) {
  e.DEFAULT = {
    allowTrailingComma: !1
  };
})(Cn || (Cn = {}));
function qc(e, t = [], n = Cn.DEFAULT) {
  let r = null, i = [];
  const s = [];
  function a(u) {
    Array.isArray(i) ? i.push(u) : r !== null && (i[r] = u);
  }
  return Wc(e, {
    onObjectBegin: () => {
      const u = {};
      a(u), s.push(i), i = u, r = null;
    },
    onObjectProperty: (u) => {
      r = u;
    },
    onObjectEnd: () => {
      i = s.pop();
    },
    onArrayBegin: () => {
      const u = [];
      a(u), s.push(i), i = u, r = null;
    },
    onArrayEnd: () => {
      i = s.pop();
    },
    onLiteralValue: a,
    onError: (u, l, h) => {
      t.push({ error: u, offset: l, length: h });
    }
  }, n), i[0];
}
function Mo(e) {
  if (!e.parent || !e.parent.children)
    return [];
  const t = Mo(e.parent);
  if (e.parent.type === "property") {
    const n = e.parent.children[0].value;
    t.push(n);
  } else if (e.parent.type === "array") {
    const n = e.parent.children.indexOf(e);
    n !== -1 && t.push(n);
  }
  return t;
}
function Er(e) {
  switch (e.type) {
    case "array":
      return e.children.map(Er);
    case "object":
      const t = /* @__PURE__ */ Object.create(null);
      for (let n of e.children) {
        const r = n.children[1];
        r && (t[n.children[0].value] = Er(r));
      }
      return t;
    case "null":
    case "string":
    case "number":
    case "boolean":
      return e.value;
    default:
      return;
  }
}
function jc(e, t, n = !1) {
  return t >= e.offset && t < e.offset + e.length || n && t === e.offset + e.length;
}
function To(e, t, n = !1) {
  if (jc(e, t, n)) {
    const r = e.children;
    if (Array.isArray(r))
      for (let i = 0; i < r.length && r[i].offset <= t; i++) {
        const s = To(r[i], t, n);
        if (s)
          return s;
      }
    return e;
  }
}
function Wc(e, t, n = Cn.DEFAULT) {
  const r = ni(e, !1), i = [];
  function s(x) {
    return x ? () => x(r.getTokenOffset(), r.getTokenLength(), r.getTokenStartLine(), r.getTokenStartCharacter()) : () => !0;
  }
  function a(x) {
    return x ? () => x(r.getTokenOffset(), r.getTokenLength(), r.getTokenStartLine(), r.getTokenStartCharacter(), () => i.slice()) : () => !0;
  }
  function o(x) {
    return x ? (A) => x(A, r.getTokenOffset(), r.getTokenLength(), r.getTokenStartLine(), r.getTokenStartCharacter()) : () => !0;
  }
  function u(x) {
    return x ? (A) => x(A, r.getTokenOffset(), r.getTokenLength(), r.getTokenStartLine(), r.getTokenStartCharacter(), () => i.slice()) : () => !0;
  }
  const l = a(t.onObjectBegin), h = u(t.onObjectProperty), f = s(t.onObjectEnd), d = a(t.onArrayBegin), m = s(t.onArrayEnd), g = u(t.onLiteralValue), p = o(t.onSeparator), w = s(t.onComment), y = o(t.onError), N = n && n.disallowComments, b = n && n.allowTrailingComma;
  function _() {
    for (; ; ) {
      const x = r.scan();
      switch (r.getTokenError()) {
        case 4:
          L(
            14
            /* ParseErrorCode.InvalidUnicode */
          );
          break;
        case 5:
          L(
            15
            /* ParseErrorCode.InvalidEscapeCharacter */
          );
          break;
        case 3:
          L(
            13
            /* ParseErrorCode.UnexpectedEndOfNumber */
          );
          break;
        case 1:
          N || L(
            11
            /* ParseErrorCode.UnexpectedEndOfComment */
          );
          break;
        case 2:
          L(
            12
            /* ParseErrorCode.UnexpectedEndOfString */
          );
          break;
        case 6:
          L(
            16
            /* ParseErrorCode.InvalidCharacter */
          );
          break;
      }
      switch (x) {
        case 12:
        case 13:
          N ? L(
            10
            /* ParseErrorCode.InvalidCommentToken */
          ) : w();
          break;
        case 16:
          L(
            1
            /* ParseErrorCode.InvalidSymbol */
          );
          break;
        case 15:
        case 14:
          break;
        default:
          return x;
      }
    }
  }
  function L(x, A = [], C = []) {
    if (y(x), A.length + C.length > 0) {
      let I = r.getToken();
      for (; I !== 17; ) {
        if (A.indexOf(I) !== -1) {
          _();
          break;
        } else if (C.indexOf(I) !== -1)
          break;
        I = _();
      }
    }
  }
  function S(x) {
    const A = r.getTokenValue();
    return x ? g(A) : (h(A), i.push(A)), _(), !0;
  }
  function v() {
    switch (r.getToken()) {
      case 11:
        const x = r.getTokenValue();
        let A = Number(x);
        isNaN(A) && (L(
          2
          /* ParseErrorCode.InvalidNumberFormat */
        ), A = 0), g(A);
        break;
      case 7:
        g(null);
        break;
      case 8:
        g(!0);
        break;
      case 9:
        g(!1);
        break;
      default:
        return !1;
    }
    return _(), !0;
  }
  function k() {
    return r.getToken() !== 10 ? (L(3, [], [
      2,
      5
      /* SyntaxKind.CommaToken */
    ]), !1) : (S(!1), r.getToken() === 6 ? (p(":"), _(), T() || L(4, [], [
      2,
      5
      /* SyntaxKind.CommaToken */
    ])) : L(5, [], [
      2,
      5
      /* SyntaxKind.CommaToken */
    ]), i.pop(), !0);
  }
  function M() {
    l(), _();
    let x = !1;
    for (; r.getToken() !== 2 && r.getToken() !== 17; ) {
      if (r.getToken() === 5) {
        if (x || L(4, [], []), p(","), _(), r.getToken() === 2 && b)
          break;
      } else x && L(6, [], []);
      k() || L(4, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]), x = !0;
    }
    return f(), r.getToken() !== 2 ? L(7, [
      2
      /* SyntaxKind.CloseBraceToken */
    ], []) : _(), !0;
  }
  function V() {
    d(), _();
    let x = !0, A = !1;
    for (; r.getToken() !== 4 && r.getToken() !== 17; ) {
      if (r.getToken() === 5) {
        if (A || L(4, [], []), p(","), _(), r.getToken() === 4 && b)
          break;
      } else A && L(6, [], []);
      x ? (i.push(0), x = !1) : i[i.length - 1]++, T() || L(4, [], [
        4,
        5
        /* SyntaxKind.CommaToken */
      ]), A = !0;
    }
    return m(), x || i.pop(), r.getToken() !== 4 ? L(8, [
      4
      /* SyntaxKind.CloseBracketToken */
    ], []) : _(), !0;
  }
  function T() {
    switch (r.getToken()) {
      case 3:
        return V();
      case 1:
        return M();
      case 10:
        return S(!0);
      default:
        return v();
    }
  }
  return _(), r.getToken() === 17 ? n.allowEmptyContent ? !0 : (L(4, [], []), !1) : T() ? (r.getToken() !== 17 && L(9, [], []), !0) : (L(4, [], []), !1);
}
const lt = ni;
var Ks;
(function(e) {
  e[e.None = 0] = "None", e[e.UnexpectedEndOfComment = 1] = "UnexpectedEndOfComment", e[e.UnexpectedEndOfString = 2] = "UnexpectedEndOfString", e[e.UnexpectedEndOfNumber = 3] = "UnexpectedEndOfNumber", e[e.InvalidUnicode = 4] = "InvalidUnicode", e[e.InvalidEscapeCharacter = 5] = "InvalidEscapeCharacter", e[e.InvalidCharacter = 6] = "InvalidCharacter";
})(Ks || (Ks = {}));
var ea;
(function(e) {
  e[e.OpenBraceToken = 1] = "OpenBraceToken", e[e.CloseBraceToken = 2] = "CloseBraceToken", e[e.OpenBracketToken = 3] = "OpenBracketToken", e[e.CloseBracketToken = 4] = "CloseBracketToken", e[e.CommaToken = 5] = "CommaToken", e[e.ColonToken = 6] = "ColonToken", e[e.NullKeyword = 7] = "NullKeyword", e[e.TrueKeyword = 8] = "TrueKeyword", e[e.FalseKeyword = 9] = "FalseKeyword", e[e.StringLiteral = 10] = "StringLiteral", e[e.NumericLiteral = 11] = "NumericLiteral", e[e.LineCommentTrivia = 12] = "LineCommentTrivia", e[e.BlockCommentTrivia = 13] = "BlockCommentTrivia", e[e.LineBreakTrivia = 14] = "LineBreakTrivia", e[e.Trivia = 15] = "Trivia", e[e.Unknown = 16] = "Unknown", e[e.EOF = 17] = "EOF";
})(ea || (ea = {}));
const Hc = qc, zc = To, Gc = Mo, Jc = Er;
var ta;
(function(e) {
  e[e.InvalidSymbol = 1] = "InvalidSymbol", e[e.InvalidNumberFormat = 2] = "InvalidNumberFormat", e[e.PropertyNameExpected = 3] = "PropertyNameExpected", e[e.ValueExpected = 4] = "ValueExpected", e[e.ColonExpected = 5] = "ColonExpected", e[e.CommaExpected = 6] = "CommaExpected", e[e.CloseBraceExpected = 7] = "CloseBraceExpected", e[e.CloseBracketExpected = 8] = "CloseBracketExpected", e[e.EndOfFileExpected = 9] = "EndOfFileExpected", e[e.InvalidCommentToken = 10] = "InvalidCommentToken", e[e.UnexpectedEndOfComment = 11] = "UnexpectedEndOfComment", e[e.UnexpectedEndOfString = 12] = "UnexpectedEndOfString", e[e.UnexpectedEndOfNumber = 13] = "UnexpectedEndOfNumber", e[e.InvalidUnicode = 14] = "InvalidUnicode", e[e.InvalidEscapeCharacter = 15] = "InvalidEscapeCharacter", e[e.InvalidCharacter = 16] = "InvalidCharacter";
})(ta || (ta = {}));
function Xc(e, t, n) {
  return $c(e, t, n);
}
function Pt(e, t) {
  if (e === t)
    return !0;
  if (e == null || t === null || t === void 0 || typeof e != typeof t || typeof e != "object" || Array.isArray(e) !== Array.isArray(t))
    return !1;
  let n, r;
  if (Array.isArray(e)) {
    if (e.length !== t.length)
      return !1;
    for (n = 0; n < e.length; n++)
      if (!Pt(e[n], t[n]))
        return !1;
  } else {
    const i = [];
    for (r in e)
      i.push(r);
    i.sort();
    const s = [];
    for (r in t)
      s.push(r);
    if (s.sort(), !Pt(i, s))
      return !1;
    for (n = 0; n < i.length; n++)
      if (!Pt(e[i[n]], t[i[n]]))
        return !1;
  }
  return !0;
}
function ce(e) {
  return typeof e == "number";
}
function Re(e) {
  return typeof e < "u";
}
function De(e) {
  return typeof e == "boolean";
}
function Po(e) {
  return typeof e == "string";
}
function Ze(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e);
}
function Qc(e, t) {
  if (e.length < t.length)
    return !1;
  for (let n = 0; n < t.length; n++)
    if (e[n] !== t[n])
      return !1;
  return !0;
}
function sn(e, t) {
  const n = e.length - t.length;
  return n > 0 ? e.lastIndexOf(t) === n : n === 0 ? e === t : !1;
}
function In(e) {
  let t = "";
  Qc(e, "(?i)") && (e = e.substring(4), t = "i");
  try {
    return new RegExp(e, t + "u");
  } catch {
    try {
      return new RegExp(e, t);
    } catch {
      return;
    }
  }
}
function na(e) {
  let t = 0;
  for (let n = 0; n < e.length; n++) {
    t++;
    const r = e.charCodeAt(n);
    55296 <= r && r <= 56319 && n++;
  }
  return t;
}
var ra;
(function(e) {
  function t(n) {
    return typeof n == "string";
  }
  e.is = t;
})(ra || (ra = {}));
var Mr;
(function(e) {
  function t(n) {
    return typeof n == "string";
  }
  e.is = t;
})(Mr || (Mr = {}));
var ia;
(function(e) {
  e.MIN_VALUE = -2147483648, e.MAX_VALUE = 2147483647;
  function t(n) {
    return typeof n == "number" && e.MIN_VALUE <= n && n <= e.MAX_VALUE;
  }
  e.is = t;
})(ia || (ia = {}));
var Fn;
(function(e) {
  e.MIN_VALUE = 0, e.MAX_VALUE = 2147483647;
  function t(n) {
    return typeof n == "number" && e.MIN_VALUE <= n && n <= e.MAX_VALUE;
  }
  e.is = t;
})(Fn || (Fn = {}));
var ee;
(function(e) {
  function t(r, i) {
    return r === Number.MAX_VALUE && (r = Fn.MAX_VALUE), i === Number.MAX_VALUE && (i = Fn.MAX_VALUE), { line: r, character: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.objectLiteral(i) && E.uinteger(i.line) && E.uinteger(i.character);
  }
  e.is = n;
})(ee || (ee = {}));
var W;
(function(e) {
  function t(r, i, s, a) {
    if (E.uinteger(r) && E.uinteger(i) && E.uinteger(s) && E.uinteger(a))
      return { start: ee.create(r, i), end: ee.create(s, a) };
    if (ee.is(r) && ee.is(i))
      return { start: r, end: i };
    throw new Error(`Range#create called with invalid arguments[${r}, ${i}, ${s}, ${a}]`);
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.objectLiteral(i) && ee.is(i.start) && ee.is(i.end);
  }
  e.is = n;
})(W || (W = {}));
var Vt;
(function(e) {
  function t(r, i) {
    return { uri: r, range: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.objectLiteral(i) && W.is(i.range) && (E.string(i.uri) || E.undefined(i.uri));
  }
  e.is = n;
})(Vt || (Vt = {}));
var sa;
(function(e) {
  function t(r, i, s, a) {
    return { targetUri: r, targetRange: i, targetSelectionRange: s, originSelectionRange: a };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.objectLiteral(i) && W.is(i.targetRange) && E.string(i.targetUri) && W.is(i.targetSelectionRange) && (W.is(i.originSelectionRange) || E.undefined(i.originSelectionRange));
  }
  e.is = n;
})(sa || (sa = {}));
var Tr;
(function(e) {
  function t(r, i, s, a) {
    return {
      red: r,
      green: i,
      blue: s,
      alpha: a
    };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && E.numberRange(i.red, 0, 1) && E.numberRange(i.green, 0, 1) && E.numberRange(i.blue, 0, 1) && E.numberRange(i.alpha, 0, 1);
  }
  e.is = n;
})(Tr || (Tr = {}));
var aa;
(function(e) {
  function t(r, i) {
    return {
      range: r,
      color: i
    };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && W.is(i.range) && Tr.is(i.color);
  }
  e.is = n;
})(aa || (aa = {}));
var oa;
(function(e) {
  function t(r, i, s) {
    return {
      label: r,
      textEdit: i,
      additionalTextEdits: s
    };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && E.string(i.label) && (E.undefined(i.textEdit) || $e.is(i)) && (E.undefined(i.additionalTextEdits) || E.typedArray(i.additionalTextEdits, $e.is));
  }
  e.is = n;
})(oa || (oa = {}));
var Qt;
(function(e) {
  e.Comment = "comment", e.Imports = "imports", e.Region = "region";
})(Qt || (Qt = {}));
var la;
(function(e) {
  function t(r, i, s, a, o, u) {
    const l = {
      startLine: r,
      endLine: i
    };
    return E.defined(s) && (l.startCharacter = s), E.defined(a) && (l.endCharacter = a), E.defined(o) && (l.kind = o), E.defined(u) && (l.collapsedText = u), l;
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && E.uinteger(i.startLine) && E.uinteger(i.startLine) && (E.undefined(i.startCharacter) || E.uinteger(i.startCharacter)) && (E.undefined(i.endCharacter) || E.uinteger(i.endCharacter)) && (E.undefined(i.kind) || E.string(i.kind));
  }
  e.is = n;
})(la || (la = {}));
var Pr;
(function(e) {
  function t(r, i) {
    return {
      location: r,
      message: i
    };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && Vt.is(i.location) && E.string(i.message);
  }
  e.is = n;
})(Pr || (Pr = {}));
var ye;
(function(e) {
  e.Error = 1, e.Warning = 2, e.Information = 3, e.Hint = 4;
})(ye || (ye = {}));
var ua;
(function(e) {
  e.Unnecessary = 1, e.Deprecated = 2;
})(ua || (ua = {}));
var ca;
(function(e) {
  function t(n) {
    const r = n;
    return E.objectLiteral(r) && E.string(r.href);
  }
  e.is = t;
})(ca || (ca = {}));
var He;
(function(e) {
  function t(r, i, s, a, o, u) {
    let l = { range: r, message: i };
    return E.defined(s) && (l.severity = s), E.defined(a) && (l.code = a), E.defined(o) && (l.source = o), E.defined(u) && (l.relatedInformation = u), l;
  }
  e.create = t;
  function n(r) {
    var i;
    let s = r;
    return E.defined(s) && W.is(s.range) && E.string(s.message) && (E.number(s.severity) || E.undefined(s.severity)) && (E.integer(s.code) || E.string(s.code) || E.undefined(s.code)) && (E.undefined(s.codeDescription) || E.string((i = s.codeDescription) === null || i === void 0 ? void 0 : i.href)) && (E.string(s.source) || E.undefined(s.source)) && (E.undefined(s.relatedInformation) || E.typedArray(s.relatedInformation, Pr.is));
  }
  e.is = n;
})(He || (He = {}));
var Dt;
(function(e) {
  function t(r, i, ...s) {
    let a = { title: r, command: i };
    return E.defined(s) && s.length > 0 && (a.arguments = s), a;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.string(i.title) && E.string(i.command);
  }
  e.is = n;
})(Dt || (Dt = {}));
var $e;
(function(e) {
  function t(s, a) {
    return { range: s, newText: a };
  }
  e.replace = t;
  function n(s, a) {
    return { range: { start: s, end: s }, newText: a };
  }
  e.insert = n;
  function r(s) {
    return { range: s, newText: "" };
  }
  e.del = r;
  function i(s) {
    const a = s;
    return E.objectLiteral(a) && E.string(a.newText) && W.is(a.range);
  }
  e.is = i;
})($e || ($e = {}));
var Cr;
(function(e) {
  function t(r, i, s) {
    const a = { label: r };
    return i !== void 0 && (a.needsConfirmation = i), s !== void 0 && (a.description = s), a;
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && E.string(i.label) && (E.boolean(i.needsConfirmation) || i.needsConfirmation === void 0) && (E.string(i.description) || i.description === void 0);
  }
  e.is = n;
})(Cr || (Cr = {}));
var Ot;
(function(e) {
  function t(n) {
    const r = n;
    return E.string(r);
  }
  e.is = t;
})(Ot || (Ot = {}));
var fa;
(function(e) {
  function t(s, a, o) {
    return { range: s, newText: a, annotationId: o };
  }
  e.replace = t;
  function n(s, a, o) {
    return { range: { start: s, end: s }, newText: a, annotationId: o };
  }
  e.insert = n;
  function r(s, a) {
    return { range: s, newText: "", annotationId: a };
  }
  e.del = r;
  function i(s) {
    const a = s;
    return $e.is(a) && (Cr.is(a.annotationId) || Ot.is(a.annotationId));
  }
  e.is = i;
})(fa || (fa = {}));
var Ir;
(function(e) {
  function t(r, i) {
    return { textDocument: r, edits: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && $r.is(i.textDocument) && Array.isArray(i.edits);
  }
  e.is = n;
})(Ir || (Ir = {}));
var Fr;
(function(e) {
  function t(r, i, s) {
    let a = {
      kind: "create",
      uri: r
    };
    return i !== void 0 && (i.overwrite !== void 0 || i.ignoreIfExists !== void 0) && (a.options = i), s !== void 0 && (a.annotationId = s), a;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return i && i.kind === "create" && E.string(i.uri) && (i.options === void 0 || (i.options.overwrite === void 0 || E.boolean(i.options.overwrite)) && (i.options.ignoreIfExists === void 0 || E.boolean(i.options.ignoreIfExists))) && (i.annotationId === void 0 || Ot.is(i.annotationId));
  }
  e.is = n;
})(Fr || (Fr = {}));
var Vr;
(function(e) {
  function t(r, i, s, a) {
    let o = {
      kind: "rename",
      oldUri: r,
      newUri: i
    };
    return s !== void 0 && (s.overwrite !== void 0 || s.ignoreIfExists !== void 0) && (o.options = s), a !== void 0 && (o.annotationId = a), o;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return i && i.kind === "rename" && E.string(i.oldUri) && E.string(i.newUri) && (i.options === void 0 || (i.options.overwrite === void 0 || E.boolean(i.options.overwrite)) && (i.options.ignoreIfExists === void 0 || E.boolean(i.options.ignoreIfExists))) && (i.annotationId === void 0 || Ot.is(i.annotationId));
  }
  e.is = n;
})(Vr || (Vr = {}));
var Dr;
(function(e) {
  function t(r, i, s) {
    let a = {
      kind: "delete",
      uri: r
    };
    return i !== void 0 && (i.recursive !== void 0 || i.ignoreIfNotExists !== void 0) && (a.options = i), s !== void 0 && (a.annotationId = s), a;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return i && i.kind === "delete" && E.string(i.uri) && (i.options === void 0 || (i.options.recursive === void 0 || E.boolean(i.options.recursive)) && (i.options.ignoreIfNotExists === void 0 || E.boolean(i.options.ignoreIfNotExists))) && (i.annotationId === void 0 || Ot.is(i.annotationId));
  }
  e.is = n;
})(Dr || (Dr = {}));
var Or;
(function(e) {
  function t(n) {
    let r = n;
    return r && (r.changes !== void 0 || r.documentChanges !== void 0) && (r.documentChanges === void 0 || r.documentChanges.every((i) => E.string(i.kind) ? Fr.is(i) || Vr.is(i) || Dr.is(i) : Ir.is(i)));
  }
  e.is = t;
})(Or || (Or = {}));
var ha;
(function(e) {
  function t(r) {
    return { uri: r };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.string(i.uri);
  }
  e.is = n;
})(ha || (ha = {}));
var da;
(function(e) {
  function t(r, i) {
    return { uri: r, version: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.string(i.uri) && E.integer(i.version);
  }
  e.is = n;
})(da || (da = {}));
var $r;
(function(e) {
  function t(r, i) {
    return { uri: r, version: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.string(i.uri) && (i.version === null || E.integer(i.version));
  }
  e.is = n;
})($r || ($r = {}));
var ga;
(function(e) {
  function t(r, i, s, a) {
    return { uri: r, languageId: i, version: s, text: a };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.string(i.uri) && E.string(i.languageId) && E.integer(i.version) && E.string(i.text);
  }
  e.is = n;
})(ga || (ga = {}));
var ft;
(function(e) {
  e.PlainText = "plaintext", e.Markdown = "markdown";
  function t(n) {
    const r = n;
    return r === e.PlainText || r === e.Markdown;
  }
  e.is = t;
})(ft || (ft = {}));
var an;
(function(e) {
  function t(n) {
    const r = n;
    return E.objectLiteral(n) && ft.is(r.kind) && E.string(r.value);
  }
  e.is = t;
})(an || (an = {}));
var xe;
(function(e) {
  e.Text = 1, e.Method = 2, e.Function = 3, e.Constructor = 4, e.Field = 5, e.Variable = 6, e.Class = 7, e.Interface = 8, e.Module = 9, e.Property = 10, e.Unit = 11, e.Value = 12, e.Enum = 13, e.Keyword = 14, e.Snippet = 15, e.Color = 16, e.File = 17, e.Reference = 18, e.Folder = 19, e.EnumMember = 20, e.Constant = 21, e.Struct = 22, e.Event = 23, e.Operator = 24, e.TypeParameter = 25;
})(xe || (xe = {}));
var ie;
(function(e) {
  e.PlainText = 1, e.Snippet = 2;
})(ie || (ie = {}));
var ma;
(function(e) {
  e.Deprecated = 1;
})(ma || (ma = {}));
var pa;
(function(e) {
  function t(r, i, s) {
    return { newText: r, insert: i, replace: s };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return i && E.string(i.newText) && W.is(i.insert) && W.is(i.replace);
  }
  e.is = n;
})(pa || (pa = {}));
var ba;
(function(e) {
  e.asIs = 1, e.adjustIndentation = 2;
})(ba || (ba = {}));
var wa;
(function(e) {
  function t(n) {
    const r = n;
    return r && (E.string(r.detail) || r.detail === void 0) && (E.string(r.description) || r.description === void 0);
  }
  e.is = t;
})(wa || (wa = {}));
var Br;
(function(e) {
  function t(n) {
    return { label: n };
  }
  e.create = t;
})(Br || (Br = {}));
var xa;
(function(e) {
  function t(n, r) {
    return { items: n || [], isIncomplete: !!r };
  }
  e.create = t;
})(xa || (xa = {}));
var Vn;
(function(e) {
  function t(r) {
    return r.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
  }
  e.fromPlainText = t;
  function n(r) {
    const i = r;
    return E.string(i) || E.objectLiteral(i) && E.string(i.language) && E.string(i.value);
  }
  e.is = n;
})(Vn || (Vn = {}));
var va;
(function(e) {
  function t(n) {
    let r = n;
    return !!r && E.objectLiteral(r) && (an.is(r.contents) || Vn.is(r.contents) || E.typedArray(r.contents, Vn.is)) && (n.range === void 0 || W.is(n.range));
  }
  e.is = t;
})(va || (va = {}));
var ya;
(function(e) {
  function t(n, r) {
    return r ? { label: n, documentation: r } : { label: n };
  }
  e.create = t;
})(ya || (ya = {}));
var La;
(function(e) {
  function t(n, r, ...i) {
    let s = { label: n };
    return E.defined(r) && (s.documentation = r), E.defined(i) ? s.parameters = i : s.parameters = [], s;
  }
  e.create = t;
})(La || (La = {}));
var Na;
(function(e) {
  e.Text = 1, e.Read = 2, e.Write = 3;
})(Na || (Na = {}));
var _a;
(function(e) {
  function t(n, r) {
    let i = { range: n };
    return E.number(r) && (i.kind = r), i;
  }
  e.create = t;
})(_a || (_a = {}));
var Ce;
(function(e) {
  e.File = 1, e.Module = 2, e.Namespace = 3, e.Package = 4, e.Class = 5, e.Method = 6, e.Property = 7, e.Field = 8, e.Constructor = 9, e.Enum = 10, e.Interface = 11, e.Function = 12, e.Variable = 13, e.Constant = 14, e.String = 15, e.Number = 16, e.Boolean = 17, e.Array = 18, e.Object = 19, e.Key = 20, e.Null = 21, e.EnumMember = 22, e.Struct = 23, e.Event = 24, e.Operator = 25, e.TypeParameter = 26;
})(Ce || (Ce = {}));
var Sa;
(function(e) {
  e.Deprecated = 1;
})(Sa || (Sa = {}));
var Aa;
(function(e) {
  function t(n, r, i, s, a) {
    let o = {
      name: n,
      kind: r,
      location: { uri: s, range: i }
    };
    return a && (o.containerName = a), o;
  }
  e.create = t;
})(Aa || (Aa = {}));
var ka;
(function(e) {
  function t(n, r, i, s) {
    return s !== void 0 ? { name: n, kind: r, location: { uri: i, range: s } } : { name: n, kind: r, location: { uri: i } };
  }
  e.create = t;
})(ka || (ka = {}));
var Ra;
(function(e) {
  function t(r, i, s, a, o, u) {
    let l = {
      name: r,
      detail: i,
      kind: s,
      range: a,
      selectionRange: o
    };
    return u !== void 0 && (l.children = u), l;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return i && E.string(i.name) && E.number(i.kind) && W.is(i.range) && W.is(i.selectionRange) && (i.detail === void 0 || E.string(i.detail)) && (i.deprecated === void 0 || E.boolean(i.deprecated)) && (i.children === void 0 || Array.isArray(i.children)) && (i.tags === void 0 || Array.isArray(i.tags));
  }
  e.is = n;
})(Ra || (Ra = {}));
var Ea;
(function(e) {
  e.Empty = "", e.QuickFix = "quickfix", e.Refactor = "refactor", e.RefactorExtract = "refactor.extract", e.RefactorInline = "refactor.inline", e.RefactorRewrite = "refactor.rewrite", e.Source = "source", e.SourceOrganizeImports = "source.organizeImports", e.SourceFixAll = "source.fixAll";
})(Ea || (Ea = {}));
var Dn;
(function(e) {
  e.Invoked = 1, e.Automatic = 2;
})(Dn || (Dn = {}));
var Ma;
(function(e) {
  function t(r, i, s) {
    let a = { diagnostics: r };
    return i != null && (a.only = i), s != null && (a.triggerKind = s), a;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.typedArray(i.diagnostics, He.is) && (i.only === void 0 || E.typedArray(i.only, E.string)) && (i.triggerKind === void 0 || i.triggerKind === Dn.Invoked || i.triggerKind === Dn.Automatic);
  }
  e.is = n;
})(Ma || (Ma = {}));
var Ta;
(function(e) {
  function t(r, i, s) {
    let a = { title: r }, o = !0;
    return typeof i == "string" ? (o = !1, a.kind = i) : Dt.is(i) ? a.command = i : a.edit = i, o && s !== void 0 && (a.kind = s), a;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return i && E.string(i.title) && (i.diagnostics === void 0 || E.typedArray(i.diagnostics, He.is)) && (i.kind === void 0 || E.string(i.kind)) && (i.edit !== void 0 || i.command !== void 0) && (i.command === void 0 || Dt.is(i.command)) && (i.isPreferred === void 0 || E.boolean(i.isPreferred)) && (i.edit === void 0 || Or.is(i.edit));
  }
  e.is = n;
})(Ta || (Ta = {}));
var Pa;
(function(e) {
  function t(r, i) {
    let s = { range: r };
    return E.defined(i) && (s.data = i), s;
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && W.is(i.range) && (E.undefined(i.command) || Dt.is(i.command));
  }
  e.is = n;
})(Pa || (Pa = {}));
var Ca;
(function(e) {
  function t(r, i) {
    return { tabSize: r, insertSpaces: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && E.uinteger(i.tabSize) && E.boolean(i.insertSpaces);
  }
  e.is = n;
})(Ca || (Ca = {}));
var Ia;
(function(e) {
  function t(r, i, s) {
    return { range: r, target: i, data: s };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.defined(i) && W.is(i.range) && (E.undefined(i.target) || E.string(i.target));
  }
  e.is = n;
})(Ia || (Ia = {}));
var On;
(function(e) {
  function t(r, i) {
    return { range: r, parent: i };
  }
  e.create = t;
  function n(r) {
    let i = r;
    return E.objectLiteral(i) && W.is(i.range) && (i.parent === void 0 || e.is(i.parent));
  }
  e.is = n;
})(On || (On = {}));
var Fa;
(function(e) {
  e.namespace = "namespace", e.type = "type", e.class = "class", e.enum = "enum", e.interface = "interface", e.struct = "struct", e.typeParameter = "typeParameter", e.parameter = "parameter", e.variable = "variable", e.property = "property", e.enumMember = "enumMember", e.event = "event", e.function = "function", e.method = "method", e.macro = "macro", e.keyword = "keyword", e.modifier = "modifier", e.comment = "comment", e.string = "string", e.number = "number", e.regexp = "regexp", e.operator = "operator", e.decorator = "decorator";
})(Fa || (Fa = {}));
var Va;
(function(e) {
  e.declaration = "declaration", e.definition = "definition", e.readonly = "readonly", e.static = "static", e.deprecated = "deprecated", e.abstract = "abstract", e.async = "async", e.modification = "modification", e.documentation = "documentation", e.defaultLibrary = "defaultLibrary";
})(Va || (Va = {}));
var Da;
(function(e) {
  function t(n) {
    const r = n;
    return E.objectLiteral(r) && (r.resultId === void 0 || typeof r.resultId == "string") && Array.isArray(r.data) && (r.data.length === 0 || typeof r.data[0] == "number");
  }
  e.is = t;
})(Da || (Da = {}));
var Oa;
(function(e) {
  function t(r, i) {
    return { range: r, text: i };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return i != null && W.is(i.range) && E.string(i.text);
  }
  e.is = n;
})(Oa || (Oa = {}));
var $a;
(function(e) {
  function t(r, i, s) {
    return { range: r, variableName: i, caseSensitiveLookup: s };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return i != null && W.is(i.range) && E.boolean(i.caseSensitiveLookup) && (E.string(i.variableName) || i.variableName === void 0);
  }
  e.is = n;
})($a || ($a = {}));
var Ba;
(function(e) {
  function t(r, i) {
    return { range: r, expression: i };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return i != null && W.is(i.range) && (E.string(i.expression) || i.expression === void 0);
  }
  e.is = n;
})(Ba || (Ba = {}));
var Ua;
(function(e) {
  function t(r, i) {
    return { frameId: r, stoppedLocation: i };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.defined(i) && W.is(r.stoppedLocation);
  }
  e.is = n;
})(Ua || (Ua = {}));
var Ur;
(function(e) {
  e.Type = 1, e.Parameter = 2;
  function t(n) {
    return n === 1 || n === 2;
  }
  e.is = t;
})(Ur || (Ur = {}));
var qr;
(function(e) {
  function t(r) {
    return { value: r };
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && (i.tooltip === void 0 || E.string(i.tooltip) || an.is(i.tooltip)) && (i.location === void 0 || Vt.is(i.location)) && (i.command === void 0 || Dt.is(i.command));
  }
  e.is = n;
})(qr || (qr = {}));
var qa;
(function(e) {
  function t(r, i, s) {
    const a = { position: r, label: i };
    return s !== void 0 && (a.kind = s), a;
  }
  e.create = t;
  function n(r) {
    const i = r;
    return E.objectLiteral(i) && ee.is(i.position) && (E.string(i.label) || E.typedArray(i.label, qr.is)) && (i.kind === void 0 || Ur.is(i.kind)) && i.textEdits === void 0 || E.typedArray(i.textEdits, $e.is) && (i.tooltip === void 0 || E.string(i.tooltip) || an.is(i.tooltip)) && (i.paddingLeft === void 0 || E.boolean(i.paddingLeft)) && (i.paddingRight === void 0 || E.boolean(i.paddingRight));
  }
  e.is = n;
})(qa || (qa = {}));
var ja;
(function(e) {
  function t(n) {
    return { kind: "snippet", value: n };
  }
  e.createSnippet = t;
})(ja || (ja = {}));
var Wa;
(function(e) {
  function t(n, r, i, s) {
    return { insertText: n, filterText: r, range: i, command: s };
  }
  e.create = t;
})(Wa || (Wa = {}));
var Ha;
(function(e) {
  function t(n) {
    return { items: n };
  }
  e.create = t;
})(Ha || (Ha = {}));
var za;
(function(e) {
  e.Invoked = 0, e.Automatic = 1;
})(za || (za = {}));
var Ga;
(function(e) {
  function t(n, r) {
    return { range: n, text: r };
  }
  e.create = t;
})(Ga || (Ga = {}));
var Ja;
(function(e) {
  function t(n, r) {
    return { triggerKind: n, selectedCompletionInfo: r };
  }
  e.create = t;
})(Ja || (Ja = {}));
var Xa;
(function(e) {
  function t(n) {
    const r = n;
    return E.objectLiteral(r) && Mr.is(r.uri) && E.string(r.name);
  }
  e.is = t;
})(Xa || (Xa = {}));
var Qa;
(function(e) {
  function t(s, a, o, u) {
    return new Zc(s, a, o, u);
  }
  e.create = t;
  function n(s) {
    let a = s;
    return !!(E.defined(a) && E.string(a.uri) && (E.undefined(a.languageId) || E.string(a.languageId)) && E.uinteger(a.lineCount) && E.func(a.getText) && E.func(a.positionAt) && E.func(a.offsetAt));
  }
  e.is = n;
  function r(s, a) {
    let o = s.getText(), u = i(a, (h, f) => {
      let d = h.range.start.line - f.range.start.line;
      return d === 0 ? h.range.start.character - f.range.start.character : d;
    }), l = o.length;
    for (let h = u.length - 1; h >= 0; h--) {
      let f = u[h], d = s.offsetAt(f.range.start), m = s.offsetAt(f.range.end);
      if (m <= l)
        o = o.substring(0, d) + f.newText + o.substring(m, o.length);
      else
        throw new Error("Overlapping edit");
      l = d;
    }
    return o;
  }
  e.applyEdits = r;
  function i(s, a) {
    if (s.length <= 1)
      return s;
    const o = s.length / 2 | 0, u = s.slice(0, o), l = s.slice(o);
    i(u, a), i(l, a);
    let h = 0, f = 0, d = 0;
    for (; h < u.length && f < l.length; )
      a(u[h], l[f]) <= 0 ? s[d++] = u[h++] : s[d++] = l[f++];
    for (; h < u.length; )
      s[d++] = u[h++];
    for (; f < l.length; )
      s[d++] = l[f++];
    return s;
  }
})(Qa || (Qa = {}));
let Zc = class {
  constructor(t, n, r, i) {
    this._uri = t, this._languageId = n, this._version = r, this._content = i, this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(t) {
    if (t) {
      let n = this.offsetAt(t.start), r = this.offsetAt(t.end);
      return this._content.substring(n, r);
    }
    return this._content;
  }
  update(t, n) {
    this._content = t.text, this._version = n, this._lineOffsets = void 0;
  }
  getLineOffsets() {
    if (this._lineOffsets === void 0) {
      let t = [], n = this._content, r = !0;
      for (let i = 0; i < n.length; i++) {
        r && (t.push(i), r = !1);
        let s = n.charAt(i);
        r = s === "\r" || s === `
`, s === "\r" && i + 1 < n.length && n.charAt(i + 1) === `
` && i++;
      }
      r && n.length > 0 && t.push(n.length), this._lineOffsets = t;
    }
    return this._lineOffsets;
  }
  positionAt(t) {
    t = Math.max(Math.min(t, this._content.length), 0);
    let n = this.getLineOffsets(), r = 0, i = n.length;
    if (i === 0)
      return ee.create(0, t);
    for (; r < i; ) {
      let a = Math.floor((r + i) / 2);
      n[a] > t ? i = a : r = a + 1;
    }
    let s = r - 1;
    return ee.create(s, t - n[s]);
  }
  offsetAt(t) {
    let n = this.getLineOffsets();
    if (t.line >= n.length)
      return this._content.length;
    if (t.line < 0)
      return 0;
    let r = n[t.line], i = t.line + 1 < n.length ? n[t.line + 1] : this._content.length;
    return Math.max(Math.min(r + t.character, i), r);
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
};
var E;
(function(e) {
  const t = Object.prototype.toString;
  function n(m) {
    return typeof m < "u";
  }
  e.defined = n;
  function r(m) {
    return typeof m > "u";
  }
  e.undefined = r;
  function i(m) {
    return m === !0 || m === !1;
  }
  e.boolean = i;
  function s(m) {
    return t.call(m) === "[object String]";
  }
  e.string = s;
  function a(m) {
    return t.call(m) === "[object Number]";
  }
  e.number = a;
  function o(m, g, p) {
    return t.call(m) === "[object Number]" && g <= m && m <= p;
  }
  e.numberRange = o;
  function u(m) {
    return t.call(m) === "[object Number]" && -2147483648 <= m && m <= 2147483647;
  }
  e.integer = u;
  function l(m) {
    return t.call(m) === "[object Number]" && 0 <= m && m <= 2147483647;
  }
  e.uinteger = l;
  function h(m) {
    return t.call(m) === "[object Function]";
  }
  e.func = h;
  function f(m) {
    return m !== null && typeof m == "object";
  }
  e.objectLiteral = f;
  function d(m, g) {
    return Array.isArray(m) && m.every(g);
  }
  e.typedArray = d;
})(E || (E = {}));
class on {
  constructor(t, n, r, i) {
    this._uri = t, this._languageId = n, this._version = r, this._content = i, this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(t) {
    if (t) {
      const n = this.offsetAt(t.start), r = this.offsetAt(t.end);
      return this._content.substring(n, r);
    }
    return this._content;
  }
  update(t, n) {
    for (let r of t)
      if (on.isIncremental(r)) {
        const i = Co(r.range), s = this.offsetAt(i.start), a = this.offsetAt(i.end);
        this._content = this._content.substring(0, s) + r.text + this._content.substring(a, this._content.length);
        const o = Math.max(i.start.line, 0), u = Math.max(i.end.line, 0);
        let l = this._lineOffsets;
        const h = Za(r.text, !1, s);
        if (u - o === h.length)
          for (let d = 0, m = h.length; d < m; d++)
            l[d + o + 1] = h[d];
        else
          h.length < 1e4 ? l.splice(o + 1, u - o, ...h) : this._lineOffsets = l = l.slice(0, o + 1).concat(h, l.slice(u + 1));
        const f = r.text.length - (a - s);
        if (f !== 0)
          for (let d = o + 1 + h.length, m = l.length; d < m; d++)
            l[d] = l[d] + f;
      } else if (on.isFull(r))
        this._content = r.text, this._lineOffsets = void 0;
      else
        throw new Error("Unknown change event received");
    this._version = n;
  }
  getLineOffsets() {
    return this._lineOffsets === void 0 && (this._lineOffsets = Za(this._content, !0)), this._lineOffsets;
  }
  positionAt(t) {
    t = Math.max(Math.min(t, this._content.length), 0);
    let n = this.getLineOffsets(), r = 0, i = n.length;
    if (i === 0)
      return { line: 0, character: t };
    for (; r < i; ) {
      let a = Math.floor((r + i) / 2);
      n[a] > t ? i = a : r = a + 1;
    }
    let s = r - 1;
    return { line: s, character: t - n[s] };
  }
  offsetAt(t) {
    let n = this.getLineOffsets();
    if (t.line >= n.length)
      return this._content.length;
    if (t.line < 0)
      return 0;
    let r = n[t.line], i = t.line + 1 < n.length ? n[t.line + 1] : this._content.length;
    return Math.max(Math.min(r + t.character, i), r);
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
  static isIncremental(t) {
    let n = t;
    return n != null && typeof n.text == "string" && n.range !== void 0 && (n.rangeLength === void 0 || typeof n.rangeLength == "number");
  }
  static isFull(t) {
    let n = t;
    return n != null && typeof n.text == "string" && n.range === void 0 && n.rangeLength === void 0;
  }
}
var Pe;
(function(e) {
  function t(i, s, a, o) {
    return new on(i, s, a, o);
  }
  e.create = t;
  function n(i, s, a) {
    if (i instanceof on)
      return i.update(s, a), i;
    throw new Error("TextDocument.update: document must be created by TextDocument.create");
  }
  e.update = n;
  function r(i, s) {
    let a = i.getText(), o = jr(s.map(Yc), (h, f) => {
      let d = h.range.start.line - f.range.start.line;
      return d === 0 ? h.range.start.character - f.range.start.character : d;
    }), u = 0;
    const l = [];
    for (const h of o) {
      let f = i.offsetAt(h.range.start);
      if (f < u)
        throw new Error("Overlapping edit");
      f > u && l.push(a.substring(u, f)), h.newText.length && l.push(h.newText), u = i.offsetAt(h.range.end);
    }
    return l.push(a.substr(u)), l.join("");
  }
  e.applyEdits = r;
})(Pe || (Pe = {}));
function jr(e, t) {
  if (e.length <= 1)
    return e;
  const n = e.length / 2 | 0, r = e.slice(0, n), i = e.slice(n);
  jr(r, t), jr(i, t);
  let s = 0, a = 0, o = 0;
  for (; s < r.length && a < i.length; )
    t(r[s], i[a]) <= 0 ? e[o++] = r[s++] : e[o++] = i[a++];
  for (; s < r.length; )
    e[o++] = r[s++];
  for (; a < i.length; )
    e[o++] = i[a++];
  return e;
}
function Za(e, t, n = 0) {
  const r = t ? [n] : [];
  for (let i = 0; i < e.length; i++) {
    let s = e.charCodeAt(i);
    (s === 13 || s === 10) && (s === 13 && i + 1 < e.length && e.charCodeAt(i + 1) === 10 && i++, r.push(n + i + 1));
  }
  return r;
}
function Co(e) {
  const t = e.start, n = e.end;
  return t.line > n.line || t.line === n.line && t.character > n.character ? { start: n, end: t } : e;
}
function Yc(e) {
  const t = Co(e.range);
  return t !== e.range ? { newText: e.newText, range: t } : e;
}
var G;
(function(e) {
  e[e.Undefined = 0] = "Undefined", e[e.EnumValueMismatch = 1] = "EnumValueMismatch", e[e.Deprecated = 2] = "Deprecated", e[e.UnexpectedEndOfComment = 257] = "UnexpectedEndOfComment", e[e.UnexpectedEndOfString = 258] = "UnexpectedEndOfString", e[e.UnexpectedEndOfNumber = 259] = "UnexpectedEndOfNumber", e[e.InvalidUnicode = 260] = "InvalidUnicode", e[e.InvalidEscapeCharacter = 261] = "InvalidEscapeCharacter", e[e.InvalidCharacter = 262] = "InvalidCharacter", e[e.PropertyExpected = 513] = "PropertyExpected", e[e.CommaExpected = 514] = "CommaExpected", e[e.ColonExpected = 515] = "ColonExpected", e[e.ValueExpected = 516] = "ValueExpected", e[e.CommaOrCloseBacketExpected = 517] = "CommaOrCloseBacketExpected", e[e.CommaOrCloseBraceExpected = 518] = "CommaOrCloseBraceExpected", e[e.TrailingComma = 519] = "TrailingComma", e[e.DuplicateKey = 520] = "DuplicateKey", e[e.CommentNotPermitted = 521] = "CommentNotPermitted", e[e.PropertyKeysMustBeDoublequoted = 528] = "PropertyKeysMustBeDoublequoted", e[e.SchemaResolveError = 768] = "SchemaResolveError", e[e.SchemaUnsupportedFeature = 769] = "SchemaUnsupportedFeature";
})(G || (G = {}));
var Te;
(function(e) {
  e[e.v3 = 3] = "v3", e[e.v4 = 4] = "v4", e[e.v6 = 6] = "v6", e[e.v7 = 7] = "v7", e[e.v2019_09 = 19] = "v2019_09", e[e.v2020_12 = 20] = "v2020_12";
})(Te || (Te = {}));
var Wr;
(function(e) {
  e.LATEST = {
    textDocument: {
      completion: {
        completionItem: {
          documentationFormat: [ft.Markdown, ft.PlainText],
          commitCharactersSupport: !0,
          labelDetailsSupport: !0
        }
      }
    }
  };
})(Wr || (Wr = {}));
function P(...e) {
  const t = e[0];
  let n, r, i;
  if (typeof t == "string")
    n = t, r = t, e.splice(0, 1), i = !e || typeof e[0] != "object" ? e : e[0];
  else if (t instanceof Array) {
    const s = e.slice(1);
    if (t.length !== s.length + 1)
      throw new Error("expected a string as the first argument to l10n.t");
    let a = t[0];
    for (let o = 1; o < t.length; o++)
      a += `{${o - 1}}` + t[o];
    return P(a, ...s);
  } else
    r = t.message, n = r, t.comment && t.comment.length > 0 && (n += `/${Array.isArray(t.comment) ? t.comment.join("") : t.comment}`), i = t.args ?? {};
  return e1(r, i);
}
var Kc = /{([^}]+)}/g;
function e1(e, t) {
  return Object.keys(t).length === 0 ? e : e.replace(Kc, (n, r) => t[r] ?? n);
}
const t1 = {
  "color-hex": { errorMessage: P("Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA."), pattern: /^#([0-9A-Fa-f]{3,4}|([0-9A-Fa-f]{2}){3,4})$/ },
  "date-time": { errorMessage: P("String is not a RFC3339 date-time."), pattern: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i },
  date: { errorMessage: P("String is not a RFC3339 date."), pattern: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/i },
  time: { errorMessage: P("String is not a RFC3339 time."), pattern: /^([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i },
  email: { errorMessage: P("String is not an e-mail address."), pattern: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}))$/ },
  hostname: { errorMessage: P("String is not a hostname."), pattern: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i },
  ipv4: { errorMessage: P("String is not an IPv4 address."), pattern: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/ },
  ipv6: { errorMessage: P("String is not an IPv6 address."), pattern: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i }
};
class ht {
  constructor(t, n, r = 0) {
    this.offset = n, this.length = r, this.parent = t;
  }
  get children() {
    return [];
  }
  toString() {
    return "type: " + this.type + " (" + this.offset + "/" + this.length + ")" + (this.parent ? " parent: {" + this.parent.toString() + "}" : "");
  }
}
class n1 extends ht {
  constructor(t, n) {
    super(t, n), this.type = "null", this.value = null;
  }
}
class Ya extends ht {
  constructor(t, n, r) {
    super(t, r), this.type = "boolean", this.value = n;
  }
}
class r1 extends ht {
  constructor(t, n) {
    super(t, n), this.type = "array", this.items = [];
  }
  get children() {
    return this.items;
  }
}
class i1 extends ht {
  constructor(t, n) {
    super(t, n), this.type = "number", this.isInteger = !0, this.value = Number.NaN;
  }
}
class Kn extends ht {
  constructor(t, n, r) {
    super(t, n, r), this.type = "string", this.value = "";
  }
}
class s1 extends ht {
  constructor(t, n, r) {
    super(t, n), this.type = "property", this.colonOffset = -1, this.keyNode = r;
  }
  get children() {
    return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
  }
}
class a1 extends ht {
  constructor(t, n) {
    super(t, n), this.type = "object", this.properties = [];
  }
  get children() {
    return this.properties;
  }
}
function be(e) {
  return De(e) ? e ? {} : { not: {} } : e;
}
var Ka;
(function(e) {
  e[e.Key = 0] = "Key", e[e.Enum = 1] = "Enum";
})(Ka || (Ka = {}));
const o1 = {
  "http://json-schema.org/draft-03/schema#": Te.v3,
  "http://json-schema.org/draft-04/schema#": Te.v4,
  "http://json-schema.org/draft-06/schema#": Te.v6,
  "http://json-schema.org/draft-07/schema#": Te.v7,
  "https://json-schema.org/draft/2019-09/schema": Te.v2019_09,
  "https://json-schema.org/draft/2020-12/schema": Te.v2020_12
};
class eo {
  constructor(t) {
    this.schemaDraft = t;
  }
}
class ri {
  constructor(t = -1, n) {
    this.focusOffset = t, this.exclude = n, this.schemas = [];
  }
  add(t) {
    this.schemas.push(t);
  }
  merge(t) {
    Array.prototype.push.apply(this.schemas, t.schemas);
  }
  include(t) {
    return (this.focusOffset === -1 || Io(t, this.focusOffset)) && t !== this.exclude;
  }
  newSub() {
    return new ri(-1, this.exclude);
  }
}
class ln {
  constructor() {
  }
  get schemas() {
    return [];
  }
  add(t) {
  }
  merge(t) {
  }
  include(t) {
    return !0;
  }
  newSub() {
    return this;
  }
}
ln.instance = new ln();
class fe {
  constructor() {
    this.problems = [], this.propertiesMatches = 0, this.processedProperties = /* @__PURE__ */ new Set(), this.propertiesValueMatches = 0, this.primaryValueMatches = 0, this.enumValueMatch = !1, this.enumValues = void 0;
  }
  hasProblems() {
    return !!this.problems.length;
  }
  merge(t) {
    this.problems = this.problems.concat(t.problems), this.propertiesMatches += t.propertiesMatches, this.propertiesValueMatches += t.propertiesValueMatches, this.mergeProcessedProperties(t);
  }
  mergeEnumValues(t) {
    if (!this.enumValueMatch && !t.enumValueMatch && this.enumValues && t.enumValues) {
      this.enumValues = this.enumValues.concat(t.enumValues);
      for (const n of this.problems)
        n.code === G.EnumValueMismatch && (n.message = P("Value is not accepted. Valid values: {0}.", this.enumValues.map((r) => JSON.stringify(r)).join(", ")));
    }
  }
  mergePropertyMatch(t) {
    this.problems = this.problems.concat(t.problems), this.propertiesMatches++, (t.enumValueMatch || !t.hasProblems() && t.propertiesMatches) && this.propertiesValueMatches++, t.enumValueMatch && t.enumValues && t.enumValues.length === 1 && this.primaryValueMatches++;
  }
  mergeProcessedProperties(t) {
    t.processedProperties.forEach((n) => this.processedProperties.add(n));
  }
  compare(t) {
    const n = this.hasProblems();
    return n !== t.hasProblems() ? n ? -1 : 1 : this.enumValueMatch !== t.enumValueMatch ? t.enumValueMatch ? -1 : 1 : this.primaryValueMatches !== t.primaryValueMatches ? this.primaryValueMatches - t.primaryValueMatches : this.propertiesValueMatches !== t.propertiesValueMatches ? this.propertiesValueMatches - t.propertiesValueMatches : this.propertiesMatches - t.propertiesMatches;
  }
}
function l1(e, t = []) {
  return new Fo(e, t, []);
}
function ut(e) {
  return Jc(e);
}
function Hr(e) {
  return Gc(e);
}
function Io(e, t, n = !1) {
  return t >= e.offset && t < e.offset + e.length || n && t === e.offset + e.length;
}
class Fo {
  constructor(t, n = [], r = []) {
    this.root = t, this.syntaxErrors = n, this.comments = r;
  }
  getNodeFromOffset(t, n = !1) {
    if (this.root)
      return zc(this.root, t, n);
  }
  visit(t) {
    if (this.root) {
      const n = (r) => {
        let i = t(r);
        const s = r.children;
        if (Array.isArray(s))
          for (let a = 0; a < s.length && i; a++)
            i = n(s[a]);
        return i;
      };
      n(this.root);
    }
  }
  validate(t, n, r = ye.Warning, i) {
    if (this.root && n) {
      const s = new fe();
      return ae(this.root, n, s, ln.instance, new eo(i ?? to(n))), s.problems.map((a) => {
        const o = W.create(t.positionAt(a.location.offset), t.positionAt(a.location.offset + a.location.length));
        return He.create(o, a.message, a.severity ?? r, a.code);
      });
    }
  }
  getMatchingSchemas(t, n = -1, r) {
    if (this.root && t) {
      const i = new ri(n, r), s = to(t), a = new eo(s);
      return ae(this.root, t, new fe(), i, a), i.schemas;
    }
    return [];
  }
}
function to(e, t = Te.v2020_12) {
  let n = e.$schema;
  return n ? o1[n] ?? t : t;
}
function ae(e, t, n, r, i) {
  if (!e || !r.include(e))
    return;
  if (e.type === "property")
    return ae(e.valueNode, t, n, r, i);
  const s = e;
  switch (a(), s.type) {
    case "object":
      h(s);
      break;
    case "array":
      l(s);
      break;
    case "string":
      u(s);
      break;
    case "number":
      o(s);
      break;
  }
  r.add({ node: s, schema: t });
  function a() {
    var N;
    function f(b) {
      return s.type === b || b === "integer" && s.type === "number" && s.isInteger;
    }
    if (Array.isArray(t.type) ? t.type.some(f) || n.problems.push({
      location: { offset: s.offset, length: s.length },
      message: t.errorMessage || P("Incorrect type. Expected one of {0}.", t.type.join(", "))
    }) : t.type && (f(t.type) || n.problems.push({
      location: { offset: s.offset, length: s.length },
      message: t.errorMessage || P('Incorrect type. Expected "{0}".', t.type)
    })), Array.isArray(t.allOf))
      for (const b of t.allOf) {
        const _ = new fe(), L = r.newSub();
        ae(s, be(b), _, L, i), n.merge(_), r.merge(L);
      }
    const d = be(t.not);
    if (d) {
      const b = new fe(), _ = r.newSub();
      ae(s, d, b, _, i), b.hasProblems() || n.problems.push({
        location: { offset: s.offset, length: s.length },
        message: t.errorMessage || P("Matches a schema that is not allowed.")
      });
      for (const L of _.schemas)
        L.inverted = !L.inverted, r.add(L);
    }
    const m = (b, _) => {
      const L = [];
      let S;
      for (const v of b) {
        const k = be(v), M = new fe(), V = r.newSub();
        if (ae(s, k, M, V, i), M.hasProblems() || L.push(k), !S)
          S = { schema: k, validationResult: M, matchingSchemas: V };
        else if (!_ && !M.hasProblems() && !S.validationResult.hasProblems())
          S.matchingSchemas.merge(V), S.validationResult.propertiesMatches += M.propertiesMatches, S.validationResult.propertiesValueMatches += M.propertiesValueMatches, S.validationResult.mergeProcessedProperties(M);
        else {
          const T = M.compare(S.validationResult);
          T > 0 ? S = { schema: k, validationResult: M, matchingSchemas: V } : T === 0 && (S.matchingSchemas.merge(V), S.validationResult.mergeEnumValues(M));
        }
      }
      return L.length > 1 && _ && n.problems.push({
        location: { offset: s.offset, length: 1 },
        message: P("Matches multiple schemas when only one must validate.")
      }), S && (n.merge(S.validationResult), r.merge(S.matchingSchemas)), L.length;
    };
    Array.isArray(t.anyOf) && m(t.anyOf, !1), Array.isArray(t.oneOf) && m(t.oneOf, !0);
    const g = (b) => {
      const _ = new fe(), L = r.newSub();
      ae(s, be(b), _, L, i), n.merge(_), r.merge(L);
    }, p = (b, _, L) => {
      const S = be(b), v = new fe(), k = r.newSub();
      ae(s, S, v, k, i), r.merge(k), n.mergeProcessedProperties(v), v.hasProblems() ? L && g(L) : _ && g(_);
    }, w = be(t.if);
    if (w && p(w, be(t.then), be(t.else)), Array.isArray(t.enum)) {
      const b = ut(s);
      let _ = !1;
      for (const L of t.enum)
        if (Pt(b, L)) {
          _ = !0;
          break;
        }
      n.enumValues = t.enum, n.enumValueMatch = _, _ || n.problems.push({
        location: { offset: s.offset, length: s.length },
        code: G.EnumValueMismatch,
        message: t.errorMessage || P("Value is not accepted. Valid values: {0}.", t.enum.map((L) => JSON.stringify(L)).join(", "))
      });
    }
    if (Re(t.const)) {
      const b = ut(s);
      Pt(b, t.const) ? n.enumValueMatch = !0 : (n.problems.push({
        location: { offset: s.offset, length: s.length },
        code: G.EnumValueMismatch,
        message: t.errorMessage || P("Value must be {0}.", JSON.stringify(t.const))
      }), n.enumValueMatch = !1), n.enumValues = [t.const];
    }
    let y = t.deprecationMessage;
    if (y || t.deprecated) {
      y = y || P("Value is deprecated");
      let b = ((N = s.parent) == null ? void 0 : N.type) === "property" ? s.parent : s;
      n.problems.push({
        location: { offset: b.offset, length: b.length },
        severity: ye.Warning,
        message: y,
        code: G.Deprecated
      });
    }
  }
  function o(f) {
    const d = f.value;
    function m(_) {
      var S;
      const L = /^(-?\d+)(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(_.toString());
      return L && {
        value: Number(L[1] + (L[2] || "")),
        multiplier: (((S = L[2]) == null ? void 0 : S.length) || 0) - (parseInt(L[3]) || 0)
      };
    }
    if (ce(t.multipleOf)) {
      let _ = -1;
      if (Number.isInteger(t.multipleOf))
        _ = d % t.multipleOf;
      else {
        let L = m(t.multipleOf), S = m(d);
        if (L && S) {
          const v = 10 ** Math.abs(S.multiplier - L.multiplier);
          S.multiplier < L.multiplier ? S.value *= v : L.value *= v, _ = S.value % L.value;
        }
      }
      _ !== 0 && n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: P("Value is not divisible by {0}.", t.multipleOf)
      });
    }
    function g(_, L) {
      if (ce(L))
        return L;
      if (De(L) && L)
        return _;
    }
    function p(_, L) {
      if (!De(L) || !L)
        return _;
    }
    const w = g(t.minimum, t.exclusiveMinimum);
    ce(w) && d <= w && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Value is below the exclusive minimum of {0}.", w)
    });
    const y = g(t.maximum, t.exclusiveMaximum);
    ce(y) && d >= y && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Value is above the exclusive maximum of {0}.", y)
    });
    const N = p(t.minimum, t.exclusiveMinimum);
    ce(N) && d < N && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Value is below the minimum of {0}.", N)
    });
    const b = p(t.maximum, t.exclusiveMaximum);
    ce(b) && d > b && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Value is above the maximum of {0}.", b)
    });
  }
  function u(f) {
    if (ce(t.minLength) && na(f.value) < t.minLength && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("String is shorter than the minimum length of {0}.", t.minLength)
    }), ce(t.maxLength) && na(f.value) > t.maxLength && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("String is longer than the maximum length of {0}.", t.maxLength)
    }), Po(t.pattern)) {
      const d = In(t.pattern);
      d != null && d.test(f.value) || n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: t.patternErrorMessage || t.errorMessage || P('String does not match the pattern of "{0}".', t.pattern)
      });
    }
    if (t.format)
      switch (t.format) {
        case "uri":
        case "uri-reference":
          {
            let m;
            if (!f.value)
              m = P("URI expected.");
            else {
              const g = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/.exec(f.value);
              g ? !g[2] && t.format === "uri" && (m = P("URI with a scheme is expected.")) : m = P("URI is expected.");
            }
            m && n.problems.push({
              location: { offset: f.offset, length: f.length },
              message: t.patternErrorMessage || t.errorMessage || P("String is not a URI: {0}", m)
            });
          }
          break;
        case "color-hex":
        case "date-time":
        case "date":
        case "time":
        case "email":
        case "hostname":
        case "ipv4":
        case "ipv6":
          const d = t1[t.format];
          (!f.value || !d.pattern.exec(f.value)) && n.problems.push({
            location: { offset: f.offset, length: f.length },
            message: t.patternErrorMessage || t.errorMessage || d.errorMessage
          });
      }
  }
  function l(f) {
    let d, m;
    i.schemaDraft >= Te.v2020_12 ? (d = t.prefixItems, m = Array.isArray(t.items) ? void 0 : t.items) : (d = Array.isArray(t.items) ? t.items : void 0, m = Array.isArray(t.items) ? t.additionalItems : t.items);
    let g = 0;
    if (d !== void 0) {
      const N = Math.min(d.length, f.items.length);
      for (; g < N; g++) {
        const b = d[g], _ = be(b), L = new fe(), S = f.items[g];
        S && (ae(S, _, L, r, i), n.mergePropertyMatch(L)), n.processedProperties.add(String(g));
      }
    }
    if (m !== void 0 && g < f.items.length)
      if (typeof m == "boolean")
        for (m === !1 && n.problems.push({
          location: { offset: f.offset, length: f.length },
          message: P("Array has too many items according to schema. Expected {0} or fewer.", g)
        }); g < f.items.length; g++)
          n.processedProperties.add(String(g)), n.propertiesValueMatches++;
      else
        for (; g < f.items.length; g++) {
          const N = new fe();
          ae(f.items[g], m, N, r, i), n.mergePropertyMatch(N), n.processedProperties.add(String(g));
        }
    const p = be(t.contains);
    if (p) {
      let N = 0;
      for (let b = 0; b < f.items.length; b++) {
        const _ = f.items[b], L = new fe();
        ae(_, p, L, ln.instance, i), L.hasProblems() || (N++, i.schemaDraft >= Te.v2020_12 && n.processedProperties.add(String(b)));
      }
      N === 0 && !ce(t.minContains) && n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: t.errorMessage || P("Array does not contain required item.")
      }), ce(t.minContains) && N < t.minContains && n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: t.errorMessage || P("Array has too few items that match the contains contraint. Expected {0} or more.", t.minContains)
      }), ce(t.maxContains) && N > t.maxContains && n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: t.errorMessage || P("Array has too many items that match the contains contraint. Expected {0} or less.", t.maxContains)
      });
    }
    const w = t.unevaluatedItems;
    if (w !== void 0)
      for (let N = 0; N < f.items.length; N++) {
        if (!n.processedProperties.has(String(N)))
          if (w === !1)
            n.problems.push({
              location: { offset: f.offset, length: f.length },
              message: P("Item does not match any validation rule from the array.")
            });
          else {
            const b = new fe();
            ae(f.items[N], t.unevaluatedItems, b, r, i), n.mergePropertyMatch(b);
          }
        n.processedProperties.add(String(N)), n.propertiesValueMatches++;
      }
    if (ce(t.minItems) && f.items.length < t.minItems && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Array has too few items. Expected {0} or more.", t.minItems)
    }), ce(t.maxItems) && f.items.length > t.maxItems && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Array has too many items. Expected {0} or fewer.", t.maxItems)
    }), t.uniqueItems === !0) {
      let b = function() {
        for (let _ = 0; _ < N.length - 1; _++) {
          const L = N[_];
          for (let S = _ + 1; S < N.length; S++)
            if (Pt(L, N[S]))
              return !0;
        }
        return !1;
      };
      var y = b;
      const N = ut(f);
      b() && n.problems.push({
        location: { offset: f.offset, length: f.length },
        message: P("Array has duplicate items.")
      });
    }
  }
  function h(f) {
    const d = /* @__PURE__ */ Object.create(null), m = /* @__PURE__ */ new Set();
    for (const b of f.properties) {
      const _ = b.keyNode.value;
      d[_] = b.valueNode, m.add(_);
    }
    if (Array.isArray(t.required)) {
      for (const b of t.required)
        if (!d[b]) {
          const _ = f.parent && f.parent.type === "property" && f.parent.keyNode, L = _ ? { offset: _.offset, length: _.length } : { offset: f.offset, length: 1 };
          n.problems.push({
            location: L,
            message: P('Missing property "{0}".', b)
          });
        }
    }
    const g = (b) => {
      m.delete(b), n.processedProperties.add(b);
    };
    if (t.properties)
      for (const b of Object.keys(t.properties)) {
        g(b);
        const _ = t.properties[b], L = d[b];
        if (L)
          if (De(_))
            if (_)
              n.propertiesMatches++, n.propertiesValueMatches++;
            else {
              const S = L.parent;
              n.problems.push({
                location: { offset: S.keyNode.offset, length: S.keyNode.length },
                message: t.errorMessage || P("Property {0} is not allowed.", b)
              });
            }
          else {
            const S = new fe();
            ae(L, _, S, r, i), n.mergePropertyMatch(S);
          }
      }
    if (t.patternProperties)
      for (const b of Object.keys(t.patternProperties)) {
        const _ = In(b);
        if (_) {
          const L = [];
          for (const S of m)
            if (_.test(S)) {
              L.push(S);
              const v = d[S];
              if (v) {
                const k = t.patternProperties[b];
                if (De(k))
                  if (k)
                    n.propertiesMatches++, n.propertiesValueMatches++;
                  else {
                    const M = v.parent;
                    n.problems.push({
                      location: { offset: M.keyNode.offset, length: M.keyNode.length },
                      message: t.errorMessage || P("Property {0} is not allowed.", S)
                    });
                  }
                else {
                  const M = new fe();
                  ae(v, k, M, r, i), n.mergePropertyMatch(M);
                }
              }
            }
          L.forEach(g);
        }
      }
    const p = t.additionalProperties;
    if (p !== void 0)
      for (const b of m) {
        g(b);
        const _ = d[b];
        if (_) {
          if (p === !1) {
            const L = _.parent;
            n.problems.push({
              location: { offset: L.keyNode.offset, length: L.keyNode.length },
              message: t.errorMessage || P("Property {0} is not allowed.", b)
            });
          } else if (p !== !0) {
            const L = new fe();
            ae(_, p, L, r, i), n.mergePropertyMatch(L);
          }
        }
      }
    const w = t.unevaluatedProperties;
    if (w !== void 0) {
      const b = [];
      for (const _ of m)
        if (!n.processedProperties.has(_)) {
          b.push(_);
          const L = d[_];
          if (L) {
            if (w === !1) {
              const S = L.parent;
              n.problems.push({
                location: { offset: S.keyNode.offset, length: S.keyNode.length },
                message: t.errorMessage || P("Property {0} is not allowed.", _)
              });
            } else if (w !== !0) {
              const S = new fe();
              ae(L, w, S, r, i), n.mergePropertyMatch(S);
            }
          }
        }
      b.forEach(g);
    }
    if (ce(t.maxProperties) && f.properties.length > t.maxProperties && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Object has more properties than limit of {0}.", t.maxProperties)
    }), ce(t.minProperties) && f.properties.length < t.minProperties && n.problems.push({
      location: { offset: f.offset, length: f.length },
      message: P("Object has fewer properties than the required number of {0}", t.minProperties)
    }), t.dependentRequired)
      for (const b in t.dependentRequired) {
        const _ = d[b], L = t.dependentRequired[b];
        _ && Array.isArray(L) && N(b, L);
      }
    if (t.dependentSchemas)
      for (const b in t.dependentSchemas) {
        const _ = d[b], L = t.dependentSchemas[b];
        _ && Ze(L) && N(b, L);
      }
    if (t.dependencies)
      for (const b in t.dependencies)
        d[b] && N(b, t.dependencies[b]);
    const y = be(t.propertyNames);
    if (y)
      for (const b of f.properties) {
        const _ = b.keyNode;
        _ && ae(_, y, n, ln.instance, i);
      }
    function N(b, _) {
      if (Array.isArray(_))
        for (const L of _)
          d[L] ? n.propertiesValueMatches++ : n.problems.push({
            location: { offset: f.offset, length: f.length },
            message: P("Object is missing property {0} required by property {1}.", L, b)
          });
      else {
        const L = be(_);
        if (L) {
          const S = new fe();
          ae(f, L, S, r, i), n.mergePropertyMatch(S);
        }
      }
    }
  }
}
function u1(e, t) {
  const n = [];
  let r = -1;
  const i = e.getText(), s = lt(i, !1), a = t && t.collectComments ? [] : void 0;
  function o() {
    for (; ; ) {
      const S = s.scan();
      switch (h(), S) {
        case 12:
        case 13:
          Array.isArray(a) && a.push(W.create(e.positionAt(s.getTokenOffset()), e.positionAt(s.getTokenOffset() + s.getTokenLength())));
          break;
        case 15:
        case 14:
          break;
        default:
          return S;
      }
    }
  }
  function u(S, v, k, M, V = ye.Error) {
    if (n.length === 0 || k !== r) {
      const T = W.create(e.positionAt(k), e.positionAt(M));
      n.push(He.create(T, S, V, v, e.languageId)), r = k;
    }
  }
  function l(S, v, k = void 0, M = [], V = []) {
    let T = s.getTokenOffset(), x = s.getTokenOffset() + s.getTokenLength();
    if (T === x && T > 0) {
      for (T--; T > 0 && /\s/.test(i.charAt(T)); )
        T--;
      x = T + 1;
    }
    if (u(S, v, T, x), k && f(k, !1), M.length + V.length > 0) {
      let A = s.getToken();
      for (; A !== 17; ) {
        if (M.indexOf(A) !== -1) {
          o();
          break;
        } else if (V.indexOf(A) !== -1)
          break;
        A = o();
      }
    }
    return k;
  }
  function h() {
    switch (s.getTokenError()) {
      case 4:
        return l(P("Invalid unicode sequence in string."), G.InvalidUnicode), !0;
      case 5:
        return l(P("Invalid escape character in string."), G.InvalidEscapeCharacter), !0;
      case 3:
        return l(P("Unexpected end of number."), G.UnexpectedEndOfNumber), !0;
      case 1:
        return l(P("Unexpected end of comment."), G.UnexpectedEndOfComment), !0;
      case 2:
        return l(P("Unexpected end of string."), G.UnexpectedEndOfString), !0;
      case 6:
        return l(P("Invalid characters in string. Control characters must be escaped."), G.InvalidCharacter), !0;
    }
    return !1;
  }
  function f(S, v) {
    return S.length = s.getTokenOffset() + s.getTokenLength() - S.offset, v && o(), S;
  }
  function d(S) {
    if (s.getToken() !== 3)
      return;
    const v = new r1(S, s.getTokenOffset());
    o();
    let k = !1;
    for (; s.getToken() !== 4 && s.getToken() !== 17; ) {
      if (s.getToken() === 5) {
        k || l(P("Value expected"), G.ValueExpected);
        const V = s.getTokenOffset();
        if (o(), s.getToken() === 4) {
          k && u(P("Trailing comma"), G.TrailingComma, V, V + 1);
          continue;
        }
      } else k && l(P("Expected comma"), G.CommaExpected);
      const M = b(v);
      M ? v.items.push(M) : l(P("Value expected"), G.ValueExpected, void 0, [], [
        4,
        5
        /* Json.SyntaxKind.CommaToken */
      ]), k = !0;
    }
    return s.getToken() !== 4 ? l(P("Expected comma or closing bracket"), G.CommaOrCloseBacketExpected, v) : f(v, !0);
  }
  const m = new Kn(void 0, 0, 0);
  function g(S, v) {
    const k = new s1(S, s.getTokenOffset(), m);
    let M = w(k);
    if (!M)
      if (s.getToken() === 16) {
        l(P("Property keys must be doublequoted"), G.PropertyKeysMustBeDoublequoted);
        const T = new Kn(k, s.getTokenOffset(), s.getTokenLength());
        T.value = s.getTokenValue(), M = T, o();
      } else
        return;
    if (k.keyNode = M, M.value !== "//") {
      const T = v[M.value];
      T ? (u(P("Duplicate object key"), G.DuplicateKey, k.keyNode.offset, k.keyNode.offset + k.keyNode.length, ye.Warning), Ze(T) && u(P("Duplicate object key"), G.DuplicateKey, T.keyNode.offset, T.keyNode.offset + T.keyNode.length, ye.Warning), v[M.value] = !0) : v[M.value] = k;
    }
    if (s.getToken() === 6)
      k.colonOffset = s.getTokenOffset(), o();
    else if (l(P("Colon expected"), G.ColonExpected), s.getToken() === 10 && e.positionAt(M.offset + M.length).line < e.positionAt(s.getTokenOffset()).line)
      return k.length = M.length, k;
    const V = b(k);
    return V ? (k.valueNode = V, k.length = V.offset + V.length - k.offset, k) : l(P("Value expected"), G.ValueExpected, k, [], [
      2,
      5
      /* Json.SyntaxKind.CommaToken */
    ]);
  }
  function p(S) {
    if (s.getToken() !== 1)
      return;
    const v = new a1(S, s.getTokenOffset()), k = /* @__PURE__ */ Object.create(null);
    o();
    let M = !1;
    for (; s.getToken() !== 2 && s.getToken() !== 17; ) {
      if (s.getToken() === 5) {
        M || l(P("Property expected"), G.PropertyExpected);
        const T = s.getTokenOffset();
        if (o(), s.getToken() === 2) {
          M && u(P("Trailing comma"), G.TrailingComma, T, T + 1);
          continue;
        }
      } else M && l(P("Expected comma"), G.CommaExpected);
      const V = g(v, k);
      V ? v.properties.push(V) : l(P("Property expected"), G.PropertyExpected, void 0, [], [
        2,
        5
        /* Json.SyntaxKind.CommaToken */
      ]), M = !0;
    }
    return s.getToken() !== 2 ? l(P("Expected comma or closing brace"), G.CommaOrCloseBraceExpected, v) : f(v, !0);
  }
  function w(S) {
    if (s.getToken() !== 10)
      return;
    const v = new Kn(S, s.getTokenOffset());
    return v.value = s.getTokenValue(), f(v, !0);
  }
  function y(S) {
    if (s.getToken() !== 11)
      return;
    const v = new i1(S, s.getTokenOffset());
    if (s.getTokenError() === 0) {
      const k = s.getTokenValue();
      try {
        const M = JSON.parse(k);
        if (!ce(M))
          return l(P("Invalid number format."), G.Undefined, v);
        v.value = M;
      } catch {
        return l(P("Invalid number format."), G.Undefined, v);
      }
      v.isInteger = k.indexOf(".") === -1;
    }
    return f(v, !0);
  }
  function N(S) {
    switch (s.getToken()) {
      case 7:
        return f(new n1(S, s.getTokenOffset()), !0);
      case 8:
        return f(new Ya(S, !0, s.getTokenOffset()), !0);
      case 9:
        return f(new Ya(S, !1, s.getTokenOffset()), !0);
      default:
        return;
    }
  }
  function b(S) {
    return d(S) || p(S) || w(S) || y(S) || N(S);
  }
  let _;
  return o() !== 17 && (_ = b(_), _ ? s.getToken() !== 17 && l(P("End of file expected."), G.Undefined) : l(P("Expected a JSON object, array or literal."), G.Undefined)), new Fo(_, n, a);
}
function zr(e, t, n) {
  if (e !== null && typeof e == "object") {
    const r = t + "	";
    if (Array.isArray(e)) {
      if (e.length === 0)
        return "[]";
      let i = `[
`;
      for (let s = 0; s < e.length; s++)
        i += r + zr(e[s], r, n), s < e.length - 1 && (i += ","), i += `
`;
      return i += t + "]", i;
    } else {
      const i = Object.keys(e);
      if (i.length === 0)
        return "{}";
      let s = `{
`;
      for (let a = 0; a < i.length; a++) {
        const o = i[a];
        s += r + JSON.stringify(o) + ": " + zr(e[o], r, n), a < i.length - 1 && (s += ","), s += `
`;
      }
      return s += t + "}", s;
    }
  }
  return n(e);
}
class c1 {
  constructor(t, n = [], r = Promise, i = {}) {
    this.schemaService = t, this.contributions = n, this.promiseConstructor = r, this.clientCapabilities = i;
  }
  doResolve(t) {
    for (let n = this.contributions.length - 1; n >= 0; n--) {
      const r = this.contributions[n].resolveCompletion;
      if (r) {
        const i = r(t);
        if (i)
          return i;
      }
    }
    return this.promiseConstructor.resolve(t);
  }
  doComplete(t, n, r) {
    const i = {
      items: [],
      isIncomplete: !1
    }, s = t.getText(), a = t.offsetAt(n);
    let o = r.getNodeFromOffset(a, !0);
    if (this.isInComment(t, o ? o.offset : 0, a))
      return Promise.resolve(i);
    if (o && a === o.offset + o.length && a > 0) {
      const d = s[a - 1];
      (o.type === "object" && d === "}" || o.type === "array" && d === "]") && (o = o.parent);
    }
    const u = this.getCurrentWord(t, a);
    let l;
    if (o && (o.type === "string" || o.type === "number" || o.type === "boolean" || o.type === "null"))
      l = W.create(t.positionAt(o.offset), t.positionAt(o.offset + o.length));
    else {
      let d = a - u.length;
      d > 0 && s[d - 1] === '"' && d--, l = W.create(t.positionAt(d), n);
    }
    const h = /* @__PURE__ */ new Map(), f = {
      add: (d) => {
        let m = d.label;
        const g = h.get(m);
        if (g)
          g.documentation || (g.documentation = d.documentation), g.detail || (g.detail = d.detail), g.labelDetails || (g.labelDetails = d.labelDetails);
        else {
          if (m = m.replace(/[\n]/g, "↵"), m.length > 60) {
            const p = m.substr(0, 57).trim() + "...";
            h.has(p) || (m = p);
          }
          d.textEdit = $e.replace(l, d.insertText), d.label = m, h.set(m, d), i.items.push(d);
        }
      },
      setAsIncomplete: () => {
        i.isIncomplete = !0;
      },
      error: (d) => {
        console.error(d);
      },
      getNumberOfProposals: () => i.items.length
    };
    return this.schemaService.getSchemaForResource(t.uri, r).then((d) => {
      const m = [];
      let g = !0, p = "", w;
      if (o && o.type === "string") {
        const N = o.parent;
        N && N.type === "property" && N.keyNode === o && (g = !N.valueNode, w = N, p = s.substr(o.offset + 1, o.length - 2), N && (o = N.parent));
      }
      if (o && o.type === "object") {
        if (o.offset === a)
          return i;
        o.properties.forEach((L) => {
          (!w || w !== L) && h.set(L.keyNode.value, Br.create("__"));
        });
        let b = "";
        g && (b = this.evaluateSeparatorAfter(t, t.offsetAt(l.end))), d ? this.getPropertyCompletions(d, r, o, g, b, f) : this.getSchemaLessPropertyCompletions(r, o, p, f);
        const _ = Hr(o);
        this.contributions.forEach((L) => {
          const S = L.collectPropertyCompletions(t.uri, _, u, g, b === "", f);
          S && m.push(S);
        }), !d && u.length > 0 && s.charAt(a - u.length - 1) !== '"' && (f.add({
          kind: xe.Property,
          label: this.getLabelForValue(u),
          insertText: this.getInsertTextForProperty(u, void 0, !1, b),
          insertTextFormat: ie.Snippet,
          documentation: ""
        }), f.setAsIncomplete());
      }
      const y = {};
      return d ? this.getValueCompletions(d, r, o, a, t, f, y) : this.getSchemaLessValueCompletions(r, o, a, t, f), this.contributions.length > 0 && this.getContributedValueCompletions(r, o, a, t, f, m), this.promiseConstructor.all(m).then(() => {
        if (f.getNumberOfProposals() === 0) {
          let N = a;
          o && (o.type === "string" || o.type === "number" || o.type === "boolean" || o.type === "null") && (N = o.offset + o.length);
          const b = this.evaluateSeparatorAfter(t, N);
          this.addFillerValueCompletions(y, b, f);
        }
        return i;
      });
    });
  }
  getPropertyCompletions(t, n, r, i, s, a) {
    n.getMatchingSchemas(t.schema, r.offset).forEach((u) => {
      if (u.node === r && !u.inverted) {
        const l = u.schema.properties;
        l && Object.keys(l).forEach((f) => {
          const d = l[f];
          if (typeof d == "object" && !d.deprecationMessage && !d.doNotSuggest) {
            const m = {
              kind: xe.Property,
              label: f,
              insertText: this.getInsertTextForProperty(f, d, i, s),
              insertTextFormat: ie.Snippet,
              filterText: this.getFilterTextForValue(f),
              documentation: this.fromMarkup(d.markdownDescription) || d.description || ""
            };
            d.suggestSortText !== void 0 && (m.sortText = d.suggestSortText), m.insertText && sn(m.insertText, `$1${s}`) && (m.command = {
              title: "Suggest",
              command: "editor.action.triggerSuggest"
            }), a.add(m);
          }
        });
        const h = u.schema.propertyNames;
        if (typeof h == "object" && !h.deprecationMessage && !h.doNotSuggest) {
          const f = (d, m = void 0) => {
            const g = {
              kind: xe.Property,
              label: d,
              insertText: this.getInsertTextForProperty(d, void 0, i, s),
              insertTextFormat: ie.Snippet,
              filterText: this.getFilterTextForValue(d),
              documentation: m || this.fromMarkup(h.markdownDescription) || h.description || ""
            };
            h.suggestSortText !== void 0 && (g.sortText = h.suggestSortText), g.insertText && sn(g.insertText, `$1${s}`) && (g.command = {
              title: "Suggest",
              command: "editor.action.triggerSuggest"
            }), a.add(g);
          };
          if (h.enum)
            for (let d = 0; d < h.enum.length; d++) {
              let m;
              h.markdownEnumDescriptions && d < h.markdownEnumDescriptions.length ? m = this.fromMarkup(h.markdownEnumDescriptions[d]) : h.enumDescriptions && d < h.enumDescriptions.length && (m = h.enumDescriptions[d]), f(h.enum[d], m);
            }
          h.const && f(h.const);
        }
      }
    });
  }
  getSchemaLessPropertyCompletions(t, n, r, i) {
    const s = (a) => {
      a.properties.forEach((o) => {
        const u = o.keyNode.value;
        i.add({
          kind: xe.Property,
          label: u,
          insertText: this.getInsertTextForValue(u, ""),
          insertTextFormat: ie.Snippet,
          filterText: this.getFilterTextForValue(u),
          documentation: ""
        });
      });
    };
    if (n.parent)
      if (n.parent.type === "property") {
        const a = n.parent.keyNode.value;
        t.visit((o) => (o.type === "property" && o !== n.parent && o.keyNode.value === a && o.valueNode && o.valueNode.type === "object" && s(o.valueNode), !0));
      } else n.parent.type === "array" && n.parent.items.forEach((a) => {
        a.type === "object" && a !== n && s(a);
      });
    else n.type === "object" && i.add({
      kind: xe.Property,
      label: "$schema",
      insertText: this.getInsertTextForProperty("$schema", void 0, !0, ""),
      insertTextFormat: ie.Snippet,
      documentation: "",
      filterText: this.getFilterTextForValue("$schema")
    });
  }
  getSchemaLessValueCompletions(t, n, r, i, s) {
    let a = r;
    if (n && (n.type === "string" || n.type === "number" || n.type === "boolean" || n.type === "null") && (a = n.offset + n.length, n = n.parent), !n) {
      s.add({
        kind: this.getSuggestionKind("object"),
        label: "Empty object",
        insertText: this.getInsertTextForValue({}, ""),
        insertTextFormat: ie.Snippet,
        documentation: ""
      }), s.add({
        kind: this.getSuggestionKind("array"),
        label: "Empty array",
        insertText: this.getInsertTextForValue([], ""),
        insertTextFormat: ie.Snippet,
        documentation: ""
      });
      return;
    }
    const o = this.evaluateSeparatorAfter(i, a), u = (l) => {
      l.parent && !Io(l.parent, r, !0) && s.add({
        kind: this.getSuggestionKind(l.type),
        label: this.getLabelTextForMatchingNode(l, i),
        insertText: this.getInsertTextForMatchingNode(l, i, o),
        insertTextFormat: ie.Snippet,
        documentation: ""
      }), l.type === "boolean" && this.addBooleanValueCompletion(!l.value, o, s);
    };
    if (n.type === "property" && r > (n.colonOffset || 0)) {
      const l = n.valueNode;
      if (l && (r > l.offset + l.length || l.type === "object" || l.type === "array"))
        return;
      const h = n.keyNode.value;
      t.visit((f) => (f.type === "property" && f.keyNode.value === h && f.valueNode && u(f.valueNode), !0)), h === "$schema" && n.parent && !n.parent.parent && this.addDollarSchemaCompletions(o, s);
    }
    if (n.type === "array")
      if (n.parent && n.parent.type === "property") {
        const l = n.parent.keyNode.value;
        t.visit((h) => (h.type === "property" && h.keyNode.value === l && h.valueNode && h.valueNode.type === "array" && h.valueNode.items.forEach(u), !0));
      } else
        n.items.forEach(u);
  }
  getValueCompletions(t, n, r, i, s, a, o) {
    let u = i, l, h;
    if (r && (r.type === "string" || r.type === "number" || r.type === "boolean" || r.type === "null") && (u = r.offset + r.length, h = r, r = r.parent), !r) {
      this.addSchemaValueCompletions(t.schema, "", a, o);
      return;
    }
    if (r.type === "property" && i > (r.colonOffset || 0)) {
      const f = r.valueNode;
      if (f && i > f.offset + f.length)
        return;
      l = r.keyNode.value, r = r.parent;
    }
    if (r && (l !== void 0 || r.type === "array")) {
      const f = this.evaluateSeparatorAfter(s, u), d = n.getMatchingSchemas(t.schema, r.offset, h);
      for (const m of d)
        if (m.node === r && !m.inverted && m.schema) {
          if (r.type === "array" && m.schema.items) {
            let g = a;
            if (m.schema.uniqueItems) {
              const p = /* @__PURE__ */ new Set();
              r.children.forEach((w) => {
                w.type !== "array" && w.type !== "object" && p.add(this.getLabelForValue(ut(w)));
              }), g = {
                ...a,
                add(w) {
                  p.has(w.label) || a.add(w);
                }
              };
            }
            if (Array.isArray(m.schema.items)) {
              const p = this.findItemAtOffset(r, s, i);
              p < m.schema.items.length && this.addSchemaValueCompletions(m.schema.items[p], f, g, o);
            } else
              this.addSchemaValueCompletions(m.schema.items, f, g, o);
          }
          if (l !== void 0) {
            let g = !1;
            if (m.schema.properties) {
              const p = m.schema.properties[l];
              p && (g = !0, this.addSchemaValueCompletions(p, f, a, o));
            }
            if (m.schema.patternProperties && !g)
              for (const p of Object.keys(m.schema.patternProperties)) {
                const w = In(p);
                if (w != null && w.test(l)) {
                  g = !0;
                  const y = m.schema.patternProperties[p];
                  this.addSchemaValueCompletions(y, f, a, o);
                }
              }
            if (m.schema.additionalProperties && !g) {
              const p = m.schema.additionalProperties;
              this.addSchemaValueCompletions(p, f, a, o);
            }
          }
        }
      l === "$schema" && !r.parent && this.addDollarSchemaCompletions(f, a), o.boolean && (this.addBooleanValueCompletion(!0, f, a), this.addBooleanValueCompletion(!1, f, a)), o.null && this.addNullValueCompletion(f, a);
    }
  }
  getContributedValueCompletions(t, n, r, i, s, a) {
    if (!n)
      this.contributions.forEach((o) => {
        const u = o.collectDefaultCompletions(i.uri, s);
        u && a.push(u);
      });
    else if ((n.type === "string" || n.type === "number" || n.type === "boolean" || n.type === "null") && (n = n.parent), n && n.type === "property" && r > (n.colonOffset || 0)) {
      const o = n.keyNode.value, u = n.valueNode;
      if ((!u || r <= u.offset + u.length) && n.parent) {
        const l = Hr(n.parent);
        this.contributions.forEach((h) => {
          const f = h.collectValueCompletions(i.uri, l, o, s);
          f && a.push(f);
        });
      }
    }
  }
  addSchemaValueCompletions(t, n, r, i) {
    typeof t == "object" && (this.addEnumValueCompletions(t, n, r), this.addDefaultValueCompletions(t, n, r), this.collectTypes(t, i), Array.isArray(t.allOf) && t.allOf.forEach((s) => this.addSchemaValueCompletions(s, n, r, i)), Array.isArray(t.anyOf) && t.anyOf.forEach((s) => this.addSchemaValueCompletions(s, n, r, i)), Array.isArray(t.oneOf) && t.oneOf.forEach((s) => this.addSchemaValueCompletions(s, n, r, i)));
  }
  addDefaultValueCompletions(t, n, r, i = 0) {
    let s = !1;
    if (Re(t.default)) {
      let a = t.type, o = t.default;
      for (let l = i; l > 0; l--)
        o = [o], a = "array";
      const u = {
        kind: this.getSuggestionKind(a),
        label: this.getLabelForValue(o),
        insertText: this.getInsertTextForValue(o, n),
        insertTextFormat: ie.Snippet
      };
      this.doesSupportsLabelDetails() ? u.labelDetails = { description: P("Default value") } : u.detail = P("Default value"), r.add(u), s = !0;
    }
    Array.isArray(t.examples) && t.examples.forEach((a) => {
      let o = t.type, u = a;
      for (let l = i; l > 0; l--)
        u = [u], o = "array";
      r.add({
        kind: this.getSuggestionKind(o),
        label: this.getLabelForValue(u),
        insertText: this.getInsertTextForValue(u, n),
        insertTextFormat: ie.Snippet
      }), s = !0;
    }), Array.isArray(t.defaultSnippets) && t.defaultSnippets.forEach((a) => {
      let o = t.type, u = a.body, l = a.label, h, f;
      if (Re(u)) {
        t.type;
        for (let d = i; d > 0; d--)
          u = [u];
        h = this.getInsertTextForSnippetValue(u, n), f = this.getFilterTextForSnippetValue(u), l = l || this.getLabelForSnippetValue(u);
      } else if (typeof a.bodyText == "string") {
        let d = "", m = "", g = "";
        for (let p = i; p > 0; p--)
          d = d + g + `[
`, m = m + `
` + g + "]", g += "	", o = "array";
        h = d + g + a.bodyText.split(`
`).join(`
` + g) + m + n, l = l || h, f = h.replace(/[\n]/g, "");
      } else
        return;
      r.add({
        kind: this.getSuggestionKind(o),
        label: l,
        documentation: this.fromMarkup(a.markdownDescription) || a.description,
        insertText: h,
        insertTextFormat: ie.Snippet,
        filterText: f
      }), s = !0;
    }), !s && typeof t.items == "object" && !Array.isArray(t.items) && i < 5 && this.addDefaultValueCompletions(t.items, n, r, i + 1);
  }
  addEnumValueCompletions(t, n, r) {
    if (Re(t.const) && r.add({
      kind: this.getSuggestionKind(t.type),
      label: this.getLabelForValue(t.const),
      insertText: this.getInsertTextForValue(t.const, n),
      insertTextFormat: ie.Snippet,
      documentation: this.fromMarkup(t.markdownDescription) || t.description
    }), Array.isArray(t.enum))
      for (let i = 0, s = t.enum.length; i < s; i++) {
        const a = t.enum[i];
        let o = this.fromMarkup(t.markdownDescription) || t.description;
        t.markdownEnumDescriptions && i < t.markdownEnumDescriptions.length && this.doesSupportMarkdown() ? o = this.fromMarkup(t.markdownEnumDescriptions[i]) : t.enumDescriptions && i < t.enumDescriptions.length && (o = t.enumDescriptions[i]), r.add({
          kind: this.getSuggestionKind(t.type),
          label: this.getLabelForValue(a),
          insertText: this.getInsertTextForValue(a, n),
          insertTextFormat: ie.Snippet,
          documentation: o
        });
      }
  }
  collectTypes(t, n) {
    if (Array.isArray(t.enum) || Re(t.const))
      return;
    const r = t.type;
    Array.isArray(r) ? r.forEach((i) => n[i] = !0) : r && (n[r] = !0);
  }
  addFillerValueCompletions(t, n, r) {
    t.object && r.add({
      kind: this.getSuggestionKind("object"),
      label: "{}",
      insertText: this.getInsertTextForGuessedValue({}, n),
      insertTextFormat: ie.Snippet,
      detail: P("New object"),
      documentation: ""
    }), t.array && r.add({
      kind: this.getSuggestionKind("array"),
      label: "[]",
      insertText: this.getInsertTextForGuessedValue([], n),
      insertTextFormat: ie.Snippet,
      detail: P("New array"),
      documentation: ""
    });
  }
  addBooleanValueCompletion(t, n, r) {
    r.add({
      kind: this.getSuggestionKind("boolean"),
      label: t ? "true" : "false",
      insertText: this.getInsertTextForValue(t, n),
      insertTextFormat: ie.Snippet,
      documentation: ""
    });
  }
  addNullValueCompletion(t, n) {
    n.add({
      kind: this.getSuggestionKind("null"),
      label: "null",
      insertText: "null" + t,
      insertTextFormat: ie.Snippet,
      documentation: ""
    });
  }
  addDollarSchemaCompletions(t, n) {
    this.schemaService.getRegisteredSchemaIds((i) => i === "http" || i === "https").forEach((i) => {
      i.startsWith("http://json-schema.org/draft-") && (i = i + "#"), n.add({
        kind: xe.Module,
        label: this.getLabelForValue(i),
        filterText: this.getFilterTextForValue(i),
        insertText: this.getInsertTextForValue(i, t),
        insertTextFormat: ie.Snippet,
        documentation: ""
      });
    });
  }
  getLabelForValue(t) {
    return JSON.stringify(t);
  }
  getValueFromLabel(t) {
    return JSON.parse(t);
  }
  getFilterTextForValue(t) {
    return JSON.stringify(t);
  }
  getFilterTextForSnippetValue(t) {
    return JSON.stringify(t).replace(/\$\{\d+:([^}]+)\}|\$\d+/g, "$1");
  }
  getLabelForSnippetValue(t) {
    return JSON.stringify(t).replace(/\$\{\d+:([^}]+)\}|\$\d+/g, "$1");
  }
  getInsertTextForPlainText(t) {
    return t.replace(/[\\\$\}]/g, "\\$&");
  }
  getInsertTextForValue(t, n) {
    const r = JSON.stringify(t, null, "	");
    return r === "{}" ? "{$1}" + n : r === "[]" ? "[$1]" + n : this.getInsertTextForPlainText(r + n);
  }
  getInsertTextForSnippetValue(t, n) {
    return zr(t, "", (i) => typeof i == "string" && i[0] === "^" ? i.substr(1) : JSON.stringify(i)) + n;
  }
  getInsertTextForGuessedValue(t, n) {
    switch (typeof t) {
      case "object":
        return t === null ? "${1:null}" + n : this.getInsertTextForValue(t, n);
      case "string":
        let r = JSON.stringify(t);
        return r = r.substr(1, r.length - 2), r = this.getInsertTextForPlainText(r), '"${1:' + r + '}"' + n;
      case "number":
      case "boolean":
        return "${1:" + JSON.stringify(t) + "}" + n;
    }
    return this.getInsertTextForValue(t, n);
  }
  getSuggestionKind(t) {
    if (Array.isArray(t)) {
      const n = t;
      t = n.length > 0 ? n[0] : void 0;
    }
    if (!t)
      return xe.Value;
    switch (t) {
      case "string":
        return xe.Value;
      case "object":
        return xe.Module;
      case "property":
        return xe.Property;
      default:
        return xe.Value;
    }
  }
  getLabelTextForMatchingNode(t, n) {
    switch (t.type) {
      case "array":
        return "[]";
      case "object":
        return "{}";
      default:
        return n.getText().substr(t.offset, t.length);
    }
  }
  getInsertTextForMatchingNode(t, n, r) {
    switch (t.type) {
      case "array":
        return this.getInsertTextForValue([], r);
      case "object":
        return this.getInsertTextForValue({}, r);
      default:
        const i = n.getText().substr(t.offset, t.length) + r;
        return this.getInsertTextForPlainText(i);
    }
  }
  getInsertTextForProperty(t, n, r, i) {
    const s = this.getInsertTextForValue(t, "");
    if (!r)
      return s;
    const a = s + ": ";
    let o, u = 0;
    if (n) {
      if (Array.isArray(n.defaultSnippets)) {
        if (n.defaultSnippets.length === 1) {
          const l = n.defaultSnippets[0].body;
          Re(l) && (o = this.getInsertTextForSnippetValue(l, ""));
        }
        u += n.defaultSnippets.length;
      }
      if (n.enum && (!o && n.enum.length === 1 && (o = this.getInsertTextForGuessedValue(n.enum[0], "")), u += n.enum.length), Re(n.const) && (o || (o = this.getInsertTextForGuessedValue(n.const, "")), u++), Re(n.default) && (o || (o = this.getInsertTextForGuessedValue(n.default, "")), u++), Array.isArray(n.examples) && n.examples.length && (o || (o = this.getInsertTextForGuessedValue(n.examples[0], "")), u += n.examples.length), u === 0) {
        let l = Array.isArray(n.type) ? n.type[0] : n.type;
        switch (l || (n.properties ? l = "object" : n.items && (l = "array")), l) {
          case "boolean":
            o = "$1";
            break;
          case "string":
            o = '"$1"';
            break;
          case "object":
            o = "{$1}";
            break;
          case "array":
            o = "[$1]";
            break;
          case "number":
          case "integer":
            o = "${1:0}";
            break;
          case "null":
            o = "${1:null}";
            break;
          default:
            return s;
        }
      }
    }
    return (!o || u > 1) && (o = "$1"), a + o + i;
  }
  getCurrentWord(t, n) {
    let r = n - 1;
    const i = t.getText();
    for (; r >= 0 && ` 	
\r\v":{[,]}`.indexOf(i.charAt(r)) === -1; )
      r--;
    return i.substring(r + 1, n);
  }
  evaluateSeparatorAfter(t, n) {
    const r = lt(t.getText(), !0);
    switch (r.setPosition(n), r.scan()) {
      case 5:
      case 2:
      case 4:
      case 17:
        return "";
      default:
        return ",";
    }
  }
  findItemAtOffset(t, n, r) {
    const i = lt(n.getText(), !0), s = t.items;
    for (let a = s.length - 1; a >= 0; a--) {
      const o = s[a];
      if (r > o.offset + o.length)
        return i.setPosition(o.offset + o.length), i.scan() === 5 && r >= i.getTokenOffset() + i.getTokenLength() ? a + 1 : a;
      if (r >= o.offset)
        return a;
    }
    return 0;
  }
  isInComment(t, n, r) {
    const i = lt(t.getText(), !1);
    i.setPosition(n);
    let s = i.scan();
    for (; s !== 17 && i.getTokenOffset() + i.getTokenLength() < r; )
      s = i.scan();
    return (s === 12 || s === 13) && i.getTokenOffset() <= r;
  }
  fromMarkup(t) {
    if (t && this.doesSupportMarkdown())
      return {
        kind: ft.Markdown,
        value: t
      };
  }
  doesSupportMarkdown() {
    var t, n, r;
    if (!Re(this.supportsMarkdown)) {
      const i = (r = (n = (t = this.clientCapabilities.textDocument) == null ? void 0 : t.completion) == null ? void 0 : n.completionItem) == null ? void 0 : r.documentationFormat;
      this.supportsMarkdown = Array.isArray(i) && i.indexOf(ft.Markdown) !== -1;
    }
    return this.supportsMarkdown;
  }
  doesSupportsCommitCharacters() {
    var t, n, r;
    return Re(this.supportsCommitCharacters) || (this.labelDetailsSupport = (r = (n = (t = this.clientCapabilities.textDocument) == null ? void 0 : t.completion) == null ? void 0 : n.completionItem) == null ? void 0 : r.commitCharactersSupport), this.supportsCommitCharacters;
  }
  doesSupportsLabelDetails() {
    var t, n, r;
    return Re(this.labelDetailsSupport) || (this.labelDetailsSupport = (r = (n = (t = this.clientCapabilities.textDocument) == null ? void 0 : t.completion) == null ? void 0 : n.completionItem) == null ? void 0 : r.labelDetailsSupport), this.labelDetailsSupport;
  }
}
class f1 {
  constructor(t, n = [], r) {
    this.schemaService = t, this.contributions = n, this.promise = r || Promise;
  }
  doHover(t, n, r) {
    const i = t.offsetAt(n);
    let s = r.getNodeFromOffset(i);
    if (!s || (s.type === "object" || s.type === "array") && i > s.offset + 1 && i < s.offset + s.length - 1)
      return this.promise.resolve(null);
    const a = s;
    if (s.type === "string") {
      const h = s.parent;
      if (h && h.type === "property" && h.keyNode === s && (s = h.valueNode, !s))
        return this.promise.resolve(null);
    }
    const o = W.create(t.positionAt(a.offset), t.positionAt(a.offset + a.length)), u = (h) => ({
      contents: h,
      range: o
    }), l = Hr(s);
    for (let h = this.contributions.length - 1; h >= 0; h--) {
      const d = this.contributions[h].getInfoContribution(t.uri, l);
      if (d)
        return d.then((m) => u(m));
    }
    return this.schemaService.getSchemaForResource(t.uri, r).then((h) => {
      if (h && s) {
        const f = r.getMatchingSchemas(h.schema, s.offset);
        let d, m, g, p;
        f.every((y) => {
          if (y.node === s && !y.inverted && y.schema && (d = d || y.schema.title, m = m || y.schema.markdownDescription || er(y.schema.description), y.schema.enum)) {
            const N = y.schema.enum.indexOf(ut(s));
            y.schema.markdownEnumDescriptions ? g = y.schema.markdownEnumDescriptions[N] : y.schema.enumDescriptions && (g = er(y.schema.enumDescriptions[N])), g && (p = y.schema.enum[N], typeof p != "string" && (p = JSON.stringify(p)));
          }
          return !0;
        });
        let w = "";
        return d && (w = er(d)), m && (w.length > 0 && (w += `

`), w += m), g && (w.length > 0 && (w += `

`), w += `\`${h1(p)}\`: ${g}`), u([w]);
      }
      return null;
    });
  }
}
function er(e) {
  if (e)
    return e.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, `$1

$3`).replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}
function h1(e) {
  return e.indexOf("`") !== -1 ? "`` " + e + " ``" : e;
}
class d1 {
  constructor(t, n) {
    this.jsonSchemaService = t, this.promise = n, this.validationEnabled = !0;
  }
  configure(t) {
    t && (this.validationEnabled = t.validate !== !1, this.commentSeverity = t.allowComments ? void 0 : ye.Error);
  }
  doValidation(t, n, r, i) {
    if (!this.validationEnabled)
      return this.promise.resolve([]);
    const s = [], a = {}, o = (l) => {
      const h = l.range.start.line + " " + l.range.start.character + " " + l.message;
      a[h] || (a[h] = !0, s.push(l));
    }, u = (l) => {
      let h = r != null && r.trailingCommas ? gn(r.trailingCommas) : ye.Error, f = r != null && r.comments ? gn(r.comments) : this.commentSeverity, d = r != null && r.schemaValidation ? gn(r.schemaValidation) : ye.Warning, m = r != null && r.schemaRequest ? gn(r.schemaRequest) : ye.Warning;
      if (l) {
        const g = (p, w) => {
          if (n.root && m) {
            const y = n.root, N = y.type === "object" ? y.properties[0] : void 0;
            if (N && N.keyNode.value === "$schema") {
              const b = N.valueNode || N, _ = W.create(t.positionAt(b.offset), t.positionAt(b.offset + b.length));
              o(He.create(_, p, m, w));
            } else {
              const b = W.create(t.positionAt(y.offset), t.positionAt(y.offset + 1));
              o(He.create(b, p, m, w));
            }
          }
        };
        if (l.errors.length)
          g(l.errors[0], G.SchemaResolveError);
        else if (d) {
          for (const w of l.warnings)
            g(w, G.SchemaUnsupportedFeature);
          const p = n.validate(t, l.schema, d, r == null ? void 0 : r.schemaDraft);
          p && p.forEach(o);
        }
        Vo(l.schema) && (f = void 0), Do(l.schema) && (h = void 0);
      }
      for (const g of n.syntaxErrors) {
        if (g.code === G.TrailingComma) {
          if (typeof h != "number")
            continue;
          g.severity = h;
        }
        o(g);
      }
      if (typeof f == "number") {
        const g = P("Comments are not permitted in JSON.");
        n.comments.forEach((p) => {
          o(He.create(p, g, f, G.CommentNotPermitted));
        });
      }
      return s;
    };
    if (i) {
      const l = i.id || "schemaservice://untitled/" + g1++;
      return this.jsonSchemaService.registerExternalSchema({ uri: l, schema: i }).getResolvedSchema().then((f) => u(f));
    }
    return this.jsonSchemaService.getSchemaForResource(t.uri, n).then((l) => u(l));
  }
  getLanguageStatus(t, n) {
    return { schemas: this.jsonSchemaService.getSchemaURIsForResource(t.uri, n) };
  }
}
let g1 = 0;
function Vo(e) {
  if (e && typeof e == "object") {
    if (De(e.allowComments))
      return e.allowComments;
    if (e.allOf)
      for (const t of e.allOf) {
        const n = Vo(t);
        if (De(n))
          return n;
      }
  }
}
function Do(e) {
  if (e && typeof e == "object") {
    if (De(e.allowTrailingCommas))
      return e.allowTrailingCommas;
    const t = e;
    if (De(t.allowsTrailingCommas))
      return t.allowsTrailingCommas;
    if (e.allOf)
      for (const n of e.allOf) {
        const r = Do(n);
        if (De(r))
          return r;
      }
  }
}
function gn(e) {
  switch (e) {
    case "error":
      return ye.Error;
    case "warning":
      return ye.Warning;
    case "ignore":
      return;
  }
}
const no = 48, m1 = 57, p1 = 65, mn = 97, b1 = 102;
function ne(e) {
  return e < no ? 0 : e <= m1 ? e - no : (e < mn && (e += mn - p1), e >= mn && e <= b1 ? e - mn + 10 : 0);
}
function w1(e) {
  if (e[0] === "#")
    switch (e.length) {
      case 4:
        return {
          red: ne(e.charCodeAt(1)) * 17 / 255,
          green: ne(e.charCodeAt(2)) * 17 / 255,
          blue: ne(e.charCodeAt(3)) * 17 / 255,
          alpha: 1
        };
      case 5:
        return {
          red: ne(e.charCodeAt(1)) * 17 / 255,
          green: ne(e.charCodeAt(2)) * 17 / 255,
          blue: ne(e.charCodeAt(3)) * 17 / 255,
          alpha: ne(e.charCodeAt(4)) * 17 / 255
        };
      case 7:
        return {
          red: (ne(e.charCodeAt(1)) * 16 + ne(e.charCodeAt(2))) / 255,
          green: (ne(e.charCodeAt(3)) * 16 + ne(e.charCodeAt(4))) / 255,
          blue: (ne(e.charCodeAt(5)) * 16 + ne(e.charCodeAt(6))) / 255,
          alpha: 1
        };
      case 9:
        return {
          red: (ne(e.charCodeAt(1)) * 16 + ne(e.charCodeAt(2))) / 255,
          green: (ne(e.charCodeAt(3)) * 16 + ne(e.charCodeAt(4))) / 255,
          blue: (ne(e.charCodeAt(5)) * 16 + ne(e.charCodeAt(6))) / 255,
          alpha: (ne(e.charCodeAt(7)) * 16 + ne(e.charCodeAt(8))) / 255
        };
    }
}
class x1 {
  constructor(t) {
    this.schemaService = t;
  }
  findDocumentSymbols(t, n, r = { resultLimit: Number.MAX_VALUE }) {
    const i = n.root;
    if (!i)
      return [];
    let s = r.resultLimit || Number.MAX_VALUE;
    const a = t.uri;
    if ((a === "vscode://defaultsettings/keybindings.json" || sn(a.toLowerCase(), "/user/keybindings.json")) && i.type === "array") {
      const d = [];
      for (const m of i.items)
        if (m.type === "object") {
          for (const g of m.properties)
            if (g.keyNode.value === "key" && g.valueNode) {
              const p = Vt.create(t.uri, Ge(t, m));
              if (d.push({ name: ro(g.valueNode), kind: Ce.Function, location: p }), s--, s <= 0)
                return r && r.onResultLimitExceeded && r.onResultLimitExceeded(a), d;
            }
        }
      return d;
    }
    const o = [
      { node: i, containerName: "" }
    ];
    let u = 0, l = !1;
    const h = [], f = (d, m) => {
      d.type === "array" ? d.items.forEach((g) => {
        g && o.push({ node: g, containerName: m });
      }) : d.type === "object" && d.properties.forEach((g) => {
        const p = g.valueNode;
        if (p)
          if (s > 0) {
            s--;
            const w = Vt.create(t.uri, Ge(t, g)), y = m ? m + "." + g.keyNode.value : g.keyNode.value;
            h.push({ name: this.getKeyLabel(g), kind: this.getSymbolKind(p.type), location: w, containerName: m }), o.push({ node: p, containerName: y });
          } else
            l = !0;
      });
    };
    for (; u < o.length; ) {
      const d = o[u++];
      f(d.node, d.containerName);
    }
    return l && r && r.onResultLimitExceeded && r.onResultLimitExceeded(a), h;
  }
  findDocumentSymbols2(t, n, r = { resultLimit: Number.MAX_VALUE }) {
    const i = n.root;
    if (!i)
      return [];
    let s = r.resultLimit || Number.MAX_VALUE;
    const a = t.uri;
    if ((a === "vscode://defaultsettings/keybindings.json" || sn(a.toLowerCase(), "/user/keybindings.json")) && i.type === "array") {
      const d = [];
      for (const m of i.items)
        if (m.type === "object") {
          for (const g of m.properties)
            if (g.keyNode.value === "key" && g.valueNode) {
              const p = Ge(t, m), w = Ge(t, g.keyNode);
              if (d.push({ name: ro(g.valueNode), kind: Ce.Function, range: p, selectionRange: w }), s--, s <= 0)
                return r && r.onResultLimitExceeded && r.onResultLimitExceeded(a), d;
            }
        }
      return d;
    }
    const o = [], u = [
      { node: i, result: o }
    ];
    let l = 0, h = !1;
    const f = (d, m) => {
      d.type === "array" ? d.items.forEach((g, p) => {
        if (g)
          if (s > 0) {
            s--;
            const w = Ge(t, g), y = w, b = { name: String(p), kind: this.getSymbolKind(g.type), range: w, selectionRange: y, children: [] };
            m.push(b), u.push({ result: b.children, node: g });
          } else
            h = !0;
      }) : d.type === "object" && d.properties.forEach((g) => {
        const p = g.valueNode;
        if (p)
          if (s > 0) {
            s--;
            const w = Ge(t, g), y = Ge(t, g.keyNode), N = [], b = { name: this.getKeyLabel(g), kind: this.getSymbolKind(p.type), range: w, selectionRange: y, children: N, detail: this.getDetail(p) };
            m.push(b), u.push({ result: N, node: p });
          } else
            h = !0;
      });
    };
    for (; l < u.length; ) {
      const d = u[l++];
      f(d.node, d.result);
    }
    return h && r && r.onResultLimitExceeded && r.onResultLimitExceeded(a), o;
  }
  getSymbolKind(t) {
    switch (t) {
      case "object":
        return Ce.Module;
      case "string":
        return Ce.String;
      case "number":
        return Ce.Number;
      case "array":
        return Ce.Array;
      case "boolean":
        return Ce.Boolean;
      default:
        return Ce.Variable;
    }
  }
  getKeyLabel(t) {
    let n = t.keyNode.value;
    return n && (n = n.replace(/[\n]/g, "↵")), n && n.trim() ? n : `"${n}"`;
  }
  getDetail(t) {
    if (t) {
      if (t.type === "boolean" || t.type === "number" || t.type === "null" || t.type === "string")
        return String(t.value);
      if (t.type === "array")
        return t.children.length ? void 0 : "[]";
      if (t.type === "object")
        return t.children.length ? void 0 : "{}";
    }
  }
  findDocumentColors(t, n, r) {
    return this.schemaService.getSchemaForResource(t.uri, n).then((i) => {
      const s = [];
      if (i) {
        let a = r && typeof r.resultLimit == "number" ? r.resultLimit : Number.MAX_VALUE;
        const o = n.getMatchingSchemas(i.schema), u = {};
        for (const l of o)
          if (!l.inverted && l.schema && (l.schema.format === "color" || l.schema.format === "color-hex") && l.node && l.node.type === "string") {
            const h = String(l.node.offset);
            if (!u[h]) {
              const f = w1(ut(l.node));
              if (f) {
                const d = Ge(t, l.node);
                s.push({ color: f, range: d });
              }
              if (u[h] = !0, a--, a <= 0)
                return r && r.onResultLimitExceeded && r.onResultLimitExceeded(t.uri), s;
            }
          }
      }
      return s;
    });
  }
  getColorPresentations(t, n, r, i) {
    const s = [], a = Math.round(r.red * 255), o = Math.round(r.green * 255), u = Math.round(r.blue * 255);
    function l(f) {
      const d = f.toString(16);
      return d.length !== 2 ? "0" + d : d;
    }
    let h;
    return r.alpha === 1 ? h = `#${l(a)}${l(o)}${l(u)}` : h = `#${l(a)}${l(o)}${l(u)}${l(Math.round(r.alpha * 255))}`, s.push({ label: h, textEdit: $e.replace(i, JSON.stringify(h)) }), s;
  }
}
function Ge(e, t) {
  return W.create(e.positionAt(t.offset), e.positionAt(t.offset + t.length));
}
function ro(e) {
  return ut(e) || P("<empty>");
}
const Gr = {
  schemaAssociations: [],
  schemas: {
    // bundle the schema-schema to include (localized) descriptions
    "http://json-schema.org/draft-04/schema#": {
      $schema: "http://json-schema.org/draft-04/schema#",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#"
          }
        },
        positiveInteger: {
          type: "integer",
          minimum: 0
        },
        positiveIntegerDefault0: {
          allOf: [
            {
              $ref: "#/definitions/positiveInteger"
            },
            {
              default: 0
            }
          ]
        },
        simpleTypes: {
          type: "string",
          enum: [
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string"
          ]
        },
        stringArray: {
          type: "array",
          items: {
            type: "string"
          },
          minItems: 1,
          uniqueItems: !0
        }
      },
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uri"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: {},
        multipleOf: {
          type: "number",
          minimum: 0,
          exclusiveMinimum: !0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "boolean",
          default: !1
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "boolean",
          default: !1
        },
        maxLength: {
          allOf: [
            {
              $ref: "#/definitions/positiveInteger"
            }
          ]
        },
        minLength: {
          allOf: [
            {
              $ref: "#/definitions/positiveIntegerDefault0"
            }
          ]
        },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: {
          anyOf: [
            {
              type: "boolean"
            },
            {
              $ref: "#"
            }
          ],
          default: {}
        },
        items: {
          anyOf: [
            {
              $ref: "#"
            },
            {
              $ref: "#/definitions/schemaArray"
            }
          ],
          default: {}
        },
        maxItems: {
          allOf: [
            {
              $ref: "#/definitions/positiveInteger"
            }
          ]
        },
        minItems: {
          allOf: [
            {
              $ref: "#/definitions/positiveIntegerDefault0"
            }
          ]
        },
        uniqueItems: {
          type: "boolean",
          default: !1
        },
        maxProperties: {
          allOf: [
            {
              $ref: "#/definitions/positiveInteger"
            }
          ]
        },
        minProperties: {
          allOf: [
            {
              $ref: "#/definitions/positiveIntegerDefault0"
            }
          ]
        },
        required: {
          allOf: [
            {
              $ref: "#/definitions/stringArray"
            }
          ]
        },
        additionalProperties: {
          anyOf: [
            {
              type: "boolean"
            },
            {
              $ref: "#"
            }
          ],
          default: {}
        },
        definitions: {
          type: "object",
          additionalProperties: {
            $ref: "#"
          },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: {
            $ref: "#"
          },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: {
            $ref: "#"
          },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [
              {
                $ref: "#"
              },
              {
                $ref: "#/definitions/stringArray"
              }
            ]
          }
        },
        enum: {
          type: "array",
          minItems: 1,
          uniqueItems: !0
        },
        type: {
          anyOf: [
            {
              $ref: "#/definitions/simpleTypes"
            },
            {
              type: "array",
              items: {
                $ref: "#/definitions/simpleTypes"
              },
              minItems: 1,
              uniqueItems: !0
            }
          ]
        },
        format: {
          anyOf: [
            {
              type: "string",
              enum: [
                "date-time",
                "uri",
                "email",
                "hostname",
                "ipv4",
                "ipv6",
                "regex"
              ]
            },
            {
              type: "string"
            }
          ]
        },
        allOf: {
          allOf: [
            {
              $ref: "#/definitions/schemaArray"
            }
          ]
        },
        anyOf: {
          allOf: [
            {
              $ref: "#/definitions/schemaArray"
            }
          ]
        },
        oneOf: {
          allOf: [
            {
              $ref: "#/definitions/schemaArray"
            }
          ]
        },
        not: {
          allOf: [
            {
              $ref: "#"
            }
          ]
        }
      },
      dependencies: {
        exclusiveMaximum: [
          "maximum"
        ],
        exclusiveMinimum: [
          "minimum"
        ]
      },
      default: {}
    },
    "http://json-schema.org/draft-07/schema#": {
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [
            { $ref: "#/definitions/nonNegativeInteger" },
            { default: 0 }
          ]
        },
        simpleTypes: {
          enum: [
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string"
          ]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: !0,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: !0,
        readOnly: {
          type: "boolean",
          default: !1
        },
        examples: {
          type: "array",
          items: !0
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [
            { $ref: "#" },
            { $ref: "#/definitions/schemaArray" }
          ],
          default: !0
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: !1
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { $ref: "#" },
              { $ref: "#/definitions/stringArray" }
            ]
          }
        },
        propertyNames: { $ref: "#" },
        const: !0,
        enum: {
          type: "array",
          items: !0,
          minItems: 1,
          uniqueItems: !0
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: !0
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: !0
    }
  }
}, v1 = {
  id: P("A unique identifier for the schema."),
  $schema: P("The schema to verify this document against."),
  title: P("A descriptive title of the element."),
  description: P("A long description of the element. Used in hover menus and suggestions."),
  default: P("A default value. Used by suggestions."),
  multipleOf: P("A number that should cleanly divide the current value (i.e. have no remainder)."),
  maximum: P("The maximum numerical value, inclusive by default."),
  exclusiveMaximum: P("Makes the maximum property exclusive."),
  minimum: P("The minimum numerical value, inclusive by default."),
  exclusiveMinimum: P("Makes the minimum property exclusive."),
  maxLength: P("The maximum length of a string."),
  minLength: P("The minimum length of a string."),
  pattern: P("A regular expression to match the string against. It is not implicitly anchored."),
  additionalItems: P("For arrays, only when items is set as an array. If it is a schema, then this schema validates items after the ones specified by the items array. If it is false, then additional items will cause validation to fail."),
  items: P("For arrays. Can either be a schema to validate every element against or an array of schemas to validate each item against in order (the first schema will validate the first element, the second schema will validate the second element, and so on."),
  maxItems: P("The maximum number of items that can be inside an array. Inclusive."),
  minItems: P("The minimum number of items that can be inside an array. Inclusive."),
  uniqueItems: P("If all of the items in the array must be unique. Defaults to false."),
  maxProperties: P("The maximum number of properties an object can have. Inclusive."),
  minProperties: P("The minimum number of properties an object can have. Inclusive."),
  required: P("An array of strings that lists the names of all properties required on this object."),
  additionalProperties: P("Either a schema or a boolean. If a schema, then used to validate all properties not matched by 'properties' or 'patternProperties'. If false, then any properties not matched by either will cause this schema to fail."),
  definitions: P("Not used for validation. Place subschemas here that you wish to reference inline with $ref."),
  properties: P("A map of property names to schemas for each property."),
  patternProperties: P("A map of regular expressions on property names to schemas for matching properties."),
  dependencies: P("A map of property names to either an array of property names or a schema. An array of property names means the property named in the key depends on the properties in the array being present in the object in order to be valid. If the value is a schema, then the schema is only applied to the object if the property in the key exists on the object."),
  enum: P("The set of literal values that are valid."),
  type: P("Either a string of one of the basic schema types (number, integer, null, array, object, boolean, string) or an array of strings specifying a subset of those types."),
  format: P("Describes the format expected for the value."),
  allOf: P("An array of schemas, all of which must match."),
  anyOf: P("An array of schemas, where at least one must match."),
  oneOf: P("An array of schemas, exactly one of which must match."),
  not: P("A schema which must not match."),
  $id: P("A unique identifier for the schema."),
  $ref: P("Reference a definition hosted on any location."),
  $comment: P("Comments from schema authors to readers or maintainers of the schema."),
  readOnly: P("Indicates that the value of the instance is managed exclusively by the owning authority."),
  examples: P("Sample JSON values associated with a particular schema, for the purpose of illustrating usage."),
  contains: P('An array instance is valid against "contains" if at least one of its elements is valid against the given schema.'),
  propertyNames: P("If the instance is an object, this keyword validates if every property name in the instance validates against the provided schema."),
  const: P("An instance validates successfully against this keyword if its value is equal to the value of the keyword."),
  contentMediaType: P("Describes the media type of a string property."),
  contentEncoding: P("Describes the content encoding of a string property."),
  if: P('The validation outcome of the "if" subschema controls which of the "then" or "else" keywords are evaluated.'),
  then: P('The "if" subschema is used for validation when the "if" subschema succeeds.'),
  else: P('The "else" subschema is used for validation when the "if" subschema fails.')
};
for (const e in Gr.schemas) {
  const t = Gr.schemas[e];
  for (const n in t.properties) {
    let r = t.properties[n];
    typeof r == "boolean" && (r = t.properties[n] = {});
    const i = v1[n];
    i && (r.description = i);
  }
}
var Oo;
(() => {
  var e = { 470: (i) => {
    function s(u) {
      if (typeof u != "string") throw new TypeError("Path must be a string. Received " + JSON.stringify(u));
    }
    function a(u, l) {
      for (var h, f = "", d = 0, m = -1, g = 0, p = 0; p <= u.length; ++p) {
        if (p < u.length) h = u.charCodeAt(p);
        else {
          if (h === 47) break;
          h = 47;
        }
        if (h === 47) {
          if (!(m === p - 1 || g === 1)) if (m !== p - 1 && g === 2) {
            if (f.length < 2 || d !== 2 || f.charCodeAt(f.length - 1) !== 46 || f.charCodeAt(f.length - 2) !== 46) {
              if (f.length > 2) {
                var w = f.lastIndexOf("/");
                if (w !== f.length - 1) {
                  w === -1 ? (f = "", d = 0) : d = (f = f.slice(0, w)).length - 1 - f.lastIndexOf("/"), m = p, g = 0;
                  continue;
                }
              } else if (f.length === 2 || f.length === 1) {
                f = "", d = 0, m = p, g = 0;
                continue;
              }
            }
            l && (f.length > 0 ? f += "/.." : f = "..", d = 2);
          } else f.length > 0 ? f += "/" + u.slice(m + 1, p) : f = u.slice(m + 1, p), d = p - m - 1;
          m = p, g = 0;
        } else h === 46 && g !== -1 ? ++g : g = -1;
      }
      return f;
    }
    var o = { resolve: function() {
      for (var u, l = "", h = !1, f = arguments.length - 1; f >= -1 && !h; f--) {
        var d;
        f >= 0 ? d = arguments[f] : (u === void 0 && (u = process.cwd()), d = u), s(d), d.length !== 0 && (l = d + "/" + l, h = d.charCodeAt(0) === 47);
      }
      return l = a(l, !h), h ? l.length > 0 ? "/" + l : "/" : l.length > 0 ? l : ".";
    }, normalize: function(u) {
      if (s(u), u.length === 0) return ".";
      var l = u.charCodeAt(0) === 47, h = u.charCodeAt(u.length - 1) === 47;
      return (u = a(u, !l)).length !== 0 || l || (u = "."), u.length > 0 && h && (u += "/"), l ? "/" + u : u;
    }, isAbsolute: function(u) {
      return s(u), u.length > 0 && u.charCodeAt(0) === 47;
    }, join: function() {
      if (arguments.length === 0) return ".";
      for (var u, l = 0; l < arguments.length; ++l) {
        var h = arguments[l];
        s(h), h.length > 0 && (u === void 0 ? u = h : u += "/" + h);
      }
      return u === void 0 ? "." : o.normalize(u);
    }, relative: function(u, l) {
      if (s(u), s(l), u === l || (u = o.resolve(u)) === (l = o.resolve(l))) return "";
      for (var h = 1; h < u.length && u.charCodeAt(h) === 47; ++h) ;
      for (var f = u.length, d = f - h, m = 1; m < l.length && l.charCodeAt(m) === 47; ++m) ;
      for (var g = l.length - m, p = d < g ? d : g, w = -1, y = 0; y <= p; ++y) {
        if (y === p) {
          if (g > p) {
            if (l.charCodeAt(m + y) === 47) return l.slice(m + y + 1);
            if (y === 0) return l.slice(m + y);
          } else d > p && (u.charCodeAt(h + y) === 47 ? w = y : y === 0 && (w = 0));
          break;
        }
        var N = u.charCodeAt(h + y);
        if (N !== l.charCodeAt(m + y)) break;
        N === 47 && (w = y);
      }
      var b = "";
      for (y = h + w + 1; y <= f; ++y) y !== f && u.charCodeAt(y) !== 47 || (b.length === 0 ? b += ".." : b += "/..");
      return b.length > 0 ? b + l.slice(m + w) : (m += w, l.charCodeAt(m) === 47 && ++m, l.slice(m));
    }, _makeLong: function(u) {
      return u;
    }, dirname: function(u) {
      if (s(u), u.length === 0) return ".";
      for (var l = u.charCodeAt(0), h = l === 47, f = -1, d = !0, m = u.length - 1; m >= 1; --m) if ((l = u.charCodeAt(m)) === 47) {
        if (!d) {
          f = m;
          break;
        }
      } else d = !1;
      return f === -1 ? h ? "/" : "." : h && f === 1 ? "//" : u.slice(0, f);
    }, basename: function(u, l) {
      if (l !== void 0 && typeof l != "string") throw new TypeError('"ext" argument must be a string');
      s(u);
      var h, f = 0, d = -1, m = !0;
      if (l !== void 0 && l.length > 0 && l.length <= u.length) {
        if (l.length === u.length && l === u) return "";
        var g = l.length - 1, p = -1;
        for (h = u.length - 1; h >= 0; --h) {
          var w = u.charCodeAt(h);
          if (w === 47) {
            if (!m) {
              f = h + 1;
              break;
            }
          } else p === -1 && (m = !1, p = h + 1), g >= 0 && (w === l.charCodeAt(g) ? --g == -1 && (d = h) : (g = -1, d = p));
        }
        return f === d ? d = p : d === -1 && (d = u.length), u.slice(f, d);
      }
      for (h = u.length - 1; h >= 0; --h) if (u.charCodeAt(h) === 47) {
        if (!m) {
          f = h + 1;
          break;
        }
      } else d === -1 && (m = !1, d = h + 1);
      return d === -1 ? "" : u.slice(f, d);
    }, extname: function(u) {
      s(u);
      for (var l = -1, h = 0, f = -1, d = !0, m = 0, g = u.length - 1; g >= 0; --g) {
        var p = u.charCodeAt(g);
        if (p !== 47) f === -1 && (d = !1, f = g + 1), p === 46 ? l === -1 ? l = g : m !== 1 && (m = 1) : l !== -1 && (m = -1);
        else if (!d) {
          h = g + 1;
          break;
        }
      }
      return l === -1 || f === -1 || m === 0 || m === 1 && l === f - 1 && l === h + 1 ? "" : u.slice(l, f);
    }, format: function(u) {
      if (u === null || typeof u != "object") throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof u);
      return function(l, h) {
        var f = h.dir || h.root, d = h.base || (h.name || "") + (h.ext || "");
        return f ? f === h.root ? f + d : f + "/" + d : d;
      }(0, u);
    }, parse: function(u) {
      s(u);
      var l = { root: "", dir: "", base: "", ext: "", name: "" };
      if (u.length === 0) return l;
      var h, f = u.charCodeAt(0), d = f === 47;
      d ? (l.root = "/", h = 1) : h = 0;
      for (var m = -1, g = 0, p = -1, w = !0, y = u.length - 1, N = 0; y >= h; --y) if ((f = u.charCodeAt(y)) !== 47) p === -1 && (w = !1, p = y + 1), f === 46 ? m === -1 ? m = y : N !== 1 && (N = 1) : m !== -1 && (N = -1);
      else if (!w) {
        g = y + 1;
        break;
      }
      return m === -1 || p === -1 || N === 0 || N === 1 && m === p - 1 && m === g + 1 ? p !== -1 && (l.base = l.name = g === 0 && d ? u.slice(1, p) : u.slice(g, p)) : (g === 0 && d ? (l.name = u.slice(1, m), l.base = u.slice(1, p)) : (l.name = u.slice(g, m), l.base = u.slice(g, p)), l.ext = u.slice(m, p)), g > 0 ? l.dir = u.slice(0, g - 1) : d && (l.dir = "/"), l;
    }, sep: "/", delimiter: ":", win32: null, posix: null };
    o.posix = o, i.exports = o;
  } }, t = {};
  function n(i) {
    var s = t[i];
    if (s !== void 0) return s.exports;
    var a = t[i] = { exports: {} };
    return e[i](a, a.exports, n), a.exports;
  }
  n.d = (i, s) => {
    for (var a in s) n.o(s, a) && !n.o(i, a) && Object.defineProperty(i, a, { enumerable: !0, get: s[a] });
  }, n.o = (i, s) => Object.prototype.hasOwnProperty.call(i, s), n.r = (i) => {
    typeof Symbol < "u" && Symbol.toStringTag && Object.defineProperty(i, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(i, "__esModule", { value: !0 });
  };
  var r = {};
  (() => {
    let i;
    n.r(r), n.d(r, { URI: () => d, Utils: () => V }), typeof process == "object" ? i = process.platform === "win32" : typeof navigator == "object" && (i = navigator.userAgent.indexOf("Windows") >= 0);
    const s = /^\w[\w\d+.-]*$/, a = /^\//, o = /^\/\//;
    function u(T, x) {
      if (!T.scheme && x) throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${T.authority}", path: "${T.path}", query: "${T.query}", fragment: "${T.fragment}"}`);
      if (T.scheme && !s.test(T.scheme)) throw new Error("[UriError]: Scheme contains illegal characters.");
      if (T.path) {
        if (T.authority) {
          if (!a.test(T.path)) throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
        } else if (o.test(T.path)) throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
      }
    }
    const l = "", h = "/", f = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
    class d {
      constructor(x, A, C, I, F, D = !1) {
        ze(this, "scheme");
        ze(this, "authority");
        ze(this, "path");
        ze(this, "query");
        ze(this, "fragment");
        typeof x == "object" ? (this.scheme = x.scheme || l, this.authority = x.authority || l, this.path = x.path || l, this.query = x.query || l, this.fragment = x.fragment || l) : (this.scheme = /* @__PURE__ */ function(B, X) {
          return B || X ? B : "file";
        }(x, D), this.authority = A || l, this.path = function(B, X) {
          switch (B) {
            case "https":
            case "http":
            case "file":
              X ? X[0] !== h && (X = h + X) : X = h;
          }
          return X;
        }(this.scheme, C || l), this.query = I || l, this.fragment = F || l, u(this, D));
      }
      static isUri(x) {
        return x instanceof d || !!x && typeof x.authority == "string" && typeof x.fragment == "string" && typeof x.path == "string" && typeof x.query == "string" && typeof x.scheme == "string" && typeof x.fsPath == "string" && typeof x.with == "function" && typeof x.toString == "function";
      }
      get fsPath() {
        return N(this);
      }
      with(x) {
        if (!x) return this;
        let { scheme: A, authority: C, path: I, query: F, fragment: D } = x;
        return A === void 0 ? A = this.scheme : A === null && (A = l), C === void 0 ? C = this.authority : C === null && (C = l), I === void 0 ? I = this.path : I === null && (I = l), F === void 0 ? F = this.query : F === null && (F = l), D === void 0 ? D = this.fragment : D === null && (D = l), A === this.scheme && C === this.authority && I === this.path && F === this.query && D === this.fragment ? this : new g(A, C, I, F, D);
      }
      static parse(x, A = !1) {
        const C = f.exec(x);
        return C ? new g(C[2] || l, S(C[4] || l), S(C[5] || l), S(C[7] || l), S(C[9] || l), A) : new g(l, l, l, l, l);
      }
      static file(x) {
        let A = l;
        if (i && (x = x.replace(/\\/g, h)), x[0] === h && x[1] === h) {
          const C = x.indexOf(h, 2);
          C === -1 ? (A = x.substring(2), x = h) : (A = x.substring(2, C), x = x.substring(C) || h);
        }
        return new g("file", A, x, l, l);
      }
      static from(x) {
        const A = new g(x.scheme, x.authority, x.path, x.query, x.fragment);
        return u(A, !0), A;
      }
      toString(x = !1) {
        return b(this, x);
      }
      toJSON() {
        return this;
      }
      static revive(x) {
        if (x) {
          if (x instanceof d) return x;
          {
            const A = new g(x);
            return A._formatted = x.external, A._fsPath = x._sep === m ? x.fsPath : null, A;
          }
        }
        return x;
      }
    }
    const m = i ? 1 : void 0;
    class g extends d {
      constructor() {
        super(...arguments);
        ze(this, "_formatted", null);
        ze(this, "_fsPath", null);
      }
      get fsPath() {
        return this._fsPath || (this._fsPath = N(this)), this._fsPath;
      }
      toString(A = !1) {
        return A ? b(this, !0) : (this._formatted || (this._formatted = b(this, !1)), this._formatted);
      }
      toJSON() {
        const A = { $mid: 1 };
        return this._fsPath && (A.fsPath = this._fsPath, A._sep = m), this._formatted && (A.external = this._formatted), this.path && (A.path = this.path), this.scheme && (A.scheme = this.scheme), this.authority && (A.authority = this.authority), this.query && (A.query = this.query), this.fragment && (A.fragment = this.fragment), A;
      }
    }
    const p = { 58: "%3A", 47: "%2F", 63: "%3F", 35: "%23", 91: "%5B", 93: "%5D", 64: "%40", 33: "%21", 36: "%24", 38: "%26", 39: "%27", 40: "%28", 41: "%29", 42: "%2A", 43: "%2B", 44: "%2C", 59: "%3B", 61: "%3D", 32: "%20" };
    function w(T, x, A) {
      let C, I = -1;
      for (let F = 0; F < T.length; F++) {
        const D = T.charCodeAt(F);
        if (D >= 97 && D <= 122 || D >= 65 && D <= 90 || D >= 48 && D <= 57 || D === 45 || D === 46 || D === 95 || D === 126 || x && D === 47 || A && D === 91 || A && D === 93 || A && D === 58) I !== -1 && (C += encodeURIComponent(T.substring(I, F)), I = -1), C !== void 0 && (C += T.charAt(F));
        else {
          C === void 0 && (C = T.substr(0, F));
          const B = p[D];
          B !== void 0 ? (I !== -1 && (C += encodeURIComponent(T.substring(I, F)), I = -1), C += B) : I === -1 && (I = F);
        }
      }
      return I !== -1 && (C += encodeURIComponent(T.substring(I))), C !== void 0 ? C : T;
    }
    function y(T) {
      let x;
      for (let A = 0; A < T.length; A++) {
        const C = T.charCodeAt(A);
        C === 35 || C === 63 ? (x === void 0 && (x = T.substr(0, A)), x += p[C]) : x !== void 0 && (x += T[A]);
      }
      return x !== void 0 ? x : T;
    }
    function N(T, x) {
      let A;
      return A = T.authority && T.path.length > 1 && T.scheme === "file" ? `//${T.authority}${T.path}` : T.path.charCodeAt(0) === 47 && (T.path.charCodeAt(1) >= 65 && T.path.charCodeAt(1) <= 90 || T.path.charCodeAt(1) >= 97 && T.path.charCodeAt(1) <= 122) && T.path.charCodeAt(2) === 58 ? T.path[1].toLowerCase() + T.path.substr(2) : T.path, i && (A = A.replace(/\//g, "\\")), A;
    }
    function b(T, x) {
      const A = x ? y : w;
      let C = "", { scheme: I, authority: F, path: D, query: B, fragment: X } = T;
      if (I && (C += I, C += ":"), (F || I === "file") && (C += h, C += h), F) {
        let H = F.indexOf("@");
        if (H !== -1) {
          const Le = F.substr(0, H);
          F = F.substr(H + 1), H = Le.lastIndexOf(":"), H === -1 ? C += A(Le, !1, !1) : (C += A(Le.substr(0, H), !1, !1), C += ":", C += A(Le.substr(H + 1), !1, !0)), C += "@";
        }
        F = F.toLowerCase(), H = F.lastIndexOf(":"), H === -1 ? C += A(F, !1, !0) : (C += A(F.substr(0, H), !1, !0), C += F.substr(H));
      }
      if (D) {
        if (D.length >= 3 && D.charCodeAt(0) === 47 && D.charCodeAt(2) === 58) {
          const H = D.charCodeAt(1);
          H >= 65 && H <= 90 && (D = `/${String.fromCharCode(H + 32)}:${D.substr(3)}`);
        } else if (D.length >= 2 && D.charCodeAt(1) === 58) {
          const H = D.charCodeAt(0);
          H >= 65 && H <= 90 && (D = `${String.fromCharCode(H + 32)}:${D.substr(2)}`);
        }
        C += A(D, !0, !1);
      }
      return B && (C += "?", C += A(B, !1, !1)), X && (C += "#", C += x ? X : w(X, !1, !1)), C;
    }
    function _(T) {
      try {
        return decodeURIComponent(T);
      } catch {
        return T.length > 3 ? T.substr(0, 3) + _(T.substr(3)) : T;
      }
    }
    const L = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
    function S(T) {
      return T.match(L) ? T.replace(L, (x) => _(x)) : T;
    }
    var v = n(470);
    const k = v.posix || v, M = "/";
    var V;
    (function(T) {
      T.joinPath = function(x, ...A) {
        return x.with({ path: k.join(x.path, ...A) });
      }, T.resolvePath = function(x, ...A) {
        let C = x.path, I = !1;
        C[0] !== M && (C = M + C, I = !0);
        let F = k.resolve(C, ...A);
        return I && F[0] === M && !x.authority && (F = F.substring(1)), x.with({ path: F });
      }, T.dirname = function(x) {
        if (x.path.length === 0 || x.path === M) return x;
        let A = k.dirname(x.path);
        return A.length === 1 && A.charCodeAt(0) === 46 && (A = ""), x.with({ path: A });
      }, T.basename = function(x) {
        return k.basename(x.path);
      }, T.extname = function(x) {
        return k.extname(x.path);
      };
    })(V || (V = {}));
  })(), Oo = r;
})();
const { URI: $t, Utils: Q1 } = Oo;
function y1(e, t) {
  if (typeof e != "string")
    throw new TypeError("Expected a string");
  const n = String(e);
  let r = "";
  const i = !!t, s = !!t;
  let a = !1;
  const o = t && typeof t.flags == "string" ? t.flags : "";
  let u;
  for (let l = 0, h = n.length; l < h; l++)
    switch (u = n[l], u) {
      case "/":
      case "$":
      case "^":
      case "+":
      case ".":
      case "(":
      case ")":
      case "=":
      case "!":
      case "|":
        r += "\\" + u;
        break;
      case "?":
        if (i) {
          r += ".";
          break;
        }
      case "[":
      case "]":
        if (i) {
          r += u;
          break;
        }
      case "{":
        if (i) {
          a = !0, r += "(";
          break;
        }
      case "}":
        if (i) {
          a = !1, r += ")";
          break;
        }
      case ",":
        if (a) {
          r += "|";
          break;
        }
        r += "\\" + u;
        break;
      case "*":
        const f = n[l - 1];
        let d = 1;
        for (; n[l + 1] === "*"; )
          d++, l++;
        const m = n[l + 1];
        s ? d > 1 && (f === "/" || f === void 0 || f === "{" || f === ",") && (m === "/" || m === void 0 || m === "," || m === "}") ? (m === "/" ? l++ : f === "/" && r.endsWith("\\/") && (r = r.substr(0, r.length - 2)), r += "((?:[^/]*(?:/|$))*)") : r += "([^/]*)" : r += ".*";
        break;
      default:
        r += u;
    }
  return (!o || !~o.indexOf("g")) && (r = "^" + r + "$"), new RegExp(r, o);
}
const L1 = "!", N1 = "/";
class _1 {
  constructor(t, n, r) {
    this.folderUri = n, this.uris = r, this.globWrappers = [];
    try {
      for (let i of t) {
        const s = i[0] !== L1;
        s || (i = i.substring(1)), i.length > 0 && (i[0] === N1 && (i = i.substring(1)), this.globWrappers.push({
          regexp: y1("**/" + i, { extended: !0, globstar: !0 }),
          include: s
        }));
      }
      n && (n = $o(n), n.endsWith("/") || (n = n + "/"), this.folderUri = n);
    } catch {
      this.globWrappers.length = 0, this.uris = [];
    }
  }
  matchesPattern(t) {
    if (this.folderUri && !t.startsWith(this.folderUri))
      return !1;
    let n = !1;
    for (const { regexp: r, include: i } of this.globWrappers)
      r.test(t) && (n = i);
    return n;
  }
  getURIs() {
    return this.uris;
  }
}
class S1 {
  constructor(t, n, r) {
    this.service = t, this.uri = n, this.dependencies = /* @__PURE__ */ new Set(), this.anchors = void 0, r && (this.unresolvedSchema = this.service.promise.resolve(new Ht(r)));
  }
  getUnresolvedSchema() {
    return this.unresolvedSchema || (this.unresolvedSchema = this.service.loadSchema(this.uri)), this.unresolvedSchema;
  }
  getResolvedSchema() {
    return this.resolvedSchema || (this.resolvedSchema = this.getUnresolvedSchema().then((t) => this.service.resolveSchemaContent(t, this))), this.resolvedSchema;
  }
  clearSchema() {
    const t = !!this.unresolvedSchema;
    return this.resolvedSchema = void 0, this.unresolvedSchema = void 0, this.dependencies.clear(), this.anchors = void 0, t;
  }
}
class Ht {
  constructor(t, n = []) {
    this.schema = t, this.errors = n;
  }
}
class io {
  constructor(t, n = [], r = [], i) {
    this.schema = t, this.errors = n, this.warnings = r, this.schemaDraft = i;
  }
  getSection(t) {
    const n = this.getSectionRecursive(t, this.schema);
    if (n)
      return be(n);
  }
  getSectionRecursive(t, n) {
    if (!n || typeof n == "boolean" || t.length === 0)
      return n;
    const r = t.shift();
    if (n.properties && typeof n.properties[r])
      return this.getSectionRecursive(t, n.properties[r]);
    if (n.patternProperties)
      for (const i of Object.keys(n.patternProperties)) {
        const s = In(i);
        if (s != null && s.test(r))
          return this.getSectionRecursive(t, n.patternProperties[i]);
      }
    else {
      if (typeof n.additionalProperties == "object")
        return this.getSectionRecursive(t, n.additionalProperties);
      if (r.match("[0-9]+")) {
        if (Array.isArray(n.items)) {
          const i = parseInt(r, 10);
          if (!isNaN(i) && n.items[i])
            return this.getSectionRecursive(t, n.items[i]);
        } else if (n.items)
          return this.getSectionRecursive(t, n.items);
      }
    }
  }
}
class A1 {
  constructor(t, n, r) {
    this.contextService = n, this.requestService = t, this.promiseConstructor = r || Promise, this.callOnDispose = [], this.contributionSchemas = {}, this.contributionAssociations = [], this.schemasById = {}, this.filePatternAssociations = [], this.registeredSchemasIds = {};
  }
  getRegisteredSchemaIds(t) {
    return Object.keys(this.registeredSchemasIds).filter((n) => {
      const r = $t.parse(n).scheme;
      return r !== "schemaservice" && (!t || t(r));
    });
  }
  get promise() {
    return this.promiseConstructor;
  }
  dispose() {
    for (; this.callOnDispose.length > 0; )
      this.callOnDispose.pop()();
  }
  onResourceChange(t) {
    this.cachedSchemaForResource = void 0;
    let n = !1;
    t = Je(t);
    const r = [t], i = Object.keys(this.schemasById).map((s) => this.schemasById[s]);
    for (; r.length; ) {
      const s = r.pop();
      for (let a = 0; a < i.length; a++) {
        const o = i[a];
        o && (o.uri === s || o.dependencies.has(s)) && (o.uri !== s && r.push(o.uri), o.clearSchema() && (n = !0), i[a] = void 0);
      }
    }
    return n;
  }
  setSchemaContributions(t) {
    if (t.schemas) {
      const n = t.schemas;
      for (const r in n) {
        const i = Je(r);
        this.contributionSchemas[i] = this.addSchemaHandle(i, n[r]);
      }
    }
    if (Array.isArray(t.schemaAssociations)) {
      const n = t.schemaAssociations;
      for (let r of n) {
        const i = r.uris.map(Je), s = this.addFilePatternAssociation(r.pattern, r.folderUri, i);
        this.contributionAssociations.push(s);
      }
    }
  }
  addSchemaHandle(t, n) {
    const r = new S1(this, t, n);
    return this.schemasById[t] = r, r;
  }
  getOrAddSchemaHandle(t, n) {
    return this.schemasById[t] || this.addSchemaHandle(t, n);
  }
  addFilePatternAssociation(t, n, r) {
    const i = new _1(t, n, r);
    return this.filePatternAssociations.push(i), i;
  }
  registerExternalSchema(t) {
    const n = Je(t.uri);
    return this.registeredSchemasIds[n] = !0, this.cachedSchemaForResource = void 0, t.fileMatch && t.fileMatch.length && this.addFilePatternAssociation(t.fileMatch, t.folderUri, [n]), t.schema ? this.addSchemaHandle(n, t.schema) : this.getOrAddSchemaHandle(n);
  }
  clearExternalSchemas() {
    this.schemasById = {}, this.filePatternAssociations = [], this.registeredSchemasIds = {}, this.cachedSchemaForResource = void 0;
    for (const t in this.contributionSchemas)
      this.schemasById[t] = this.contributionSchemas[t], this.registeredSchemasIds[t] = !0;
    for (const t of this.contributionAssociations)
      this.filePatternAssociations.push(t);
  }
  getResolvedSchema(t) {
    const n = Je(t), r = this.schemasById[n];
    return r ? r.getResolvedSchema() : this.promise.resolve(void 0);
  }
  loadSchema(t) {
    if (!this.requestService) {
      const n = P("Unable to load schema from '{0}'. No schema request service available", Wt(t));
      return this.promise.resolve(new Ht({}, [n]));
    }
    return t.startsWith("http://json-schema.org/") && (t = "https" + t.substring(4)), this.requestService(t).then((n) => {
      if (!n) {
        const a = P("Unable to load schema from '{0}': No content.", Wt(t));
        return new Ht({}, [a]);
      }
      const r = [];
      n.charCodeAt(0) === 65279 && (r.push(P("Problem reading content from '{0}': UTF-8 with BOM detected, only UTF 8 is allowed.", Wt(t))), n = n.trimStart());
      let i = {};
      const s = [];
      return i = Hc(n, s), s.length && r.push(P("Unable to parse content from '{0}': Parse error at offset {1}.", Wt(t), s[0].offset)), new Ht(i, r);
    }, (n) => {
      let r = n.toString();
      const i = n.toString().split("Error: ");
      return i.length > 1 && (r = i[1]), sn(r, ".") && (r = r.substr(0, r.length - 1)), new Ht({}, [P("Unable to load schema from '{0}': {1}.", Wt(t), r)]);
    });
  }
  resolveSchemaContent(t, n) {
    const r = t.errors.slice(0), i = t.schema;
    let s = i.$schema ? Je(i.$schema) : void 0;
    if (s === "http://json-schema.org/draft-03/schema")
      return this.promise.resolve(new io({}, [P("Draft-03 schemas are not supported.")], [], s));
    let a = /* @__PURE__ */ new Set();
    const o = this.contextService, u = (p, w) => {
      w = decodeURIComponent(w);
      let y = p;
      return w[0] === "/" && (w = w.substring(1)), w.split("/").some((N) => (N = N.replace(/~1/g, "/").replace(/~0/g, "~"), y = y[N], !y)), y;
    }, l = (p, w, y) => (w.anchors || (w.anchors = g(p)), w.anchors.get(y)), h = (p, w) => {
      for (const y in w)
        w.hasOwnProperty(y) && y !== "id" && y !== "$id" && (p[y] = w[y]);
    }, f = (p, w, y, N) => {
      let b;
      N === void 0 || N.length === 0 ? b = w : N.charAt(0) === "/" ? b = u(w, N) : b = l(w, y, N), b ? h(p, b) : r.push(P("$ref '{0}' in '{1}' can not be resolved.", N || "", y.uri));
    }, d = (p, w, y, N) => {
      o && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/\/.*/.test(w) && (w = o.resolveRelativePath(w, N.uri)), w = Je(w);
      const b = this.getOrAddSchemaHandle(w);
      return b.getUnresolvedSchema().then((_) => {
        if (N.dependencies.add(w), _.errors.length) {
          const L = y ? w + "#" + y : w;
          r.push(P("Problems loading reference '{0}': {1}", L, _.errors[0]));
        }
        return f(p, _.schema, b, y), m(p, _.schema, b);
      });
    }, m = (p, w, y) => {
      const N = [];
      return this.traverseNodes(p, (b) => {
        const _ = /* @__PURE__ */ new Set();
        for (; b.$ref; ) {
          const L = b.$ref, S = L.split("#", 2);
          if (delete b.$ref, S[0].length > 0) {
            N.push(d(b, S[0], S[1], y));
            return;
          } else if (!_.has(L)) {
            const v = S[1];
            f(b, w, y, v), _.add(L);
          }
        }
        b.$recursiveRef && a.add("$recursiveRef"), b.$dynamicRef && a.add("$dynamicRef");
      }), this.promise.all(N);
    }, g = (p) => {
      const w = /* @__PURE__ */ new Map();
      return this.traverseNodes(p, (y) => {
        const N = y.$id || y.id, b = Po(N) && N.charAt(0) === "#" ? N.substring(1) : y.$anchor;
        b && (w.has(b) ? r.push(P("Duplicate anchor declaration: '{0}'", b)) : w.set(b, y)), y.$recursiveAnchor && a.add("$recursiveAnchor"), y.$dynamicAnchor && a.add("$dynamicAnchor");
      }), w;
    };
    return m(i, i, n).then((p) => {
      let w = [];
      return a.size && w.push(P("The schema uses meta-schema features ({0}) that are not yet supported by the validator.", Array.from(a.keys()).join(", "))), new io(i, r, w, s);
    });
  }
  traverseNodes(t, n) {
    if (!t || typeof t != "object")
      return Promise.resolve(null);
    const r = /* @__PURE__ */ new Set(), i = (...h) => {
      for (const f of h)
        Ze(f) && u.push(f);
    }, s = (...h) => {
      for (const f of h)
        if (Ze(f))
          for (const d in f) {
            const g = f[d];
            Ze(g) && u.push(g);
          }
    }, a = (...h) => {
      for (const f of h)
        if (Array.isArray(f))
          for (const d of f)
            Ze(d) && u.push(d);
    }, o = (h) => {
      if (Array.isArray(h))
        for (const f of h)
          Ze(f) && u.push(f);
      else Ze(h) && u.push(h);
    }, u = [t];
    let l = u.pop();
    for (; l; )
      r.has(l) || (r.add(l), n(l), i(l.additionalItems, l.additionalProperties, l.not, l.contains, l.propertyNames, l.if, l.then, l.else, l.unevaluatedItems, l.unevaluatedProperties), s(l.definitions, l.$defs, l.properties, l.patternProperties, l.dependencies, l.dependentSchemas), a(l.anyOf, l.allOf, l.oneOf, l.prefixItems), o(l.items)), l = u.pop();
  }
  getSchemaFromProperty(t, n) {
    var r, i;
    if (((r = n.root) == null ? void 0 : r.type) === "object") {
      for (const s of n.root.properties)
        if (s.keyNode.value === "$schema" && ((i = s.valueNode) == null ? void 0 : i.type) === "string") {
          let a = s.valueNode.value;
          return this.contextService && !/^\w[\w\d+.-]*:/.test(a) && (a = this.contextService.resolveRelativePath(a, t)), a;
        }
    }
  }
  getAssociatedSchemas(t) {
    const n = /* @__PURE__ */ Object.create(null), r = [], i = $o(t);
    for (const s of this.filePatternAssociations)
      if (s.matchesPattern(i))
        for (const a of s.getURIs())
          n[a] || (r.push(a), n[a] = !0);
    return r;
  }
  getSchemaURIsForResource(t, n) {
    let r = n && this.getSchemaFromProperty(t, n);
    return r ? [r] : this.getAssociatedSchemas(t);
  }
  getSchemaForResource(t, n) {
    if (n) {
      let s = this.getSchemaFromProperty(t, n);
      if (s) {
        const a = Je(s);
        return this.getOrAddSchemaHandle(a).getResolvedSchema();
      }
    }
    if (this.cachedSchemaForResource && this.cachedSchemaForResource.resource === t)
      return this.cachedSchemaForResource.resolvedSchema;
    const r = this.getAssociatedSchemas(t), i = r.length > 0 ? this.createCombinedSchema(t, r).getResolvedSchema() : this.promise.resolve(void 0);
    return this.cachedSchemaForResource = { resource: t, resolvedSchema: i }, i;
  }
  createCombinedSchema(t, n) {
    if (n.length === 1)
      return this.getOrAddSchemaHandle(n[0]);
    {
      const r = "schemaservice://combinedSchema/" + encodeURIComponent(t), i = {
        allOf: n.map((s) => ({ $ref: s }))
      };
      return this.addSchemaHandle(r, i);
    }
  }
  getMatchingSchemas(t, n, r) {
    if (r) {
      const i = r.id || "schemaservice://untitled/matchingSchemas/" + k1++;
      return this.addSchemaHandle(i, r).getResolvedSchema().then((a) => n.getMatchingSchemas(a.schema).filter((o) => !o.inverted));
    }
    return this.getSchemaForResource(t.uri, n).then((i) => i ? n.getMatchingSchemas(i.schema).filter((s) => !s.inverted) : []);
  }
}
let k1 = 0;
function Je(e) {
  try {
    return $t.parse(e).toString(!0);
  } catch {
    return e;
  }
}
function $o(e) {
  try {
    return $t.parse(e).with({ fragment: null, query: null }).toString(!0);
  } catch {
    return e;
  }
}
function Wt(e) {
  try {
    const t = $t.parse(e);
    if (t.scheme === "file")
      return t.fsPath;
  } catch {
  }
  return e;
}
function R1(e, t) {
  const n = [], r = [], i = [];
  let s = -1;
  const a = lt(e.getText(), !1);
  let o = a.scan();
  function u(g) {
    n.push(g), r.push(i.length);
  }
  for (; o !== 17; ) {
    switch (o) {
      case 1:
      case 3: {
        const g = e.positionAt(a.getTokenOffset()).line, p = { startLine: g, endLine: g, kind: o === 1 ? "object" : "array" };
        i.push(p);
        break;
      }
      case 2:
      case 4: {
        const g = o === 2 ? "object" : "array";
        if (i.length > 0 && i[i.length - 1].kind === g) {
          const p = i.pop(), w = e.positionAt(a.getTokenOffset()).line;
          p && w > p.startLine + 1 && s !== p.startLine && (p.endLine = w - 1, u(p), s = p.startLine);
        }
        break;
      }
      case 13: {
        const g = e.positionAt(a.getTokenOffset()).line, p = e.positionAt(a.getTokenOffset() + a.getTokenLength()).line;
        a.getTokenError() === 1 && g + 1 < e.lineCount ? a.setPosition(e.offsetAt(ee.create(g + 1, 0))) : g < p && (u({ startLine: g, endLine: p, kind: Qt.Comment }), s = g);
        break;
      }
      case 12: {
        const p = e.getText().substr(a.getTokenOffset(), a.getTokenLength()).match(/^\/\/\s*#(region\b)|(endregion\b)/);
        if (p) {
          const w = e.positionAt(a.getTokenOffset()).line;
          if (p[1]) {
            const y = { startLine: w, endLine: w, kind: Qt.Region };
            i.push(y);
          } else {
            let y = i.length - 1;
            for (; y >= 0 && i[y].kind !== Qt.Region; )
              y--;
            if (y >= 0) {
              const N = i[y];
              i.length = y, w > N.startLine && s !== N.startLine && (N.endLine = w, u(N), s = N.startLine);
            }
          }
        }
        break;
      }
    }
    o = a.scan();
  }
  const l = t && t.rangeLimit;
  if (typeof l != "number" || n.length <= l)
    return n;
  t && t.onRangeLimitExceeded && t.onRangeLimitExceeded(e.uri);
  const h = [];
  for (let g of r)
    g < 30 && (h[g] = (h[g] || 0) + 1);
  let f = 0, d = 0;
  for (let g = 0; g < h.length; g++) {
    const p = h[g];
    if (p) {
      if (p + f > l) {
        d = g;
        break;
      }
      f += p;
    }
  }
  const m = [];
  for (let g = 0; g < n.length; g++) {
    const p = r[g];
    typeof p == "number" && (p < d || p === d && f++ < l) && m.push(n[g]);
  }
  return m;
}
function E1(e, t, n) {
  function r(o) {
    let u = e.offsetAt(o), l = n.getNodeFromOffset(u, !0);
    const h = [];
    for (; l; ) {
      switch (l.type) {
        case "string":
        case "object":
        case "array":
          const d = l.offset + 1, m = l.offset + l.length - 1;
          d < m && u >= d && u <= m && h.push(i(d, m)), h.push(i(l.offset, l.offset + l.length));
          break;
        case "number":
        case "boolean":
        case "null":
        case "property":
          h.push(i(l.offset, l.offset + l.length));
          break;
      }
      if (l.type === "property" || l.parent && l.parent.type === "array") {
        const d = a(
          l.offset + l.length,
          5
          /* SyntaxKind.CommaToken */
        );
        d !== -1 && h.push(i(l.offset, d));
      }
      l = l.parent;
    }
    let f;
    for (let d = h.length - 1; d >= 0; d--)
      f = On.create(h[d], f);
    return f || (f = On.create(W.create(o, o))), f;
  }
  function i(o, u) {
    return W.create(e.positionAt(o), e.positionAt(u));
  }
  const s = lt(e.getText(), !0);
  function a(o, u) {
    return s.setPosition(o), s.scan() === u ? s.getTokenOffset() + s.getTokenLength() : -1;
  }
  return t.map(r);
}
function Jr(e, t, n) {
  let r;
  if (n) {
    const s = e.offsetAt(n.start), a = e.offsetAt(n.end) - s;
    r = { offset: s, length: a };
  }
  const i = {
    tabSize: t ? t.tabSize : 4,
    insertSpaces: (t == null ? void 0 : t.insertSpaces) === !0,
    insertFinalNewline: (t == null ? void 0 : t.insertFinalNewline) === !0,
    eol: `
`,
    keepLines: (t == null ? void 0 : t.keepLines) === !0
  };
  return Xc(e.getText(), r, i).map((s) => $e.replace(W.create(e.positionAt(s.offset), e.positionAt(s.offset + s.length)), s.content));
}
var se;
(function(e) {
  e[e.Object = 0] = "Object", e[e.Array = 1] = "Array";
})(se || (se = {}));
class pn {
  constructor(t, n) {
    this.propertyName = t ?? "", this.beginningLineNumber = n, this.childrenProperties = [], this.lastProperty = !1, this.noKeyName = !1;
  }
  addChildProperty(t) {
    if (t.parent = this, this.childrenProperties.length > 0) {
      let n = 0;
      t.noKeyName ? n = this.childrenProperties.length : n = T1(this.childrenProperties, t, M1), n < 0 && (n = n * -1 - 1), this.childrenProperties.splice(n, 0, t);
    } else
      this.childrenProperties.push(t);
    return t;
  }
}
function M1(e, t) {
  const n = e.propertyName.toLowerCase(), r = t.propertyName.toLowerCase();
  return n < r ? -1 : n > r ? 1 : 0;
}
function T1(e, t, n) {
  const r = t.propertyName.toLowerCase(), i = e[0].propertyName.toLowerCase(), s = e[e.length - 1].propertyName.toLowerCase();
  if (r < i)
    return 0;
  if (r > s)
    return e.length;
  let a = 0, o = e.length - 1;
  for (; a <= o; ) {
    let u = o + a >> 1, l = n(t, e[u]);
    if (l > 0)
      a = u + 1;
    else if (l < 0)
      o = u - 1;
    else
      return u;
  }
  return -a - 1;
}
function P1(e, t) {
  const n = {
    ...t,
    keepLines: !1
    // keepLines must be false so that the properties are on separate lines for the sorting
  }, r = Pe.applyEdits(e, Jr(e, n, void 0)), i = Pe.create("test://test.json", "json", 0, r), s = C1(i), a = I1(i, s), o = Jr(a, n, void 0), u = Pe.applyEdits(a, o);
  return [$e.replace(W.create(ee.create(0, 0), e.positionAt(e.getText().length)), u)];
}
function C1(e) {
  const t = e.getText(), n = lt(t, !1);
  let r = new pn(), i = r, s = r, a = r, o, u = 0, l = 0, h, f, d = -1, m = -1, g = 0, p = 0, w = [], y = !1, N = !1;
  for (; (o = n.scan()) !== 17; ) {
    if (y === !0 && o !== 14 && o !== 15 && o !== 12 && o !== 13 && s.endLineNumber === void 0) {
      let b = n.getTokenStartLine();
      f === 2 || f === 4 ? a.endLineNumber = b - 1 : s.endLineNumber = b - 1, g = b, y = !1;
    }
    if (N === !0 && o !== 14 && o !== 15 && o !== 12 && o !== 13 && (g = n.getTokenStartLine(), N = !1), n.getTokenStartLine() !== u) {
      for (let b = u; b < n.getTokenStartLine(); b++) {
        const _ = e.getText(W.create(ee.create(b, 0), ee.create(b + 1, 0))).length;
        l = l + _;
      }
      u = n.getTokenStartLine();
    }
    switch (o) {
      case 10: {
        if (h === void 0 || h === 1 || h === 5 && w[w.length - 1] === se.Object) {
          const b = new pn(n.getTokenValue(), g);
          a = s, s = i.addChildProperty(b);
        }
        break;
      }
      case 3: {
        if (r.beginningLineNumber === void 0 && (r.beginningLineNumber = n.getTokenStartLine()), w[w.length - 1] === se.Object)
          i = s;
        else if (w[w.length - 1] === se.Array) {
          const b = new pn(n.getTokenValue(), g);
          b.noKeyName = !0, a = s, s = i.addChildProperty(b), i = s;
        }
        w.push(se.Array), s.type = se.Array, g = n.getTokenStartLine(), g++;
        break;
      }
      case 1: {
        if (r.beginningLineNumber === void 0)
          r.beginningLineNumber = n.getTokenStartLine();
        else if (w[w.length - 1] === se.Array) {
          const b = new pn(n.getTokenValue(), g);
          b.noKeyName = !0, a = s, s = i.addChildProperty(b);
        }
        s.type = se.Object, w.push(se.Object), i = s, g = n.getTokenStartLine(), g++;
        break;
      }
      case 4: {
        p = n.getTokenStartLine(), w.pop(), s.endLineNumber === void 0 && (h === 2 || h === 4) && (s.endLineNumber = p - 1, s.lastProperty = !0, s.lineWhereToAddComma = d, s.indexWhereToAddComa = m, a = s, s = s ? s.parent : void 0, i = s), r.endLineNumber = p, g = p + 1;
        break;
      }
      case 2: {
        p = n.getTokenStartLine(), w.pop(), h !== 1 && (s.endLineNumber === void 0 && (s.endLineNumber = p - 1, s.lastProperty = !0, s.lineWhereToAddComma = d, s.indexWhereToAddComa = m), a = s, s = s ? s.parent : void 0, i = s), r.endLineNumber = n.getTokenStartLine(), g = p + 1;
        break;
      }
      case 5: {
        p = n.getTokenStartLine(), s.endLineNumber === void 0 && (w[w.length - 1] === se.Object || w[w.length - 1] === se.Array && (h === 2 || h === 4)) && (s.endLineNumber = p, s.commaIndex = n.getTokenOffset() - l, s.commaLine = p), (h === 2 || h === 4) && (a = s, s = s ? s.parent : void 0, i = s), g = p + 1;
        break;
      }
      case 13: {
        h === 5 && d === n.getTokenStartLine() && (w[w.length - 1] === se.Array && (f === 2 || f === 4) || w[w.length - 1] === se.Object) && (w[w.length - 1] === se.Array && (f === 2 || f === 4) || w[w.length - 1] === se.Object) && (s.endLineNumber = void 0, y = !0), (h === 1 || h === 3) && d === n.getTokenStartLine() && (N = !0);
        break;
      }
    }
    o !== 14 && o !== 13 && o !== 12 && o !== 15 && (f = h, h = o, d = n.getTokenStartLine(), m = n.getTokenOffset() + n.getTokenLength() - l);
  }
  return r;
}
function I1(e, t) {
  if (t.childrenProperties.length === 0)
    return e;
  const n = Pe.create("test://test.json", "json", 0, e.getText()), r = [];
  for (so(r, t, t.beginningLineNumber); r.length > 0; ) {
    const i = r.shift(), s = i.propertyTreeArray;
    let a = i.beginningLineNumber;
    for (let o = 0; o < s.length; o++) {
      const u = s[o], l = W.create(ee.create(u.beginningLineNumber, 0), ee.create(u.endLineNumber + 1, 0)), h = e.getText(l), f = Pe.create("test://test.json", "json", 0, h);
      if (u.lastProperty === !0 && o !== s.length - 1) {
        const g = u.lineWhereToAddComma - u.beginningLineNumber, p = u.indexWhereToAddComa, w = {
          range: W.create(ee.create(g, p), ee.create(g, p)),
          text: ","
        };
        Pe.update(f, [w], 1);
      } else if (u.lastProperty === !1 && o === s.length - 1) {
        const g = u.commaIndex, w = u.commaLine - u.beginningLineNumber, y = {
          range: W.create(ee.create(w, g), ee.create(w, g + 1)),
          text: ""
        };
        Pe.update(f, [y], 1);
      }
      const d = u.endLineNumber - u.beginningLineNumber + 1, m = {
        range: W.create(ee.create(a, 0), ee.create(a + d, 0)),
        text: f.getText()
      };
      Pe.update(n, [m], 1), so(r, u, a), a = a + d;
    }
  }
  return n;
}
function so(e, t, n) {
  if (t.childrenProperties.length !== 0)
    if (t.type === se.Object) {
      let r = 1 / 0;
      for (const s of t.childrenProperties)
        s.beginningLineNumber < r && (r = s.beginningLineNumber);
      const i = r - t.beginningLineNumber;
      n = n + i, e.push(new Uo(n, t.childrenProperties));
    } else t.type === se.Array && Bo(e, t, n);
}
function Bo(e, t, n) {
  for (const r of t.childrenProperties) {
    if (r.type === se.Object) {
      let i = 1 / 0;
      for (const a of r.childrenProperties)
        a.beginningLineNumber < i && (i = a.beginningLineNumber);
      const s = i - r.beginningLineNumber;
      e.push(new Uo(n + r.beginningLineNumber - t.beginningLineNumber + s, r.childrenProperties));
    }
    r.type === se.Array && Bo(e, r, n + r.beginningLineNumber - t.beginningLineNumber);
  }
}
class Uo {
  constructor(t, n) {
    this.beginningLineNumber = t, this.propertyTreeArray = n;
  }
}
function F1(e, t) {
  const n = [];
  return t.visit((r) => {
    var i;
    if (r.type === "property" && r.keyNode.value === "$ref" && ((i = r.valueNode) == null ? void 0 : i.type) === "string") {
      const s = r.valueNode.value, a = D1(t, s);
      if (a) {
        const o = e.positionAt(a.offset);
        n.push({
          target: `${e.uri}#${o.line + 1},${o.character + 1}`,
          range: V1(e, r.valueNode)
        });
      }
    }
    return !0;
  }), Promise.resolve(n);
}
function V1(e, t) {
  return W.create(e.positionAt(t.offset + 1), e.positionAt(t.offset + t.length - 1));
}
function D1(e, t) {
  const n = O1(t);
  return n ? Xr(n, e.root) : null;
}
function Xr(e, t) {
  if (!t)
    return null;
  if (e.length === 0)
    return t;
  const n = e.shift();
  if (t && t.type === "object") {
    const r = t.properties.find((i) => i.keyNode.value === n);
    return r ? Xr(e, r.valueNode) : null;
  } else if (t && t.type === "array" && n.match(/^(0|[1-9][0-9]*)$/)) {
    const r = Number.parseInt(n), i = t.items[r];
    return i ? Xr(e, i) : null;
  }
  return null;
}
function O1(e) {
  return e === "#" ? [] : e[0] !== "#" || e[1] !== "/" ? null : e.substring(2).split(/\//).map($1);
}
function $1(e) {
  return e.replace(/~1/g, "/").replace(/~0/g, "~");
}
function B1(e) {
  const t = e.promiseConstructor || Promise, n = new A1(e.schemaRequestService, e.workspaceContext, t);
  n.setSchemaContributions(Gr);
  const r = new c1(n, e.contributions, t, e.clientCapabilities), i = new f1(n, e.contributions, t), s = new x1(n), a = new d1(n, t);
  return {
    configure: (o) => {
      var u;
      n.clearExternalSchemas(), (u = o.schemas) == null || u.forEach(n.registerExternalSchema.bind(n)), a.configure(o);
    },
    resetSchema: (o) => n.onResourceChange(o),
    doValidation: a.doValidation.bind(a),
    getLanguageStatus: a.getLanguageStatus.bind(a),
    parseJSONDocument: (o) => u1(o, { collectComments: !0 }),
    newJSONDocument: (o, u) => l1(o, u),
    getMatchingSchemas: n.getMatchingSchemas.bind(n),
    doResolve: r.doResolve.bind(r),
    doComplete: r.doComplete.bind(r),
    findDocumentSymbols: s.findDocumentSymbols.bind(s),
    findDocumentSymbols2: s.findDocumentSymbols2.bind(s),
    findDocumentColors: s.findDocumentColors.bind(s),
    getColorPresentations: s.getColorPresentations.bind(s),
    doHover: i.doHover.bind(i),
    getFoldingRanges: R1,
    getSelectionRanges: E1,
    findDefinition: () => Promise.resolve([]),
    findLinks: F1,
    format: (o, u, l) => Jr(o, l, u),
    sort: (o, u) => P1(o, u)
  };
}
let qo;
typeof fetch < "u" && (qo = function(e) {
  return fetch(e).then((t) => t.text());
});
class U1 {
  constructor(t, n) {
    this._ctx = t, this._languageSettings = n.languageSettings, this._languageId = n.languageId, this._languageService = B1({
      workspaceContext: {
        resolveRelativePath: (r, i) => {
          const s = i.substr(0, i.lastIndexOf("/") + 1);
          return W1(s, r);
        }
      },
      schemaRequestService: n.enableSchemaRequest ? qo : void 0,
      clientCapabilities: Wr.LATEST
    }), this._languageService.configure(this._languageSettings);
  }
  async doValidation(t) {
    let n = this._getTextDocument(t);
    if (n) {
      let r = this._languageService.parseJSONDocument(n);
      return this._languageService.doValidation(n, r, this._languageSettings);
    }
    return Promise.resolve([]);
  }
  async doComplete(t, n) {
    let r = this._getTextDocument(t);
    if (!r)
      return null;
    let i = this._languageService.parseJSONDocument(r);
    return this._languageService.doComplete(r, n, i);
  }
  async doResolve(t) {
    return this._languageService.doResolve(t);
  }
  async doHover(t, n) {
    let r = this._getTextDocument(t);
    if (!r)
      return null;
    let i = this._languageService.parseJSONDocument(r);
    return this._languageService.doHover(r, n, i);
  }
  async format(t, n, r) {
    let i = this._getTextDocument(t);
    if (!i)
      return [];
    let s = this._languageService.format(i, n, r);
    return Promise.resolve(s);
  }
  async resetSchema(t) {
    return Promise.resolve(this._languageService.resetSchema(t));
  }
  async findDocumentSymbols(t) {
    let n = this._getTextDocument(t);
    if (!n)
      return [];
    let r = this._languageService.parseJSONDocument(n), i = this._languageService.findDocumentSymbols2(n, r);
    return Promise.resolve(i);
  }
  async findDocumentColors(t) {
    let n = this._getTextDocument(t);
    if (!n)
      return [];
    let r = this._languageService.parseJSONDocument(n), i = this._languageService.findDocumentColors(n, r);
    return Promise.resolve(i);
  }
  async getColorPresentations(t, n, r) {
    let i = this._getTextDocument(t);
    if (!i)
      return [];
    let s = this._languageService.parseJSONDocument(i), a = this._languageService.getColorPresentations(
      i,
      s,
      n,
      r
    );
    return Promise.resolve(a);
  }
  async getFoldingRanges(t, n) {
    let r = this._getTextDocument(t);
    if (!r)
      return [];
    let i = this._languageService.getFoldingRanges(r, n);
    return Promise.resolve(i);
  }
  async getSelectionRanges(t, n) {
    let r = this._getTextDocument(t);
    if (!r)
      return [];
    let i = this._languageService.parseJSONDocument(r), s = this._languageService.getSelectionRanges(r, n, i);
    return Promise.resolve(s);
  }
  async parseJSONDocument(t) {
    let n = this._getTextDocument(t);
    if (!n)
      return null;
    let r = this._languageService.parseJSONDocument(n);
    return Promise.resolve(r);
  }
  async getMatchingSchemas(t) {
    let n = this._getTextDocument(t);
    if (!n)
      return [];
    let r = this._languageService.parseJSONDocument(n);
    return Promise.resolve(this._languageService.getMatchingSchemas(n, r));
  }
  _getTextDocument(t) {
    let n = this._ctx.getMirrorModels();
    for (let r of n)
      if (r.uri.toString() === t)
        return Pe.create(
          t,
          this._languageId,
          r.version,
          r.getValue()
        );
    return null;
  }
}
const q1 = 47, tr = 46;
function j1(e) {
  return e.charCodeAt(0) === q1;
}
function W1(e, t) {
  if (j1(t)) {
    const n = $t.parse(e), r = t.split("/");
    return n.with({ path: jo(r) }).toString();
  }
  return H1(e, t);
}
function jo(e) {
  const t = [];
  for (const r of e)
    r.length === 0 || r.length === 1 && r.charCodeAt(0) === tr || (r.length === 2 && r.charCodeAt(0) === tr && r.charCodeAt(1) === tr ? t.pop() : t.push(r));
  e.length > 1 && e[e.length - 1].length === 0 && t.push("");
  let n = t.join("/");
  return e[0].length === 0 && (n = "/" + n), n;
}
function H1(e, ...t) {
  const n = $t.parse(e), r = n.path.split("/");
  for (let i of t)
    r.push(...i.split("/"));
  return n.with({ path: jo(r) }).toString();
}
self.onmessage = () => {
  Dc((e, t) => new U1(e, t));
};
