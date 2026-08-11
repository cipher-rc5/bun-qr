export type Point = { x: number, y: number };
export type Size = { height: number, width: number };
export type Image = Size & { data: Uint8Array | Uint8ClampedArray | number[] };

type DrawValue = boolean | undefined;
type DrawFn = DrawValue | ((c: Point, curr: DrawValue) => DrawValue);
type ReadFn = (c: Point, curr: DrawValue) => void;

const ch_codes = { newline: 10, reset: 27 };

/**
 * Maximum pixel area (width × height) for raster output methods (to_gif, to_image).
 * Guards against excessive memory allocation from large version + scale combinations.
 * At scale 1, version 40 QR codes are 177×177 = 31,329 pixels — well within this limit.
 */
export const MAX_QR_PIXELS = 16_000_000; // 4000×4000

function mod(a: number, b: number): number {
  const result = a % b;
  return result >= 0 ? result : b + result;
}

function fill_arr<T>(length: number, val: T): T[] {
  return new Array(length).fill(val);
}

/**
 * LZW encoder for GIF output (2-color images only: pixel values 0 or 1).
 *
 * Implements GIF LZW compression per the Compuserve GIF89a spec with minimum
 * code size = 2 (the GIF-mandated minimum). Bit-packs codes LSB-first into
 * output bytes and handles table-full resets at the 4096-code limit.
 */
function lzw_encode_gif(pixels: readonly number[]): number[] {
  const MIN_CODE_SIZE = 2;
  const CLEAR_CODE = 1 << MIN_CODE_SIZE; // 4
  const EOI_CODE = CLEAR_CODE + 1; // 5
  const MAX_CODE = 4096;

  // Dictionary keyed by (prefix * 2 + symbol). For 2-color images, symbol ∈ {0,1}.
  // Max key = (MAX_CODE-1)*2 + 1 = 8191, so size 8192 covers the full range.
  const dict = new Int16Array(8192).fill(-1);

  let code_size = MIN_CODE_SIZE + 1; // 3 bits initially
  let next_code = EOI_CODE + 1; // 6

  const out: number[] = [];
  let bit_buf = 0;
  let bit_count = 0;

  const write_code = (code: number): void => {
    bit_buf |= code << bit_count;
    bit_count += code_size;
    while (bit_count >= 8) {
      out.push(bit_buf & 0xff);
      bit_buf >>>= 8;
      bit_count -= 8;
    }
  };

  const reset_dict = (): void => {
    dict.fill(-1);
    code_size = MIN_CODE_SIZE + 1;
    next_code = EOI_CODE + 1;
  };

  write_code(CLEAR_CODE);

  if (pixels.length === 0) {
    write_code(EOI_CODE);
    if (bit_count > 0) out.push(bit_buf & 0xff);
    return out;
  }

  let prefix = pixels[0]!;

  for (let i = 1;i < pixels.length;i++) {
    const sym = pixels[i]!; // 0 or 1
    const key = (prefix << 1) | sym;
    const found = dict[key];

    if (found !== -1) {
      prefix = found;
    } else {
      write_code(prefix);
      if (next_code < MAX_CODE) {
        dict[key] = next_code++;
        // Increase code size before the next code overflows current bit width
        if (next_code >= (1 << code_size) && code_size < 12) code_size++;
      } else {
        // Table full: emit clear code and reset dictionary
        write_code(CLEAR_CODE);
        reset_dict();
      }
      prefix = sym;
    }
  }

  write_code(prefix);
  write_code(EOI_CODE);
  if (bit_count > 0) out.push(bit_buf & 0xff);

  return out;
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
    const data: DrawValue[][] = [];
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

  /**
   * Normalize a coordinate to an in-bounds `{x, y}` pair.
   *
   * Negative coordinates address from the far edge (Python-style): `x = -1` is the last
   * column, `x = -width` is the first. This is relied upon by the layout code, which embeds
   * the top-right/bottom-left finder patterns via `{ x: -finder.width, y: 0 }`.
   *
   * Coordinates outside `[-dimension, dimension - 1]` are rejected rather than silently
   * wrapped, so an out-of-range index surfaces as an error instead of corrupting the bitmap.
   */
  private xy(c: Point | number) {
    if (typeof c === 'number') c = { x: c, y: c };
    if (!Number.isSafeInteger(c.x)) throw new Error(`Bitmap: invalid x=${c.x}`);
    if (!Number.isSafeInteger(c.y)) throw new Error(`Bitmap: invalid y=${c.y}`);
    if (c.x < -this.width || c.x >= this.width) {
      throw new Error(`Bitmap: x=${c.x} out of range for width=${this.width}`);
    }
    if (c.y < -this.height || c.y >= this.height) {
      throw new Error(`Bitmap: y=${c.y} out of range for height=${this.height}`);
    }
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
    if (!Number.isSafeInteger(factor) || factor < 1 || factor > 1024) {
      throw new Error(`invalid scale factor: ${factor}. Expected number [1..1024]`);
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

  /**
   * Render the bitmap as a GIF image using LZW compression (GIF87a, 2-color palette).
   * @throws if the pixel area exceeds MAX_QR_PIXELS
   */
  to_gif(): Uint8Array {
    const { width, height } = this;
    const total_pixels = width * height;
    if (total_pixels > MAX_QR_PIXELS) {
      throw new Error(
        `QR output too large: ${width}×${height} = ${total_pixels} pixels. Maximum is ${MAX_QR_PIXELS}. Reduce scale or version.`
      );
    }

    // Collect pixels: 0 = white (background), 1 = black (dark module)
    const pixels: number[] = [];
    this.rect_read(0, Infinity, (_, cur) => pixels.push(cur === true ? 1 : 0));

    const lzw_data = lzw_encode_gif(pixels);

    const u16_le = (i: number): number[] => [i & 0xff, (i >>> 8) & 0xff];
    const dims = [...u16_le(width), ...u16_le(height)];

    // GIF87a header + logical screen descriptor (2-color global palette)
    const header: number[] = [
      0x47,
      0x49,
      0x46,
      0x38,
      0x37,
      0x61, // "GIF87a"
      ...dims,
      0x80, // GCT flag=1, color resolution=0, sort=0, GCT size=0 (→ 2 colors)
      0x00, // background color index
      0x00, // pixel aspect ratio (no info)
      0xff,
      0xff,
      0xff, // color 0 = white
      0x00,
      0x00,
      0x00 // color 1 = black
    ];

    // Image descriptor
    const image_desc: number[] = [
      0x2c, // image separator
      0x00,
      0x00,
      0x00,
      0x00, // left=0, top=0
      ...dims,
      0x00 // local color table flag=0, interlaced=0
    ];

    // LZW image data: min code size byte + sub-blocks (max 255 bytes each) + terminator
    const image_data: number[] = [0x02]; // minimum LZW code size = 2
    for (let i = 0;i < lzw_data.length;i += 255) {
      const chunk = lzw_data.slice(i, i + 255);
      image_data.push(chunk.length, ...chunk);
    }
    image_data.push(0x00); // block terminator

    return new Uint8Array([...header, ...image_desc, ...image_data, 0x3b]); // 0x3b = GIF trailer
  }

  /**
   * Render the bitmap as raw RGB or RGBA image data.
   * @throws if the pixel area exceeds MAX_QR_PIXELS
   */
  to_image(is_rgb = false): Image {
    const { height, width } = this.size();
    const total_pixels = width * height;
    if (total_pixels > MAX_QR_PIXELS) {
      throw new Error(
        `QR output too large: ${width}×${height} = ${total_pixels} pixels. Maximum is ${MAX_QR_PIXELS}. Reduce scale or version.`
      );
    }
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
