type Coder<F, T> = { encode(from: F): T, decode(to: T): F };

export type CapacityInfo = { words: number, short_blocks: number, num_blocks: number, block_len: number, total: number };

function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
}

function interleave_bytes(blocks: Uint8Array[]): Uint8Array {
  let max_len = 0;
  let total_len = 0;
  for (const block of blocks) {
    max_len = Math.max(max_len, block.length);
    total_len += block.length;
  }

  const result = new Uint8Array(total_len);
  let idx = 0;
  for (let i = 0;i < max_len;i++) {
    for (const block of blocks) {
      // Guarded by `i < block.length`, so the read always resolves.
      if (i < block.length) result[idx++] = block[i] ?? 0;
    }
  }

  return result;
}

const GF = {
  tables: ((p_poly: number) => {
    const exp = fill_arr(256, 0);
    const log = fill_arr(256, 0);
    for (let i = 0, x = 1;i < 256;i++) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= p_poly;
    }
    return { exp, log };
  })(0x11d),
  /** Read GF.tables.exp[i], rejecting out-of-range indices instead of yielding undefined/NaN. */
  read_exp(i: number) {
    const v = GF.tables.exp[i];
    if (v === undefined) throw new Error(`GF.exp: index out of range=${i}`);
    return v;
  },
  /** Read GF.tables.log[i], rejecting out-of-range indices instead of yielding undefined/NaN. */
  read_log(i: number) {
    const v = GF.tables.log[i];
    if (v === undefined) throw new Error(`GF.log: index out of range=${i}`);
    return v;
  },
  exp: (x: number) => GF.read_exp(x),
  log(x: number) {
    if (x === 0) throw new Error(`GF.log: invalid arg=${x}`);
    return GF.read_log(x) % 255;
  },
  mul(x: number, y: number) {
    if (x === 0 || y === 0) return 0;
    return GF.read_exp((GF.read_log(x) + GF.read_log(y)) % 255);
  },
  add: (x: number, y: number) => x ^ y,
  pow: (x: number, e: number) => GF.read_exp((GF.read_log(x) * e) % 255),
  inv(x: number) {
    if (x === 0) throw new Error(`GF.inverse: invalid arg=${x}`);
    return GF.read_exp(255 - GF.read_log(x));
  },
  polynomial(poly: number[]) {
    if (poly.length === 0) throw new Error('GF.polymomial: invalid length');
    if (poly[0] !== 0) return poly;
    let i = 0;
    for (;i < poly.length - 1 && poly[i] === 0;i++);
    return poly.slice(i);
  },
  monomial(degree: number, coefficient: number) {
    if (degree < 0) throw new Error(`GF.monomial: invalid degree=${degree}`);
    if (coefficient === 0) return [0];
    const coefficients = fill_arr(degree + 1, 0);
    coefficients[0] = coefficient;
    return GF.polynomial(coefficients);
  },
  degree: (a: readonly number[]) => a.length - 1,
  coefficient: (a: readonly number[], degree: number) => a[GF.degree(a) - degree] ?? 0,
  mul_poly(a: number[], b: number[]) {
    if (a[0] === 0 || b[0] === 0) return [0];
    // Every index below is bounded by the corresponding array's own length, and `res` is
    // sized to cover i+j, so each `?? 0` is unreachable. 0 is also GF's additive identity,
    // so it is the correct neutral value even if one were ever taken.
    const res = fill_arr(a.length + b.length - 1, 0);
    for (let i = 0;i < a.length;i++) {
      for (let j = 0;j < b.length;j++) {
        res[i + j] = GF.add(res[i + j] ?? 0, GF.mul(a[i] ?? 0, b[j] ?? 0));
      }
    }
    return GF.polynomial(res);
  },
  mul_poly_scalar(a: number[], scalar: number) {
    if (scalar === 0) return [0];
    if (scalar === 1) return a;
    const res = fill_arr(a.length, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i] ?? 0, scalar);
    return GF.polynomial(res);
  },
  mul_poly_monomial(a: number[], degree: number, coefficient: number) {
    if (degree < 0) throw new Error('GF.mul_poly_monomial: invalid degree');
    if (coefficient === 0) return [0];
    const res = fill_arr(a.length + degree, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i] ?? 0, coefficient);
    return GF.polynomial(res);
  },
  add_poly(a: number[], b: number[]) {
    if (a[0] === 0) return b;
    if (b[0] === 0) return a;
    let smaller = a;
    let larger = b;
    if (smaller.length > larger.length) [smaller, larger] = [larger, smaller];
    const sum_diff = fill_arr(larger.length, 0);
    const length_diff = larger.length - smaller.length;
    const s = larger.slice(0, length_diff);
    for (let i = 0;i < s.length;i++) sum_diff[i] = s[i] ?? 0;
    for (let i = length_diff;i < larger.length;i++) {
      // i ranges over [length_diff, larger.length), so i - length_diff indexes `smaller`.
      sum_diff[i] = GF.add(smaller[i - length_diff] ?? 0, larger[i] ?? 0);
    }
    return GF.polynomial(sum_diff);
  },
  remainder_poly(data: number[], divisor: number[]) {
    const out = Array.from(data);
    // i stays below data.length - divisor.length + 1 and j below divisor.length, so i+j
    // stays within `out` (length = data.length). Treating a missing/zero leading term as
    // "skip" matches the original `elm === 0` short-circuit.
    for (let i = 0;i < data.length - divisor.length + 1;i++) {
      const elm = out[i];
      if (elm === undefined || elm === 0) continue;
      for (let j = 1;j < divisor.length;j++) {
        const d = divisor[j];
        if (d !== undefined && d !== 0) out[i + j] = GF.add(out[i + j] ?? 0, GF.mul(d, elm));
      }
    }
    return out.slice(data.length - divisor.length + 1, out.length);
  },
  divisor_poly(degree: number) {
    let g = [1];
    for (let i = 0;i < degree;i++) g = GF.mul_poly(g, [1, GF.pow(2, i)]);
    return g;
  },
  eval_poly(poly: readonly number[], a: number) {
    if (a === 0) return GF.coefficient(poly, 0);
    // Polynomials reaching here come from GF.polynomial, which rejects empty input, so
    // poly[0] exists. 0 is the additive identity and matches `coefficient`'s own fallback.
    let res = poly[0] ?? 0;
    for (let i = 1;i < poly.length;i++) res = GF.add(GF.mul(a, res), poly[i] ?? 0);
    return res;
  },
  /**
   * Extended Euclidean algorithm over GF(2^8), used for Berlekamp-Welch error correction.
   *
   * Computes the error locator polynomial σ(x) and error evaluator polynomial Ω(x) from the
   * syndrome polynomial. The parameter R is the number of ECC codewords; the algorithm
   * terminates when deg(r) < R/2, yielding [σ, Ω] normalized so that σ(0) = 1.
   *
   * Reference: ISO/IEC 18004:2015 Annex A; Berlekamp-Welch decoding algorithm.
   */
  euclidian(a: number[], b: number[], R: number): [number[], number[]] {
    if (GF.degree(a) < GF.degree(b)) [a, b] = [b, a];
    let r_last = a;
    let r = b;
    let t_last = [0];
    let t = [1];
    while (2 * GF.degree(r) >= R) {
      const r_last_last = r_last;
      const t_last_last = t_last;
      r_last = r;
      t_last = t;
      // The leading term is read twice below; capture it once so the existing zero guard
      // also covers the empty-polynomial case rather than yielding undefined.
      const r_last_lead = r_last[0];
      if (r_last_lead === undefined || r_last_lead === 0) throw new Error('r_last[0] === 0');
      r = r_last_last;

      let q = [0];
      const dlt_inverse = GF.inv(r_last_lead);
      while (GF.degree(r) >= GF.degree(r_last) && r[0] !== undefined && r[0] !== 0) {
        const degree_diff = GF.degree(r) - GF.degree(r_last);
        const scale = GF.mul(r[0], dlt_inverse);
        q = GF.add_poly(q, GF.monomial(degree_diff, scale));
        r = GF.add_poly(r, GF.mul_poly_monomial(r_last, degree_diff, scale));
      }
      q = GF.mul_poly(q, t_last);
      t = GF.add_poly(q, t_last_last);
      if (GF.degree(r) >= GF.degree(r_last)) {
        throw new Error(`Division failed r: ${r}, r_last: ${r_last}`);
      }
    }
    const sigma_tilde_at_zero = GF.coefficient(t, 0);
    if (sigma_tilde_at_zero === 0) throw new Error('sigma_tilde(0) was zero');
    const inverse = GF.inv(sigma_tilde_at_zero);
    return [GF.mul_poly_scalar(t, inverse), GF.mul_poly_scalar(r, inverse)];
  }
};

function RS(ecc_words: number): Coder<Uint8Array, Uint8Array> {
  // The generator polynomial depends only on ecc_words, so build it once per coder
  // instead of on every encode call.
  const divisor = GF.divisor_poly(ecc_words);
  const padding = fill_arr(divisor.length - 1, 0);

  return {
    encode(from: Uint8Array) {
      const pol = Array.from(from);
      pol.push(...padding);
      return Uint8Array.from(GF.remainder_poly(pol, divisor));
    },
    decode(to: Uint8Array) {
      const res = to.slice();
      const poly = GF.polynomial(Array.from(to));
      let syndrome = fill_arr(ecc_words, 0);
      let has_error = false;
      for (let i = 0;i < ecc_words;i++) {
        const evl = GF.eval_poly(poly, GF.exp(i));
        syndrome[syndrome.length - 1 - i] = evl;
        if (evl !== 0) has_error = true;
      }
      if (!has_error) return res;
      syndrome = GF.polynomial(syndrome);
      const monomial = GF.monomial(ecc_words, 1);
      const [error_locator, error_evaluator] = GF.euclidian(monomial, syndrome, ecc_words);
      const locations = fill_arr(GF.degree(error_locator), 0);
      let e = 0;
      for (let i = 1;i < 256 && e < locations.length;i++) {
        if (GF.eval_poly(error_locator, i) === 0) locations[e++] = GF.inv(i);
      }
      if (e !== locations.length) throw new Error('RS.decode: invalid errors number');
      for (let i = 0;i < locations.length;i++) {
        // i and j are bounded by locations.length, so the reads always resolve.
        const loc = locations[i] ?? 0;
        const pos = res.length - 1 - GF.log(loc);
        // `pos < 0` is genuinely reachable on corrupt input (GF.log can exceed the
        // codeword length) and was already rejected. The upper bound is not reachable for
        // QR-sized codewords but is checked so `res[pos]` below is a total read.
        if (pos < 0 || pos >= res.length) throw new Error('RS.decode: invalid error location');
        const xi_inverse = GF.inv(loc);
        let denominator = 1;
        for (let j = 0;j < locations.length;j++) {
          if (i === j) continue;
          denominator = GF.mul(denominator, GF.add(1, GF.mul(locations[j] ?? 0, xi_inverse)));
        }
        res[pos] = GF.add(res[pos] ?? 0, GF.mul(GF.eval_poly(error_evaluator, xi_inverse), GF.inv(denominator)));
      }
      return res;
    }
  };
}

export function create_interleaver(capacity: CapacityInfo): Coder<Uint8Array, Uint8Array> {
  const { words, short_blocks, num_blocks, block_len, total } = capacity;
  const rs = RS(words);

  return {
    encode(bytes: Uint8Array) {
      const blocks: Uint8Array[] = [];
      const ecc_blocks: Uint8Array[] = [];
      for (let i = 0;i < num_blocks;i++) {
        const is_short = i < short_blocks;
        const len = block_len + (is_short ? 0 : 1);
        blocks.push(bytes.subarray(0, len));
        ecc_blocks.push(rs.encode(bytes.subarray(0, len)));
        bytes = bytes.subarray(len);
      }
      const res_blocks = interleave_bytes(blocks);
      const res_ecc = interleave_bytes(ecc_blocks);
      const res = new Uint8Array(res_blocks.length + res_ecc.length);
      res.set(res_blocks);
      res.set(res_ecc, res_blocks.length);
      return res;
    },
    decode(data: Uint8Array) {
      if (data.length !== total) {
        throw new Error(`interleave.decode: len(data)=${data.length}, total=${total}`);
      }

      const blocks: Uint8Array[] = [];
      for (let i = 0;i < num_blocks;i++) {
        const is_short = i < short_blocks;
        blocks.push(new Uint8Array(words + block_len + (is_short ? 0 : 1)));
      }

      // `blocks` was just built with exactly `num_blocks` entries and `data.length` was
      // checked against `total` above, so every j and pos below is in range. The block is
      // read into a local per iteration, which also avoids re-indexing `blocks`.
      let pos = 0;
      for (let i = 0;i < block_len;i++) {
        for (let j = 0;j < num_blocks;j++) {
          const block = blocks[j];
          if (block !== undefined) block[i] = data[pos] ?? 0;
          pos++;
        }
      }
      for (let j = short_blocks;j < num_blocks;j++) {
        const block = blocks[j];
        if (block !== undefined) block[block_len] = data[pos] ?? 0;
        pos++;
      }
      for (let i = block_len;i < block_len + words;i++) {
        for (let j = 0;j < num_blocks;j++) {
          const block = blocks[j];
          if (block !== undefined) block[i + (j < short_blocks ? 0 : 1)] = data[pos] ?? 0;
          pos++;
        }
      }
      const res: number[] = [];
      for (const block of blocks) res.push(...Array.from(rs.decode(block)).slice(0, -words));
      return Uint8Array.from(res);
    }
  };
}

// Internal exports for unit testing — do not use in application code
export const _tests = { GF, RS };
