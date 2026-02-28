export type Point = { x: number, y: number };
export type Size = { height: number, width: number };
export type Image = Size & { data: Uint8Array | Uint8ClampedArray | number[] };

type DrawValue = boolean | undefined;
type DrawFn = DrawValue | ((c: Point, curr: DrawValue) => DrawValue);
type ReadFn = (c: Point, curr: DrawValue) => void;

const ch_codes = { newline: 10, reset: 27 };

function mod(a: number, b: number): number {
  const result = a % b;
  return result >= 0 ? result : b + result;
}

function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
}

export class Bitmap {
  private static size(size: Size | number, limit?: Size) {
    if (typeof size === 'number') size = { height: size, width: size };
    if (!Number.isSafeInteger(size.height) && size.height !== Infinity) {
      throw new Error(`Bitmap: invalid height=${size.height} (${typeof size.height})`);
    }
    if (!Number.isSafeInteger(size.width) && size.width !== Infinity) {
      throw new Error(`Bitmap: invalid width=${size.width} (${typeof size.width})`);
    }
    if (limit !== undefined) {
      size = { width: Math.min(size.width, limit.width), height: Math.min(size.height, limit.height) };
    }
    return size;
  }

  static from_string(s: string): Bitmap {
    s = s.replace(/^\n+/g, '').replace(/\n+$/g, '');
    const lines = s.split(String.fromCharCode(ch_codes.newline));
    const height = lines.length;
    const data = new Array(height);
    let width: number | undefined;
    for (const line of lines) {
      const row = line.split('').map((i) => {
        if (i === 'X') return true;
        if (i === ' ') return false;
        if (i === '?') return undefined;
        throw new Error(`Bitmap.from_string: unknown symbol=${i}`);
      });
      if (width && row.length !== width) {
        throw new Error(`Bitmap.from_string different row sizes: width=${width} cur=${row.length}`);
      }
      width = row.length;
      data.push(row);
    }
    if (!width) width = 0;
    return new Bitmap({ height, width }, data);
  }

  data: DrawValue[][];
  height: number;
  width: number;

  constructor (size: Size | number, data?: DrawValue[][]) {
    const { height, width } = Bitmap.size(size);
    this.data = data || Array.from({ length: height }, () => fill_arr(width, undefined));
    this.height = height;
    this.width = width;
  }

  point(p: Point): DrawValue {
    return this.data[p.y][p.x];
  }

  is_inside(p: Point): boolean {
    return 0 <= p.x && p.x < this.width && 0 <= p.y && p.y < this.height;
  }

  size(offset?: Point | number): { height: number, width: number } {
    if (!offset) return { height: this.height, width: this.width };
    const { x, y } = this.xy(offset);
    return { height: this.height - y, width: this.width - x };
  }

  private xy(c: Point | number) {
    if (typeof c === 'number') c = { x: c, y: c };
    if (!Number.isSafeInteger(c.x)) throw new Error(`Bitmap: invalid x=${c.x}`);
    if (!Number.isSafeInteger(c.y)) throw new Error(`Bitmap: invalid y=${c.y}`);
    c.x = mod(c.x, this.width);
    c.y = mod(c.y, this.height);
    return c;
  }

  rect(c: Point | number, size: Size | number, value: DrawFn): this {
    const { x, y } = this.xy(c);
    const { height, width } = Bitmap.size(size, this.size({ x, y }));
    for (let y_pos = 0;y_pos < height;y_pos++) {
      for (let x_pos = 0;x_pos < width;x_pos++) {
        this.data[y + y_pos][x + x_pos] = typeof value === 'function' ?
          value({ x: x_pos, y: y_pos }, this.data[y + y_pos][x + x_pos]) :
          value;
      }
    }
    return this;
  }

  rect_read(c: Point | number, size: Size | number, fn: ReadFn): this {
    return this.rect(c, size, (c, cur) => {
      fn(c, cur);
      return cur;
    });
  }

  h_line(c: Point | number, len: number, value: DrawFn): this {
    return this.rect(c, { width: len, height: 1 }, value);
  }

  v_line(c: Point | number, len: number, value: DrawFn): this {
    return this.rect(c, { width: 1, height: len }, value);
  }

  border(border = 2, value: DrawValue): Bitmap {
    const height = this.height + 2 * border;
    const width = this.width + 2 * border;
    const v = fill_arr(border, value);
    const h: DrawValue[][] = Array.from({ length: border }, () => fill_arr(width, value));
    return new Bitmap({ height, width }, [...h, ...this.data.map((i) => [...v, ...i, ...v]), ...h]);
  }

  embed(c: Point | number, bm: Bitmap): this {
    return this.rect(c, bm.size(), ({ x, y }) => bm.data[y][x]);
  }

  rect_slice(c: Point | number, size: Size | number = this.size()): Bitmap {
    const rect = new Bitmap(Bitmap.size(size, this.size(this.xy(c))));
    this.rect(c, size, ({ x, y }, cur) => (rect.data[y][x] = cur));
    return rect;
  }

  inverse(): Bitmap {
    const { height, width } = this;
    const res = new Bitmap({ height: width, width: height });
    return res.rect({ x: 0, y: 0 }, Infinity, ({ x, y }) => this.data[x][y]);
  }

  scale(factor: number): Bitmap {
    if (!Number.isSafeInteger(factor) || factor > 1024) {
      throw new Error(`invalid scale factor: ${factor}`);
    }
    const { height, width } = this;
    const res = new Bitmap({ height: factor * height, width: factor * width });
    return res.rect({ x: 0, y: 0 }, Infinity, ({ x, y }) => this.data[Math.floor(y / factor)][Math.floor(x / factor)]);
  }

  clone(): Bitmap {
    const res = new Bitmap(this.size());
    return res.rect({ x: 0, y: 0 }, this.size(), ({ x, y }) => this.data[y][x]);
  }

  assert_drawn(): void {
    this.rect_read(0, Infinity, (_, cur) => {
      if (typeof cur !== 'boolean') throw new Error(`Invalid color type=${typeof cur}`);
    });
  }

  to_string(): string {
    return this.data.map((i) => i.map((j) => (j === undefined ? '?' : j ? 'X' : ' ')).join('')).join(String.fromCharCode(ch_codes.newline));
  }

  to_ascii(): string {
    const { height, width, data } = this;
    let out = '';
    for (let y = 0;y < height;y += 2) {
      for (let x = 0;x < width;x++) {
        const first = data[y][x];
        const second = y + 1 >= height ? true : data[y + 1][x];
        if (!first && !second) out += '█';
        else if (!first && second) out += '▀';
        else if (first && !second) out += '▄';
        else if (first && second) out += ' ';
      }
      out += String.fromCharCode(ch_codes.newline);
    }
    return out;
  }

  to_term(): string {
    const cc = String.fromCharCode(ch_codes.reset);
    const reset = cc + '[0m';
    const white_bg = cc + '[1;47m  ' + reset;
    const dark_bg = cc + '[40m  ' + reset;
    return this.data.map((i) => i.map((j) => (j ? dark_bg : white_bg)).join('')).join(String.fromCharCode(ch_codes.newline));
  }

  to_svg(optimize = true): string {
    let out = `<svg viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">`;
    let path_data = '';
    let prev_point: Point | undefined;

    this.rect_read(0, Infinity, (point, val) => {
      if (!val) return;
      const { x, y } = point;

      if (!optimize) {
        out += `<rect x="${x}" y="${y}" width="1" height="1" />`;
        return;
      }

      let m = `M${x} ${y}`;
      if (prev_point) {
        const rel_m = `m${x - prev_point.x} ${y - prev_point.y}`;
        if (rel_m.length <= m.length) m = rel_m;
      }

      const b_h = x < 10 ? `H${x}` : 'h-1';
      path_data += `${m}h1v1${b_h}Z`;
      prev_point = point;
    });

    if (optimize) out += `<path d="${path_data}"/>`;
    out += '</svg>';
    return out;
  }

  to_gif(): Uint8Array {
    const u16_le = (i: number) => [i & 0xff, (i >>> 8) & 0xff];
    const dims = [...u16_le(this.width), ...u16_le(this.height)];
    const data: number[] = [];
    this.rect_read(0, Infinity, (_, cur) => data.push(+(cur === true)));
    const N = 126;
    const bytes = [
      0x47,
      0x49,
      0x46,
      0x38,
      0x37,
      0x61,
      ...dims,
      0xf6,
      0x00,
      0x00,
      0xff,
      0xff,
      0xff,
      ...fill_arr(3 * 127, 0x00),
      0x2c,
      0x00,
      0x00,
      0x00,
      0x00,
      ...dims,
      0x00,
      0x07
    ];
    const full_chunks = Math.floor(data.length / N);
    for (let i = 0;i < full_chunks;i++) {
      bytes.push(N + 1, 0x80, ...data.slice(N * i, N * (i + 1)).map((i) => +i));
    }
    bytes.push((data.length % N) + 1, 0x80, ...data.slice(full_chunks * N).map((i) => +i));
    bytes.push(0x01, 0x81, 0x00, 0x3b);
    return new Uint8Array(bytes);
  }

  to_image(is_rgb = false): Image {
    const { height, width } = this.size();
    const data = new Uint8Array(height * width * (is_rgb ? 3 : 4));
    let i = 0;
    for (let y = 0;y < height;y++) {
      for (let x = 0;x < width;x++) {
        const value = !!this.data[y][x] ? 0 : 255;
        data[i++] = value;
        data[i++] = value;
        data[i++] = value;
        if (!is_rgb) data[i++] = 255;
      }
    }
    return { height, width, data };
  }
}
