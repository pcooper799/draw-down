"use strict";
(() => {
  // node_modules/@noble/ed25519/index.js
  var freeze = Object.freeze;
  var P = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
  var N = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;
  var _d = 0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3n;
  var Gx = 0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51an;
  var Gy = 0x6666666666666666666666666666666666666666666666666666666666666658n;
  var _a = P - 1n;
  var ed25519_CURVE = freeze({
    p: P,
    n: N,
    h: 8n,
    a: _a,
    d: _d,
    Gx,
    Gy
  });
  var LEN = 32;
  var isBytes = (a) => {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && a.BYTES_PER_ELEMENT === 1;
  };
  var abytes = (value, length, title = "") => {
    if (isBytes(value) && (length === void 0 || value.length === length))
      return value;
    const bytes = isBytes(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = (title ? `"${title}" ` : "") + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  };
  var snapshotBytes = (value, title = "", length) => Uint8Array.from(abytes(value, length, title));
  var padh = (n, pad) => n.toString(16).padStart(pad, "0");
  var bytesToHex = (bytes) => {
    let hex = "";
    for (const byte of abytes(bytes))
      hex += padh(byte, 2);
    return hex;
  };
  var hexToBytes = (hex) => {
    const e = "hex invalid";
    if (typeof hex !== "string")
      throw new TypeError(e);
    if (hex.length % 2 || !/^[\da-f]*$/i.test(hex))
      throw new RangeError(e);
    const array = new Uint8Array(hex.length / 2);
    for (let ai = 0, hi = 0; ai < array.length; ai++, hi += 2) {
      const n1 = hex.charCodeAt(hi);
      const n2 = hex.charCodeAt(hi + 1);
      array[ai] = ((n1 & 15) + (n1 >> 6) * 9) * 16 + (n2 & 15) + (n2 >> 6) * 9;
    }
    return array;
  };
  var concatBytes = (...arrays) => {
    let sum = 0;
    for (const a of arrays)
      sum += abytes(a).length;
    const res = new Uint8Array(sum);
    let pad = 0;
    for (const a of arrays) {
      res.set(a, pad);
      pad += a.length;
    }
    return res;
  };
  var randomBytes = (len = LEN) => {
    const c = globalThis?.crypto;
    if (typeof c?.getRandomValues !== "function")
      throw new Error("crypto.getRandomValues must be defined, consider polyfill");
    return c.getRandomValues(new Uint8Array(len));
  };
  var arange = (n, min, max, msg = "bad number: out of range") => {
    if (typeof n !== "bigint")
      throw new TypeError(msg);
    if (min <= n && n < max)
      return n;
    throw new RangeError(msg);
  };
  var mod = (a, b = P) => (a %= b) >= 0n ? a : b + a;
  var P_MASK = (1n << 255n) - 1n;
  var modP = (num) => {
    if (num < 0n)
      throw new RangeError("negative coordinate");
    let r = (num >> 255n) * 19n + (num & P_MASK);
    r = (r >> 255n) * 19n + (r & P_MASK);
    return r % P;
  };
  var modN = (a) => mod(a, N);
  var invert = (number, modulo) => {
    if (number === 0n)
      throw new Error("invert: expected non-zero number");
    if (modulo <= 1n)
      throw new Error("invert: expected modulus > 1, got " + modulo);
    let a = mod(number, modulo);
    let b = modulo;
    let x = 0n, u = 1n;
    while (a !== 0n) {
      const q = b / a;
      const r = b - a * q;
      const m = x - u * q;
      b = a, a = r, x = u, u = m;
    }
    const gcd = b;
    if (gcd !== 1n)
      throw new Error("invert: does not exist");
    return mod(x, modulo);
  };
  var _hash = (name) => {
    const fn = hashes[name];
    if (typeof fn !== "function")
      throw new Error("hashes." + name + " not set");
    return fn;
  };
  var callHashAsync = async (name, ...m) => abytes(await _hash(name)(concatBytes(...m)), 64, "digest");
  var apoint = (p) => {
    if (p instanceof Point)
      return p;
    throw new TypeError("Point expected");
  };
  var B256 = 2n ** 256n;
  var Point = class _Point {
    static BASE;
    static ZERO;
    X;
    Y;
    Z;
    T;
    // Constructor only bounds-checks and freezes XYZT coordinates; it does not prove the point is
    // on-curve or that T matches X*Y/Z.
    constructor(X, Y, Z, T) {
      const max = B256;
      this.X = arange(X, 0n, max);
      this.Y = arange(Y, 0n, max);
      this.Z = arange(Z, 1n, max);
      this.T = arange(T, 0n, max);
      freeze(this);
    }
    static CURVE() {
      return ed25519_CURVE;
    }
    static fromAffine(p) {
      return new _Point(p.x, p.y, 1n, modP(p.x * p.y));
    }
    /** RFC8032 5.1.3: Uint8Array to Point. */
    static fromBytes(bytes, zip215 = false) {
      const normed = snapshotBytes(bytes, "point", LEN);
      const lastByte = normed[31];
      normed[31] = lastByte & ~128;
      const y = bytesToNumberLE(normed);
      if (!zip215)
        arange(y, 0n, P);
      const y2 = modP(y * y);
      const u = mod(y2 - 1n);
      const v = modP(_d * y2 + 1n);
      let { isValid, value: x } = uvRatio(u, v);
      if (!isValid)
        throw new Error("bad point: y not sqrt");
      const isLastByteOdd = !!(lastByte & 128);
      if (!zip215 && x === 0n && isLastByteOdd)
        throw new Error("bad point: x==0, isLastByteOdd");
      if (isLastByteOdd !== !!(x & 1n))
        x = mod(-x);
      return new _Point(x, y, 1n, modP(x * y));
    }
    static fromHex(hex, zip215) {
      return _Point.fromBytes(hexToBytes(hex), zip215);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /** Checks if the point is valid and on-curve. */
    assertValidity() {
      const a = _a;
      const d = _d;
      const p = this;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X, Y, Z, T } = p;
      const X2 = modP(X * X);
      const Y2 = modP(Y * Y);
      const Z2 = modP(Z * Z);
      const Z4 = modP(Z2 * Z2);
      const aX2 = modP(X2 * a);
      const left = modP(Z2 * (aX2 + Y2));
      const right = mod(Z4 + modP(d * modP(X2 * Y2)));
      if (left !== right)
        throw new Error("bad point: equation left != right (1)");
      const XY = modP(X * Y);
      const ZT = modP(Z * T);
      if (XY !== ZT)
        throw new Error("bad point: equation left != right (2)");
      return this;
    }
    /** Equality check: compare points P&Q. */
    equals(other) {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
      return modP(X1 * Z2) === modP(X2 * Z1) && modP(Y1 * Z2) === modP(Y2 * Z1);
    }
    is0() {
      return this.equals(I);
    }
    /** Flip point over y coordinate. */
    negate() {
      return new _Point(mod(-this.X), this.Y, this.Z, mod(-this.T));
    }
    /** Point doubling. Complete formula. Cost: `4M + 4S + 1*a + 6add + 1*2`. */
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const a = _a;
      const A = modP(X1 * X1);
      const B = modP(Y1 * Y1);
      const C = modP(2n * Z1 * Z1);
      const D = modP(a * A);
      const x1y1 = mod(X1 + Y1);
      const E = mod(modP(x1y1 * x1y1) - A - B);
      const G2 = mod(D + B);
      const F = mod(G2 - C);
      const H = mod(D - B);
      const X3 = modP(E * F);
      const Y3 = modP(G2 * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G2);
      return new _Point(X3, Y3, Z3, T3);
    }
    /** Point addition. Complete formula. Cost: `9M + 1*a + 1*d + 7add`. */
    add(other) {
      const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
      const { X: X2, Y: Y2, Z: Z2, T: T2 } = apoint(other);
      const a = _a;
      const d = _d;
      const A = modP(X1 * X2);
      const B = modP(Y1 * Y2);
      const C = modP(modP(T1 * d) * T2);
      const D = modP(Z1 * Z2);
      const E = mod(modP(mod(X1 + Y1) * mod(X2 + Y2)) - A - B);
      const F = mod(D - C);
      const G2 = mod(D + C);
      const H = mod(B - modP(a * A));
      const X3 = modP(E * F);
      const Y3 = modP(G2 * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G2);
      return new _Point(X3, Y3, Z3, T3);
    }
    subtract(other) {
      return this.add(apoint(other).negate());
    }
    /**
     * Point-by-scalar multiplication. Safe mode requires `1 <= n < CURVE.n`.
     * Unsafe mode additionally permits `n = 0` and returns the identity point for that case.
     * Uses {@link wNAF} for base point.
     * Uses fake point to mitigate side-channel leakage.
     * @param n - scalar by which point is multiplied
     * @param safe - safe mode guards against timing attacks; unsafe mode is faster
     */
    multiply(n, safe = true) {
      if (!safe && n === 0n)
        return I;
      arange(n, 1n, N);
      if (!safe && this.is0())
        return I;
      if (n === 1n)
        return this;
      if (this.equals(G))
        return wNAF(n).p;
      let p = I;
      let f = G;
      let d = this;
      for (let i = 0; safe ? i < 256 : n > 0n; i++) {
        if (n & 1n)
          p = p.add(d);
        else if (safe)
          f = f.add(d);
        d = d.double();
        n >>= 1n;
      }
      return p;
    }
    multiplyUnsafe(scalar) {
      return this.multiply(scalar, false);
    }
    /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
    toAffine() {
      const { X, Y, Z } = this;
      if (this.equals(I))
        return { x: 0n, y: 1n };
      const iz = invert(Z, P);
      if (modP(Z * iz) !== 1n)
        throw new Error("invalid inverse");
      return { x: modP(X * iz), y: modP(Y * iz) };
    }
    toBytes() {
      const { x, y } = this.toAffine();
      const b = numTo32bLE(y);
      b[31] |= x & 1n ? 128 : 0;
      return b;
    }
    toHex() {
      return bytesToHex(this.toBytes());
    }
    clearCofactor() {
      return this.multiply(8n, false);
    }
    isSmallOrder() {
      return this.clearCofactor().is0();
    }
    isTorsionFree() {
      return this.multiply(N / 2n, false).double().add(this).is0();
    }
  };
  var G = new Point(Gx, Gy, 1n, mod(Gx * Gy));
  var I = new Point(0n, 1n, 1n, 0n);
  Point.BASE = G;
  Point.ZERO = I;
  var numTo32bLE = (num) => hexToBytes(padh(arange(num, 0n, B256), 64)).reverse();
  var bytesToNumberLE = (b) => BigInt("0x" + bytesToHex(Uint8Array.from(abytes(b)).reverse()));
  var pow2 = (x, power) => {
    let r = x;
    while (power-- > 0) {
      r = modP(r * r);
    }
    return r;
  };
  var pow_2_252_3 = (x) => {
    const x2 = modP(x * x);
    const b2 = modP(x2 * x);
    const b4 = modP(pow2(b2, 2) * b2);
    const b5 = modP(pow2(b4, 1) * x);
    const b10 = modP(pow2(b5, 5) * b5);
    const b20 = modP(pow2(b10, 10) * b10);
    const b40 = modP(pow2(b20, 20) * b20);
    const b80 = modP(pow2(b40, 40) * b40);
    const b160 = modP(pow2(b80, 80) * b80);
    const b240 = modP(pow2(b160, 80) * b80);
    const b250 = modP(pow2(b240, 10) * b10);
    return modP(pow2(b250, 2) * x);
  };
  var RM1 = 0x2b8324804fc1df0b2b4d00993dfbd7a72f431806ad2fe478c4ee1b274a0ea0b0n;
  var uvRatio = (u, v) => {
    const v3 = modP(v * modP(v * v));
    const v7 = modP(modP(v3 * v3) * v);
    const pow = pow_2_252_3(modP(u * v7));
    let x = modP(u * modP(v3 * pow));
    const vx2 = modP(v * modP(x * x));
    const root1 = x;
    const root2 = modP(x * RM1);
    const useRoot1 = vx2 === u;
    const useRoot2 = vx2 === mod(-u);
    const noRoot = vx2 === mod(-u * RM1);
    if (useRoot1)
      x = root1;
    if (useRoot2 || noRoot)
      x = root2;
    if ((mod(x) & 1n) === 1n)
      x = mod(-x);
    return { isValid: useRoot1 || useRoot2, value: x };
  };
  var modL_LE = (hash) => modN(bytesToNumberLE(hash));
  var hashedToExtK = (hashed) => {
    const copy = snapshotBytes(hashed);
    const head = copy.slice(0, 32);
    head[0] &= 248;
    head[31] &= 127;
    head[31] |= 64;
    const prefix = copy.slice(32);
    const scalar = modL_LE(head);
    const point = G.multiply(scalar);
    const pointBytes = point.toBytes();
    return { head, prefix, scalar, point, pointBytes };
  };
  var getExtendedPublicKeyAsync = (secretKey) => callHashAsync("sha512Async", abytes(secretKey, LEN, "secretKey")).then(hashedToExtK);
  var getPublicKeyAsync = (secretKey) => getExtendedPublicKeyAsync(secretKey).then((p) => p.pointBytes);
  var hashFinishAsync = async (res) => res[1](await callHashAsync("sha512Async", res[0]));
  var _sign = (e, rBytes, msg) => {
    const { pointBytes: A, scalar: s } = e;
    const r = modL_LE(rBytes);
    const R = G.multiply(r).toBytes();
    const hashable = concatBytes(R, A, msg);
    const finish = (hashed) => {
      const S = modN(r + modL_LE(hashed) * s);
      return abytes(concatBytes(R, numTo32bLE(S)), 64);
    };
    return [hashable, finish];
  };
  var signAsync = async (message, secretKey) => {
    const m = snapshotBytes(message, "message");
    const e = await getExtendedPublicKeyAsync(secretKey);
    return hashFinishAsync(_sign(e, await callHashAsync("sha512Async", e.prefix, m), m));
  };
  var getZip215 = (options) => {
    if (options === null || typeof options !== "object")
      throw new TypeError("expected valid options object");
    return options.zip215 ?? true;
  };
  var _verify = (sig, msg, publicKey, options) => {
    sig = abytes(sig, 64, "signature");
    msg = abytes(msg, void 0, "message");
    publicKey = abytes(publicKey, LEN, "publicKey");
    const zip215 = getZip215(options);
    const r = sig.subarray(0, LEN);
    const s = bytesToNumberLE(sig.subarray(LEN, 64));
    let A, R, SB;
    let hashable = Uint8Array.of();
    let finished = false;
    try {
      A = Point.fromBytes(publicKey, zip215);
      R = Point.fromBytes(r, zip215);
      SB = G.multiply(s, false);
      hashable = concatBytes(r, publicKey, msg);
      finished = true;
    } catch (error) {
    }
    const finish = (hashed) => {
      if (!finished)
        return false;
      if (!zip215 && A.isSmallOrder())
        return false;
      const k = modL_LE(hashed);
      const RkA = R.add(A.multiply(k, false));
      return RkA.subtract(SB).clearCofactor().is0();
    };
    return [hashable, finish];
  };
  var verifyAsync = async (signature, message, publicKey, opts = {}) => hashFinishAsync(_verify(signature, message, publicKey, opts));
  var etc = /* @__PURE__ */ freeze({
    bytesToHex,
    hexToBytes,
    concatBytes,
    mod,
    invert,
    randomBytes
  });
  var hashes = {
    sha512Async: async (message) => {
      const s = globalThis?.crypto?.subtle;
      if (!s)
        throw new Error("crypto.subtle must be defined, consider polyfill");
      return new Uint8Array(await s.digest("SHA-512", concatBytes(message)));
    },
    sha512: void 0
  };
  var precompute = () => {
    const points = [];
    let p = G;
    let b;
    for (let w = 0; w < 33; w++) {
      b = p;
      points.push(b);
      for (let i = 1; i < 128; i++) {
        b = b.add(p);
        points.push(b);
      }
      p = b.double();
    }
    return points;
  };
  var Gpows = void 0;
  var ctneg = (cnd, p) => {
    const n = p.negate();
    return cnd ? n : p;
  };
  var wNAF = (n) => {
    const comp = Gpows || (Gpows = precompute());
    let p = I;
    let f = G;
    for (let w = 0; w < 33; w++) {
      let wbits = Number(n & 255n);
      n >>= 8n;
      if (wbits > 128) {
        wbits -= 256;
        n += 1n;
      }
      const off = w * 128;
      const offP = off + Math.abs(wbits) - 1;
      const isOddW = w % 2 !== 0;
      const isNeg = wbits < 0;
      if (wbits === 0) {
        f = f.add(ctneg(isOddW, comp[off]));
      } else {
        p = p.add(ctneg(isNeg, comp[offP]));
      }
    }
    if (n !== 0n)
      throw new Error("invalid wnaf");
    return { p, f };
  };

  // node_modules/@noble/hashes/_u64.js
  var U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
  var _32n = /* @__PURE__ */ BigInt(32);
  function fromBig(n, le = false) {
    if (le)
      return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
    return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
  }
  function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const { h, l } = fromBig(lst[i], le);
      [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
  }
  var fromNumH = (n) => n / 2 ** 32 | 0;
  var fromNumL = (n) => n >>> 0;
  function setU64FromNum(view, byteOffset, n, isLE) {
    const h = fromNumH(n);
    const l = fromNumL(n);
    view.setUint32(byteOffset, isLE ? l : h, isLE);
    view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
  }
  var shrSH = (h, _l, s) => h >>> s;
  var shrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
  var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
  var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
  function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
  }
  var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
  var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
  var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
  var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
  var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
  var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

  // node_modules/@noble/hashes/utils.js
  function isBytes2(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  var atitle = (title) => title ? `"${title}" ` : "";
  function anumber(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes2(value, length, title = "") {
    if (isBytes2(value) && (length === void 0 || value.length === length))
      return value;
    if (length !== void 0)
      anumber(length, "length");
    const bytes = isBytes2(value);
    const ofLen = length !== void 0 ? ` of length ${length}` : "";
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  var aobject = (value, label) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
  };
  var aopts = (value, label) => {
    aobject(value, label);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError(`"${label}" expected plain object`);
    if (Object.hasOwn(value, "__proto__"))
      throw new TypeError(`"${label}.__proto__" is not allowed`);
  };
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput(out, instance) {
    abytes2(out, void 0, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function checkOpts(defaults, opts, title = "opts") {
    aopts(defaults, "defaults");
    if (opts !== void 0)
      aopts(opts, title);
    const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== "function")
      throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, "info");
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  var oidNist = (suffix) => ({
    // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
    // Larger suffix values would need base-128 OID encoding and a different length byte.
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // node_modules/@noble/hashes/_md.js
  var HashMD = class {
    blockLen;
    outputLen;
    canXOF = false;
    padOffset;
    isLE;
    // For partial updates less than block size
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE) {
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes2(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      let processed = false;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          processed = true;
          continue;
        }
        buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
          processed = true;
        }
      }
      this.length += data.length;
      if (processed)
        this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      buffer.fill(0, pos);
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        buffer.fill(0);
      }
      setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
      this.process(view, 0);
      this.roundClean();
      const oview = out === buffer ? view : createView(out);
      const len = this.outputLen;
      const outLen = len / 4;
      const state = this.get();
      if (len % 4 || outLen > state.length)
        throw new Error("invalid outputLen");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneIntoMeta(to) {
      const { buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (pos)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    4089235720,
    3144134277,
    2227873595,
    1013904242,
    4271175723,
    2773480762,
    1595750129,
    1359893119,
    2917565137,
    2600822924,
    725511199,
    528734635,
    4215389547,
    1541459225,
    327033209
  ]);

  // node_modules/@noble/hashes/sha2.js
  var K512 = /* @__PURE__ */ (() => split([
    "0x428a2f98d728ae22",
    "0x7137449123ef65cd",
    "0xb5c0fbcfec4d3b2f",
    "0xe9b5dba58189dbbc",
    "0x3956c25bf348b538",
    "0x59f111f1b605d019",
    "0x923f82a4af194f9b",
    "0xab1c5ed5da6d8118",
    "0xd807aa98a3030242",
    "0x12835b0145706fbe",
    "0x243185be4ee4b28c",
    "0x550c7dc3d5ffb4e2",
    "0x72be5d74f27b896f",
    "0x80deb1fe3b1696b1",
    "0x9bdc06a725c71235",
    "0xc19bf174cf692694",
    "0xe49b69c19ef14ad2",
    "0xefbe4786384f25e3",
    "0x0fc19dc68b8cd5b5",
    "0x240ca1cc77ac9c65",
    "0x2de92c6f592b0275",
    "0x4a7484aa6ea6e483",
    "0x5cb0a9dcbd41fbd4",
    "0x76f988da831153b5",
    "0x983e5152ee66dfab",
    "0xa831c66d2db43210",
    "0xb00327c898fb213f",
    "0xbf597fc7beef0ee4",
    "0xc6e00bf33da88fc2",
    "0xd5a79147930aa725",
    "0x06ca6351e003826f",
    "0x142929670a0e6e70",
    "0x27b70a8546d22ffc",
    "0x2e1b21385c26c926",
    "0x4d2c6dfc5ac42aed",
    "0x53380d139d95b3df",
    "0x650a73548baf63de",
    "0x766a0abb3c77b2a8",
    "0x81c2c92e47edaee6",
    "0x92722c851482353b",
    "0xa2bfe8a14cf10364",
    "0xa81a664bbc423001",
    "0xc24b8b70d0f89791",
    "0xc76c51a30654be30",
    "0xd192e819d6ef5218",
    "0xd69906245565a910",
    "0xf40e35855771202a",
    "0x106aa07032bbd1b8",
    "0x19a4c116b8d2d0c8",
    "0x1e376c085141ab53",
    "0x2748774cdf8eeb99",
    "0x34b0bcb5e19b48a8",
    "0x391c0cb3c5c95a63",
    "0x4ed8aa4ae3418acb",
    "0x5b9cca4f7763e373",
    "0x682e6ff3d6b2b8a3",
    "0x748f82ee5defb2fc",
    "0x78a5636f43172f60",
    "0x84c87814a1f0ab72",
    "0x8cc702081a6439ec",
    "0x90befffa23631e28",
    "0xa4506cebde82bde9",
    "0xbef9a3f7b2c67915",
    "0xc67178f2e372532b",
    "0xca273eceea26619c",
    "0xd186b8c721c0c207",
    "0xeada7dd6cde0eb1e",
    "0xf57d4f7fee6ed178",
    "0x06f067aa72176fba",
    "0x0a637dc5a2c898a6",
    "0x113f9804bef90dae",
    "0x1b710b35131c471b",
    "0x28db77f523047d84",
    "0x32caab7b40c72493",
    "0x3c9ebe0a15c9bebc",
    "0x431d67c49c100d4c",
    "0x4cc5d4becb3e42b6",
    "0x597f299cfc657e2a",
    "0x5fcb6fab3ad6faec",
    "0x6c44198c4a475817"
  ].map((n) => BigInt(n))))();
  var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
  var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
  var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
  var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
  var SHA2_64B = class extends HashMD {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // h -- high 32 bits, l -- low 32 bits
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and slows hashing down (measured on sha256).
    Ah = 0;
    Al = 0;
    Bh = 0;
    Bl = 0;
    Ch = 0;
    Cl = 0;
    Dh = 0;
    Dl = 0;
    Eh = 0;
    El = 0;
    Fh = 0;
    Fl = 0;
    Gh = 0;
    Gl = 0;
    Hh = 0;
    Hl = 0;
    constructor(outputLen, IV) {
      super(128, outputLen, 16, false);
      this.Ah = IV[0] | 0;
      this.Al = IV[1] | 0;
      this.Bh = IV[2] | 0;
      this.Bl = IV[3] | 0;
      this.Ch = IV[4] | 0;
      this.Cl = IV[5] | 0;
      this.Dh = IV[6] | 0;
      this.Dl = IV[7] | 0;
      this.Eh = IV[8] | 0;
      this.El = IV[9] | 0;
      this.Fh = IV[10] | 0;
      this.Fl = IV[11] | 0;
      this.Gh = IV[12] | 0;
      this.Gl = IV[13] | 0;
      this.Hh = IV[14] | 0;
      this.Hl = IV[15] | 0;
    }
    // prettier-ignore
    get() {
      const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
      this.Ah = Ah | 0;
      this.Al = Al | 0;
      this.Bh = Bh | 0;
      this.Bl = Bl | 0;
      this.Ch = Ch | 0;
      this.Cl = Cl | 0;
      this.Dh = Dh | 0;
      this.Dl = Dl | 0;
      this.Eh = Eh | 0;
      this.El = El | 0;
      this.Fh = Fh | 0;
      this.Fl = Fl | 0;
      this.Gh = Gh | 0;
      this.Gl = Gl | 0;
      this.Hh = Hh | 0;
      this.Hl = Hl | 0;
    }
    _cloneInto(to) {
      (to ||= new this.constructor()).set(...this.get());
      return this._cloneIntoMeta(to);
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4) {
        SHA512_W_H[i] = view.getUint32(offset);
        SHA512_W_L[i] = view.getUint32(offset += 4);
      }
      for (let i = 16; i < 80; i++) {
        const W15h = SHA512_W_H[i - 15] | 0;
        const W15l = SHA512_W_L[i - 15] | 0;
        const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
        const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
        const W2h = SHA512_W_H[i - 2] | 0;
        const W2l = SHA512_W_L[i - 2] | 0;
        const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
        const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
        const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
        const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
        SHA512_W_H[i] = SUMh | 0;
        SHA512_W_L[i] = SUMl | 0;
      }
      let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      for (let i = 0; i < 80; i++) {
        const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
        const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
        const CHIh = Eh & Fh ^ ~Eh & Gh;
        const CHIl = El & Fl ^ ~El & Gl;
        const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
        const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
        const T1l = T1ll | 0;
        const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
        const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
        const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
        const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
        Hh = Gh | 0;
        Hl = Gl | 0;
        Gh = Fh | 0;
        Gl = Fl | 0;
        Fh = Eh | 0;
        Fl = El | 0;
        ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
        Dh = Ch | 0;
        Dl = Cl | 0;
        Ch = Bh | 0;
        Cl = Bl | 0;
        Bh = Ah | 0;
        Bl = Al | 0;
        const All = add3L(T1l, sigma0l, MAJl);
        Ah = add3H(All, T1h, sigma0h, MAJh);
        Al = All | 0;
      }
      ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
      ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
      ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
      ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
      ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
      ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
      ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
      ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
      this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
      clean(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
      this.destroyed = true;
      clean(this.buffer);
      this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  };
  var _SHA512 = class extends SHA2_64B {
    constructor() {
      super(64, SHA512_IV);
    }
  };
  var sha512 = /* @__PURE__ */ createHasher(
    () => new _SHA512(),
    /* @__PURE__ */ oidNist(3)
  );

  // scripts/bundle-issuer-ed25519.mjs
  hashes.sha512 = (...msgs) => sha512(etc.concatBytes(...msgs));
  globalThis.nobleEd25519 = {
    signAsync: (...args) => signAsync(...args),
    verifyAsync: (...args) => verifyAsync(...args),
    getPublicKeyAsync: (...args) => getPublicKeyAsync(...args),
    etc
  };
})();
/*! Bundled license information:

@noble/ed25519/index.js:
  (*! noble-ed25519 - MIT License (c) 2019 Paul Miller (paulmillr.com) *)
*/
