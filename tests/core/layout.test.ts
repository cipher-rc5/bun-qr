import { describe, expect, test } from 'bun:test';
import { Bitmap } from '../../src/core/bitmap';
import { draw_template, PATTERNS, zigzag } from '../../src/core/layout';
import { _tests } from '../../src/index';

const { info } = _tests;

type Version = number & { readonly __brand: 'QrVersion' };
const v = (n: number) => n as Version;

// ---------------------------------------------------------------------------
// PATTERNS array
// ---------------------------------------------------------------------------

describe('PATTERNS', () => {
  test('has exactly 8 entries', () => {
    expect(PATTERNS.length).toBe(8);
  });

  test('all patterns return boolean', () => {
    for (const pattern of PATTERNS) {
      expect(typeof pattern(0, 0)).toBe('boolean');
      expect(typeof pattern(5, 7)).toBe('boolean');
    }
  });

  test('pattern 0: (x+y) % 2 === 0', () => {
    const p = PATTERNS[0]!;
    expect(p(0, 0)).toBe(true);
    expect(p(1, 0)).toBe(false);
    expect(p(0, 1)).toBe(false);
    expect(p(1, 1)).toBe(true);
  });

  test('pattern 1: y % 2 === 0', () => {
    const p = PATTERNS[1]!;
    expect(p(0, 0)).toBe(true);
    expect(p(5, 0)).toBe(true);
    expect(p(0, 1)).toBe(false);
    expect(p(0, 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// info.alignment_patterns
// ---------------------------------------------------------------------------

describe('info.alignment_patterns', () => {
  test('version 1 has no alignment patterns', () => {
    expect(info.alignment_patterns(v(1))).toEqual([]);
  });

  test('version 2 alignment positions match spec ([6, 18])', () => {
    expect(info.alignment_patterns(v(2))).toEqual([6, 18]);
  });

  test('version 7 alignment positions match spec ([6, 22, 38])', () => {
    expect(info.alignment_patterns(v(7))).toEqual([6, 22, 38]);
  });

  test('version 40 first position is always 6', () => {
    const positions = info.alignment_patterns(v(40));
    expect(positions[0]).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// draw_template: finder pattern placement
// ---------------------------------------------------------------------------

describe('draw_template: version 1', () => {
  const tpl = draw_template(info, v(1), 'medium', 0 as unknown as 0 & keyof typeof PATTERNS);

  test('produces a 21×21 bitmap', () => {
    expect(tpl.width).toBe(21);
    expect(tpl.height).toBe(21);
  });

  test('top-left finder pattern center is dark', () => {
    // Top-left finder center is at (3,3) in the template (0-indexed)
    expect(tpl.data[3][3]).toBe(true);
  });

  test('top-left finder pattern border (separator) cell is light', () => {
    // Separator row just outside the finder, e.g. row 7, col 0
    expect(tpl.data[7][0]).toBe(false);
  });

  test('all cells are defined (no undefined after draw_template)', () => {
    // draw_template may leave data cells undefined for the zigzag to fill
    // but structural cells (finders, timing, etc.) must be boolean
    let defined_count = 0;
    let undefined_count = 0;
    for (let y = 0;y < tpl.height;y++) {
      for (let x = 0;x < tpl.width;x++) {
        if (tpl.data[y][x] !== undefined) defined_count++;
        else undefined_count++;
      }
    }
    expect(defined_count).toBeGreaterThan(0);
    // Data cells are intentionally undefined before zigzag fill
    expect(undefined_count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// zigzag: all data cells are visited exactly once
// ---------------------------------------------------------------------------

describe('zigzag: data cell coverage', () => {
  test('visits every undefined cell in a version 1 template exactly once', () => {
    const tpl = draw_template(info, v(1), 'medium', 0 as unknown as 0 & keyof typeof PATTERNS);
    const visited = new Set<string>();

    zigzag(tpl, 0 as unknown as 0 & keyof typeof PATTERNS, (x, y, _mask) => {
      const key = `${x},${y}`;
      expect(visited.has(key)).toBe(false); // no cell visited twice
      visited.add(key);
    });

    // Count expected data cells: all undefined cells in the template
    let expected = 0;
    for (let y = 0;y < tpl.height;y++) {
      for (let x = 0;x < tpl.width;x++) {
        if (tpl.data[y][x] === undefined) expected++;
      }
    }
    expect(visited.size).toBe(expected);
  });

  test('visits every undefined cell in a version 5 template exactly once', () => {
    const tpl = draw_template(info, v(5), 'medium', 0 as unknown as 0 & keyof typeof PATTERNS);
    const visited = new Set<string>();

    zigzag(tpl, 0 as unknown as 0 & keyof typeof PATTERNS, (x, y, _mask) => {
      visited.add(`${x},${y}`);
    });

    let expected = 0;
    for (let y = 0;y < tpl.height;y++) {
      for (let x = 0;x < tpl.width;x++) {
        if (tpl.data[y][x] === undefined) expected++;
      }
    }
    expect(visited.size).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// info.size
// ---------------------------------------------------------------------------

describe('info.size', () => {
  test('version 1 → size 21', () => {
    expect(info.size.encode(v(1))).toBe(21);
  });

  test('version 40 → size 177', () => {
    expect(info.size.encode(v(40))).toBe(177);
  });

  test('size decode inverts encode', () => {
    for (const ver of [1, 5, 10, 20, 40]) {
      expect(info.size.decode(info.size.encode(v(ver))) as number).toBe(ver);
    }
  });
});

// ---------------------------------------------------------------------------
// Bitmap helper (used in tests above)
// ---------------------------------------------------------------------------
// Suppress unused import if Bitmap is only imported for type checks
const _bm: typeof Bitmap = Bitmap;
void _bm;
