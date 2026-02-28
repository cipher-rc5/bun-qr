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
      if (i < block.length) result[idx++] = block[i];
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
  exp: (x: number) => GF.tables.exp[x],
  log(x: number) {
    if (x === 0) throw new Error(`GF.log: invalid arg=${x}`);
    return GF.tables.log[x] % 255;
  },
  mul(x: number, y: number) {
    if (x === 0 || y === 0) return 0;
    return GF.tables.exp[(GF.tables.log[x] + GF.tables.log[y]) % 255];
  },
  add: (x: number, y: number) => x ^ y,
  pow: (x: number, e: number) => GF.tables.exp[(GF.tables.log[x] * e) % 255],
  inv(x: number) {
    if (x === 0) throw new Error(`GF.inverse: invalid arg=${x}`);
    return GF.tables.exp[255 - GF.tables.log[x]];
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
    const res = fill_arr(a.length + b.length - 1, 0);
    for (let i = 0;i < a.length;i++) {
      for (let j = 0;j < b.length;j++) {
        res[i + j] = GF.add(res[i + j], GF.mul(a[i], b[j]));
      }
    }
    return GF.polynomial(res);
  },
  mul_poly_scalar(a: number[], scalar: number) {
    if (scalar === 0) return [0];
    if (scalar === 1) return a;
    const res = fill_arr(a.length, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i], scalar);
    return GF.polynomial(res);
  },
  mul_poly_monomial(a: number[], degree: number, coefficient: number) {
    if (degree < 0) throw new Error('GF.mul_poly_monomial: invalid degree');
    if (coefficient === 0) return [0];
    const res = fill_arr(a.length + degree, 0);
    for (let i = 0;i < a.length;i++) res[i] = GF.mul(a[i], coefficient);
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
    for (let i = 0;i < s.length;i++) sum_diff[i] = s[i];
    for (let i = length_diff;i < larger.length;i++) {
      sum_diff[i] = GF.add(smaller[i - length_diff], larger[i]);
    }
    return GF.polynomial(sum_diff);
  },
  remainder_poly(data: number[], divisor: number[]) {
    const out = Array.from(data);
    for (let i = 0;i < data.length - divisor.length + 1;i++) {
      const elm = out[i];
      if (elm === 0) continue;
      for (let j = 1;j < divisor.length;j++) {
        if (divisor[j] !== 0) out[i + j] = GF.add(out[i + j], GF.mul(divisor[j], elm));
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
    let res = poly[0];
    for (let i = 1;i < poly.length;i++) res = GF.add(GF.mul(a, res), poly[i]);
    return res;
  },
  euclidian(a: number[], b: number[], R: number) {
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
      if (r_last[0] === 0) throw new Error('r_last[0] === 0');
      r = r_last_last;

      let q = [0];
      const dlt_inverse = GF.inv(r_last[0]);
      while (GF.degree(r) >= GF.degree(r_last) && r[0] !== 0) {
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
  return {
    encode(from: Uint8Array) {
      const d = GF.divisor_poly(ecc_words);
      const pol = Array.from(from);
      pol.push(...d.slice(0, -1).fill(0));
      return Uint8Array.from(GF.remainder_poly(pol, d));
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
        const pos = res.length - 1 - GF.log(locations[i]);
        if (pos < 0) throw new Error('RS.decode: invalid error location');
        const xi_inverse = GF.inv(locations[i]);
        let denominator = 1;
        for (let j = 0;j < locations.length;j++) {
          if (i === j) continue;
          denominator = GF.mul(denominator, GF.add(1, GF.mul(locations[j], xi_inverse)));
        }
        res[pos] = GF.add(res[pos], GF.mul(GF.eval_poly(error_evaluator, xi_inverse), GF.inv(denominator)));
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

      let pos = 0;
      for (let i = 0;i < block_len;i++) {
        for (let j = 0;j < num_blocks;j++) blocks[j][i] = data[pos++];
      }
      for (let j = short_blocks;j < num_blocks;j++) blocks[j][block_len] = data[pos++];
      for (let i = block_len;i < block_len + words;i++) {
        for (let j = 0;j < num_blocks;j++) {
          const is_short = j < short_blocks;
          blocks[j][i + (is_short ? 0 : 1)] = data[pos++];
        }
      }
      const res: number[] = [];
      for (const block of blocks) res.push(...Array.from(rs.decode(block)).slice(0, -words));
      return Uint8Array.from(res);
    }
  };
}
