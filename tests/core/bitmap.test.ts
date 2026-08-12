// file: tests/core/bitmap.test.ts
// description: coverage for the Bitmap model, its four renderers, and the DoS pixel guard
//
// `src/core/bitmap.ts` holds all four output renderers (SVG, GIF, ASCII, term), the
// geometry primitives (rect / lines / border / scale / embed / slice), and the
// MAX_QR_PIXELS guard that bounds raster memory allocation. This file exercises them
// directly rather than through `encode_qr`, so failures point at the renderer.

import { describe, expect, test } from 'bun:test';
import { Bitmap, MAX_QR_PIXELS } from '../../src/core/bitmap';

// ---------------------------------------------------------------------------
// Construction and from_string
// ---------------------------------------------------------------------------

describe('construction', () => {
  test('numeric size builds a square bitmap of undefined modules', () => {
    const b = new Bitmap(3);
    expect(b.width).toBe(3);
    expect(b.height).toBe(3);
    expect(b.data.length).toBe(3);
    for (const row of b.data) {
      expect(row.length).toBe(3);
      for (const cell of row) expect(cell).toBeUndefined();
    }
  });

  test('explicit Size builds a rectangular bitmap', () => {
    const b = new Bitmap({ width: 4, height: 2 });
    expect(b.width).toBe(4);
    expect(b.height).toBe(2);
    expect(b.data.length).toBe(2);
    expect(b.data[0]!.length).toBe(4);
  });

  test('non-integer dimensions are rejected', () => {
    expect(() => new Bitmap({ width: 1.5, height: 2 })).toThrow(/invalid width/);
    expect(() => new Bitmap({ width: 2, height: 1.5 })).toThrow(/invalid height/);
  });

  test('non-positive dimensions are rejected', () => {
    // Regression: only `Number.isSafeInteger` was checked, so `new Bitmap(-5)` built a
    // degenerate object reporting width=-5 and height=-5 with zero data rows, whose
    // to_string() was '' — a silent wrong answer instead of an error.
    expect(() => new Bitmap(-5)).toThrow(/invalid height=-5/);
    expect(() => new Bitmap(0)).toThrow(/invalid height=0/);
    expect(() => new Bitmap({ width: 0, height: 2 })).toThrow(/invalid width=0/);
    expect(() => new Bitmap({ width: 2, height: -1 })).toThrow(/invalid height=-1/);
  });

  test('the dimension error names the valid range', () => {
    expect(() => new Bitmap(-5)).toThrow(new RegExp(`\\[1\\.\\.${MAX_QR_PIXELS}\\]`));
  });

  test('dimensions whose area exceeds MAX_QR_PIXELS are rejected before allocating', () => {
    // Regression: a large single dimension used to allocate unboundedly — this case ran
    // past 120s before the guard existed. It must now fail fast.
    expect(() => new Bitmap({ height: 1e9, width: 2 })).toThrow(/exceeds the maximum/);
    expect(() => new Bitmap(4001)).toThrow(/16008001 modules/);
  });

  test('an area exactly at MAX_QR_PIXELS is accepted', () => {
    // 4000x4000 == MAX_QR_PIXELS and the guard uses `>`, so the boundary must pass.
    const b = new Bitmap(4000);
    expect(b.width).toBe(4000);
    expect(b.height).toBe(4000);
  });
});

describe('from_string', () => {
  test('parses X / space / ? into true / false / undefined', () => {
    const b = Bitmap.from_string('X ?\n?X ');
    expect(b.height).toBe(2);
    expect(b.width).toBe(3);
    expect(b.data[0]).toEqual([true, false, undefined]);
    expect(b.data[1]).toEqual([undefined, true, false]);
  });

  test('produces exactly `height` rows with no undefined holes in the outer array', () => {
    // Regression guard: an earlier implementation preallocated `new Array(height)` and
    // then pushed, yielding an outer array of length 2*height whose first half was
    // undefined *rows* (distinct from undefined modules). Every row must be a real array.
    const src = 'XX\n  \nXX\n ?';
    const b = Bitmap.from_string(src);
    expect(b.data.length).toBe(b.height);
    expect(b.height).toBe(4);
    for (const row of b.data) {
      expect(Array.isArray(row)).toBe(true);
      expect(row.length).toBe(b.width);
    }
    // No holes: every index is an own property.
    for (let i = 0;i < b.data.length;i++) expect(Object.hasOwn(b.data, i)).toBe(true);
  });

  test('round-trips through to_string', () => {
    const src = 'X X\n ? \nXXX';
    expect(Bitmap.from_string(src).to_string()).toBe(src);
  });

  test('leading and trailing newlines are stripped', () => {
    const b = Bitmap.from_string('\n\nXX\nXX\n\n');
    expect(b.height).toBe(2);
    expect(b.width).toBe(2);
  });

  test('ragged rows are rejected', () => {
    expect(() => Bitmap.from_string('XXX\nXX')).toThrow(/different row sizes/);
  });

  test('unknown symbols are rejected', () => {
    expect(() => Bitmap.from_string('XZX')).toThrow(/unknown symbol/);
  });
});

// ---------------------------------------------------------------------------
// Coordinate handling
// ---------------------------------------------------------------------------

describe('coordinates', () => {
  test('negative coordinates address from the far edge', () => {
    const b = new Bitmap(4).rect(0, Infinity, false);
    b.rect({ x: -1, y: -1 }, 1, true);
    expect(b.data[3]![3]).toBe(true);
  });

  test('out-of-range coordinates throw instead of silently wrapping', () => {
    const b = new Bitmap(4).rect(0, Infinity, false);
    expect(() => b.rect({ x: 4, y: 0 }, 1, true)).toThrow(/out of range/);
    expect(() => b.rect({ x: 0, y: -5 }, 1, true)).toThrow(/out of range/);
  });

  test('non-integer coordinates throw', () => {
    const b = new Bitmap(4);
    expect(() => b.rect({ x: 0.5, y: 0 }, 1, true)).toThrow(/invalid x/);
    expect(() => b.rect({ x: 0, y: 0.5 }, 1, true)).toThrow(/invalid y/);
  });

  test('is_inside reflects bounds', () => {
    const b = new Bitmap({ width: 3, height: 2 });
    expect(b.is_inside({ x: 0, y: 0 })).toBe(true);
    expect(b.is_inside({ x: 2, y: 1 })).toBe(true);
    expect(b.is_inside({ x: 3, y: 1 })).toBe(false);
    expect(b.is_inside({ x: -1, y: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

describe('rect, lines, and readers', () => {
  test('rect fills a region with a constant', () => {
    const b = new Bitmap(4).rect(0, Infinity, false);
    b.rect({ x: 1, y: 1 }, 2, true);
    expect(b.to_string()).toBe('    \n XX \n XX \n    ');
  });

  test('rect accepts a function receiving region-relative coordinates', () => {
    const b = new Bitmap(3).rect(0, Infinity, false);
    b.rect({ x: 0, y: 0 }, 3, ({ x, y }) => x === y);
    expect(b.to_string()).toBe('X  \n X \n  X');
  });

  test('rect is clipped to the bitmap when the size overflows', () => {
    const b = new Bitmap(3).rect(0, Infinity, false);
    b.rect({ x: 2, y: 2 }, 10, true); // would run past the edge
    expect(b.data[2]![2]).toBe(true);
    expect(b.height).toBe(3);
    expect(b.width).toBe(3);
  });

  test('h_line and v_line draw single-module strips', () => {
    const b = new Bitmap(3).rect(0, Infinity, false);
    b.h_line({ x: 0, y: 1 }, 3, true);
    expect(b.to_string()).toBe('   \nXXX\n   ');

    const c = new Bitmap(3).rect(0, Infinity, false);
    c.v_line({ x: 1, y: 0 }, 3, true);
    expect(c.to_string()).toBe(' X \n X \n X ');
  });

  test('rect_read observes without mutating', () => {
    const b = Bitmap.from_string('XX\n  ');
    const seen: (boolean | undefined)[] = [];
    b.rect_read(0, Infinity, (_p, cur) => seen.push(cur));
    expect(seen).toEqual([true, true, false, false]);
    expect(b.to_string()).toBe('XX\n  ');
  });

  test('assert_drawn throws while any module is undefined and passes once filled', () => {
    const b = new Bitmap(2);
    expect(() => b.assert_drawn()).toThrow(/Invalid color type/);
    b.rect(0, Infinity, false);
    expect(() => b.assert_drawn()).not.toThrow();
  });
});

describe('border, embed, slice, clone, inverse', () => {
  test('border grows the bitmap by 2*border in each dimension', () => {
    const b = Bitmap.from_string('XX\nXX').border(1, false);
    expect(b.width).toBe(4);
    expect(b.height).toBe(4);
    expect(b.to_string()).toBe('    \n XX \n XX \n    ');
  });

  test('border defaults to 2 modules', () => {
    const b = Bitmap.from_string('X').border(undefined, false);
    expect(b.width).toBe(5);
    expect(b.height).toBe(5);
  });

  test('border of 0 is a no-op in size', () => {
    const b = Bitmap.from_string('XX\nXX').border(0, false);
    expect(b.width).toBe(2);
    expect(b.height).toBe(2);
  });

  test('border rejects negative and non-integer widths', () => {
    // Regression: a negative border reached `new Array(-1)` inside fill_arr and surfaced
    // as a bare RangeError with no indication of which argument was at fault.
    const b = Bitmap.from_string('XX\nXX');
    expect(() => b.border(-1, false)).toThrow(/invalid border: -1/);
    expect(() => b.border(1.5, false)).toThrow(/invalid border: 1.5/);
    expect(() => b.border(NaN, false)).toThrow(/invalid border/);
  });

  test('border rejects a width whose resulting area exceeds MAX_QR_PIXELS', () => {
    // Regression: `border()` had no bound at all, and MAX_QR_PIXELS guarded only
    // to_gif/to_image — so the raw, ascii, term, and svg paths could allocate far past
    // the limit (border 6000 produced >144M modules, ~9x the cap). The check lives in
    // border() itself so every output path and every direct Bitmap user is covered.
    const b = Bitmap.from_string('XX\nXX');
    expect(() => b.border(20000, false)).toThrow(/exceeds the maximum/);
    expect(() => b.border(6000, false)).toThrow(/144048004 modules/);
  });

  test('border allows a large-but-legal quiet zone', () => {
    const b = Bitmap.from_string('XX\nXX').border(100, false);
    expect(b.width).toBe(202);
    expect(b.height).toBe(202);
  });

  test('border does not alias the source rows', () => {
    const src = Bitmap.from_string('XX\nXX');
    const bordered = src.border(1, false);
    bordered.rect({ x: 1, y: 1 }, 1, false);
    // Mutating the bordered copy must not reach back into the original.
    expect(src.data[0]![0]).toBe(true);
  });

  test('embed places another bitmap at an offset', () => {
    const host = new Bitmap(4).rect(0, Infinity, false);
    host.embed({ x: 1, y: 1 }, Bitmap.from_string('XX\nXX'));
    expect(host.to_string()).toBe('    \n XX \n XX \n    ');
  });

  test('rect_slice extracts a subregion', () => {
    const b = Bitmap.from_string('XX  \nXX  \n  XX\n  XX');
    const slice = b.rect_slice({ x: 2, y: 2 }, 2);
    expect(slice.to_string()).toBe('XX\nXX');
  });

  test('clone is an independent copy', () => {
    const src = Bitmap.from_string('XX\n  ');
    const copy = src.clone();
    copy.rect(0, Infinity, false);
    expect(src.to_string()).toBe('XX\n  ');
    expect(copy.to_string()).toBe('  \n  ');
  });

  test('inverse transposes the bitmap', () => {
    const b = Bitmap.from_string('XX\n  ');
    expect(b.inverse().to_string()).toBe('X \nX ');
  });
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

describe('scale', () => {
  test('scaling by n multiplies both dimensions and replicates modules', () => {
    const b = Bitmap.from_string('X \n X').scale(2);
    expect(b.width).toBe(4);
    expect(b.height).toBe(4);
    expect(b.to_string()).toBe('XX  \nXX  \n  XX\n  XX');
  });

  test('scale by 1 is identity', () => {
    const src = Bitmap.from_string('X \n X');
    expect(src.scale(1).to_string()).toBe(src.to_string());
  });

  test('scale rejects factors below 1', () => {
    // A factor of 0 or negative would produce a zero/negative-sized bitmap; the
    // guard must reject it rather than emitting a degenerate or reversed image.
    const b = Bitmap.from_string('XX\nXX');
    expect(() => b.scale(0)).toThrow(/invalid scale factor/);
    expect(() => b.scale(-1)).toThrow(/invalid scale factor/);
    expect(() => b.scale(-10)).toThrow(/invalid scale factor/);
  });

  test('scale rejects non-integer and oversized factors', () => {
    const b = Bitmap.from_string('XX\nXX');
    expect(() => b.scale(1.5)).toThrow(/invalid scale factor/);
    expect(() => b.scale(NaN)).toThrow(/invalid scale factor/);
    expect(() => b.scale(1025)).toThrow(/invalid scale factor/);
  });

  test('scale accepts the upper bound of 1024', () => {
    expect(() => new Bitmap(1).rect(0, Infinity, true).scale(1024)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

describe('to_string / to_ascii / to_term', () => {
  test('to_string renders X, space, and ?', () => {
    expect(new Bitmap(2).to_string()).toBe('??\n??');
    expect(Bitmap.from_string('X \n X').to_string()).toBe('X \n X');
  });

  test('to_ascii packs two rows per line using half-block characters', () => {
    // Row pair (dark, dark) -> ' '; (light, light) -> '█';
    // (light, dark) -> '▀'; (dark, light) -> '▄'.
    const b = Bitmap.from_string('XX\n  ');
    expect(b.to_ascii()).toBe('▄▄\n');
  });

  test('to_ascii treats a missing final row as dark', () => {
    // Odd height: the synthetic second row is `true` (dark). For the first column
    // (dark, dark) -> ' '; for the second column (light, dark) -> '▀'.
    const b = Bitmap.from_string('X ');
    expect(b.to_ascii()).toBe(' ▀\n');
  });

  test('to_ascii output has one line per two rows', () => {
    const b = new Bitmap(8).rect(0, Infinity, false);
    const lines = b.to_ascii().split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(4);
  });

  test('to_term emits ANSI background pairs, two characters per module', () => {
    const out = Bitmap.from_string('X \n X').to_term();
    const esc = String.fromCharCode(27);
    expect(out).toContain(esc + '[40m'); // dark
    expect(out).toContain(esc + '[1;47m'); // light
    expect(out).toContain(esc + '[0m'); // reset
    expect(out.split('\n').length).toBe(2);
  });
});

describe('to_svg', () => {
  test('optimized output emits a single path element', () => {
    const svg = Bitmap.from_string('X \n X').to_svg(true);
    expect(svg.startsWith('<svg viewBox="0 0 2 2"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<path d="');
    expect(svg).not.toContain('<rect');
  });

  test('unoptimized output emits one rect per dark module', () => {
    const svg = Bitmap.from_string('X \n X').to_svg(false);
    const rects = svg.match(/<rect /g) ?? [];
    expect(rects.length).toBe(2);
    expect(svg).not.toContain('<path');
  });

  test('viewBox matches the bitmap dimensions', () => {
    const svg = new Bitmap({ width: 7, height: 3 }).rect(0, Infinity, false).to_svg();
    expect(svg).toContain('viewBox="0 0 7 3"');
  });

  test('an all-light bitmap produces no drawn modules', () => {
    const svg = new Bitmap(3).rect(0, Infinity, false).to_svg(false);
    expect(svg).not.toContain('<rect');
  });

  test('every dark module of an all-dark bitmap is emitted', () => {
    const svg = new Bitmap(3).rect(0, Infinity, true).to_svg(false);
    expect((svg.match(/<rect /g) ?? []).length).toBe(9);
  });

  test('declares the SVG namespace', () => {
    expect(new Bitmap(1).rect(0, Infinity, true).to_svg()).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe('to_gif', () => {
  const gif = (b: Bitmap) => b.to_gif();

  test('emits a GIF87a header, correct dimensions, and a trailer', () => {
    const b = new Bitmap({ width: 5, height: 3 }).rect(0, Infinity, false);
    const out = gif(b);
    expect(Array.from(out.slice(0, 6))).toEqual([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // "GIF87a"
    // Logical screen width/height, little-endian u16.
    expect(out[6]! | (out[7]! << 8)).toBe(5);
    expect(out[8]! | (out[9]! << 8)).toBe(3);
    expect(out[out.length - 1]).toBe(0x3b); // trailer
  });

  test('declares a 2-colour global colour table of white then black', () => {
    const out = gif(new Bitmap(2).rect(0, Infinity, false));
    expect(out[10]).toBe(0x80); // GCT present, size 0 -> 2 entries
    expect(Array.from(out.slice(13, 16))).toEqual([0xff, 0xff, 0xff]); // colour 0 white
    expect(Array.from(out.slice(16, 19))).toEqual([0x00, 0x00, 0x00]); // colour 1 black
  });

  test('includes an image descriptor with a minimum LZW code size of 2', () => {
    const out = gif(new Bitmap(2).rect(0, Infinity, true));
    const sep = out.indexOf(0x2c);
    expect(sep).toBeGreaterThan(0);
    // 0x2c + 4 position bytes + 4 dimension bytes + 1 flags byte, then min code size.
    expect(out[sep + 9]).toBe(0x00); // flags: no local table, not interlaced
    expect(out[sep + 10]).toBe(0x02); // minimum LZW code size
  });

  test('returns a Uint8Array and differs between light and dark input', () => {
    const light = gif(new Bitmap(4).rect(0, Infinity, false));
    const dark = gif(new Bitmap(4).rect(0, Infinity, true));
    expect(light).toBeInstanceOf(Uint8Array);
    expect(Array.from(light)).not.toEqual(Array.from(dark));
  });

  test('LZW sub-blocks are each at most 255 bytes and end with a terminator', () => {
    // A large, high-entropy bitmap forces multiple sub-blocks.
    const b = new Bitmap(200).rect(0, Infinity, ({ x, y }) => (x * 7 + y * 13) % 3 === 0);
    const out = b.to_gif();
    const sep = out.indexOf(0x2c);
    let i = sep + 11; // first sub-block length byte
    let blocks = 0;
    while (out[i] !== 0x00) {
      const len = out[i]!;
      expect(len).toBeGreaterThan(0);
      expect(len).toBeLessThanOrEqual(255);
      i += len + 1;
      blocks++;
      expect(blocks).toBeLessThan(100000); // loop guard
    }
    expect(blocks).toBeGreaterThan(1);
    expect(out[i]).toBe(0x00); // block terminator
    expect(out[i + 1]).toBe(0x3b); // trailer immediately after
  });

  test('handles a 1x1 bitmap', () => {
    const out = gif(new Bitmap(1).rect(0, Infinity, true));
    expect(out[6]! | (out[7]! << 8)).toBe(1);
    expect(out[out.length - 1]).toBe(0x3b);
  });

  test('resets the LZW dictionary when the 4096-code table fills', () => {
    // The table-full branch only runs once next_code reaches MAX_CODE, which needs a
    // large, high-entropy image; small fixtures never reach it. This bitmap drives the
    // dictionary past 4096 codes several times over, so the reset path is exercised and
    // the resulting stream must still be structurally valid.
    const b = new Bitmap(1200).rect(0, Infinity, ({ x, y }) => ((x * 2654435761 ^ y * 40503) >>> 7) % 2 === 0);
    const out = b.to_gif();

    expect(out[6]! | (out[7]! << 8)).toBe(1200);
    expect(out[8]! | (out[9]! << 8)).toBe(1200);
    expect(out[out.length - 1]).toBe(0x3b);

    // Walk the sub-block chain to confirm the stream is well-formed end to end: a
    // mishandled reset would desynchronise the bit packing and corrupt the lengths.
    const sep = out.indexOf(0x2c);
    expect(out[sep + 10]).toBe(0x02); // minimum LZW code size
    let i = sep + 11;
    let blocks = 0;
    while (out[i] !== 0x00) {
      const len = out[i]!;
      expect(len).toBeGreaterThan(0);
      expect(len).toBeLessThanOrEqual(255);
      i += len + 1;
      blocks++;
      expect(blocks).toBeLessThan(100000); // loop guard
    }
    // >4096 codes worth of data means many maximum-size sub-blocks.
    expect(blocks).toBeGreaterThan(100);
    expect(out[i]).toBe(0x00); // block terminator
    expect(out[i + 1]).toBe(0x3b); // trailer immediately after
  });
});

describe('to_image', () => {
  test('RGBA output is 4 bytes per pixel with opaque alpha', () => {
    const img = Bitmap.from_string('X \n X').to_image(false);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(2 * 2 * 4);
    // First module is dark -> black, opaque.
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    // Second module is light -> white, opaque.
    expect(Array.from(img.data.slice(4, 8))).toEqual([255, 255, 255, 255]);
  });

  test('RGB output is 3 bytes per pixel', () => {
    const img = Bitmap.from_string('X \n X').to_image(true);
    expect(img.data.length).toBe(2 * 2 * 3);
    expect(Array.from(img.data.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(img.data.slice(3, 6))).toEqual([255, 255, 255]);
  });

  test('undefined modules render as light', () => {
    const img = new Bitmap(1).to_image(true);
    expect(Array.from(img.data.slice(0, 3))).toEqual([255, 255, 255]);
  });
});

// ---------------------------------------------------------------------------
// MAX_QR_PIXELS DoS guard
// ---------------------------------------------------------------------------

describe('MAX_QR_PIXELS guard', () => {
  test('the limit is 16 million pixels (4000x4000)', () => {
    expect(MAX_QR_PIXELS).toBe(16_000_000);
  });

  test('to_gif rejects bitmaps whose area exceeds the limit', () => {
    // Construct the oversized bitmap lazily: only the dimension fields are read
    // before the guard fires, so no large allocation happens here.
    const b = new Bitmap(1);
    b.width = 5000;
    b.height = 5000;
    expect(() => b.to_gif()).toThrow(/QR output too large/);
    expect(() => b.to_gif()).toThrow(/25000000 pixels/);
  });

  test('to_image rejects bitmaps whose area exceeds the limit', () => {
    const b = new Bitmap(1);
    b.width = 4001;
    b.height = 4000;
    expect(() => b.to_image()).toThrow(/QR output too large/);
  });

  test('the error names the maximum so the message is actionable', () => {
    const b = new Bitmap(1);
    b.width = 5000;
    b.height = 5000;
    expect(() => b.to_gif()).toThrow(new RegExp(String(MAX_QR_PIXELS)));
  });

  test('a bitmap exactly at the limit is accepted by the guard', () => {
    // 4000x4000 == MAX_QR_PIXELS; the guard uses `>` so this must not throw on the
    // bounds check. We verify the boundary arithmetic without materialising the
    // pixels by checking that a just-over bitmap throws and this one reports a
    // different failure mode (or none) from the guard itself.
    const b = new Bitmap(1);
    b.width = 4000;
    b.height = 4000;
    let guard_fired = false;
    try {
      b.to_image();
    } catch (e) {
      if (/QR output too large/.test((e as Error).message)) guard_fired = true;
    }
    expect(guard_fired).toBe(false);
  });
});
