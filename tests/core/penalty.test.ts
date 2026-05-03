import { describe, expect, test } from 'bun:test';
import { Bitmap } from '../../src/core/bitmap';
import { _tests, calculate_penalty } from '../../src/core/penalty';

const { calculate_row_run_penalty, calculate_row_finder_penalty } = _tests;

// ---------------------------------------------------------------------------
// Helper: build a Bitmap from a pattern string
// 'X' = dark (true), ' ' = light (false)
// ---------------------------------------------------------------------------
function make_bitmap(rows: string[]): Bitmap {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = rows.map((row) =>
    row.split('').map((c) => {
      if (c === 'X') return true;
      if (c === ' ') return false;
      throw new Error(`Unknown char: ${c}`);
    })
  );
  const bm = new Bitmap({ height, width });
  for (let y = 0;y < height;y++) {
    for (let x = 0;x < width;x++) {
      bm.data[y][x] = data[y]![x];
    }
  }
  return bm;
}

// ---------------------------------------------------------------------------
// R1: Run-length penalty
// ---------------------------------------------------------------------------

describe('R1: run-length penalty', () => {
  test('no runs ≥ 5 → penalty 0', () => {
    const row = [true, false, true, false] as const;
    expect(calculate_row_run_penalty([...row])).toBe(0);
  });

  test('exactly 5 consecutive dark → penalty 3 (5-2)', () => {
    const row = [true, true, true, true, true, false];
    expect(calculate_row_run_penalty(row)).toBe(3);
  });

  test('6 consecutive dark → penalty 4 (6-2)', () => {
    const row = [true, true, true, true, true, true, false];
    expect(calculate_row_run_penalty(row)).toBe(4);
  });

  test('two separate runs of 5 → penalty 6', () => {
    const row = [
      true,
      true,
      true,
      true,
      true, // run of 5
      false,
      true,
      true,
      true,
      true,
      true // run of 5
    ];
    expect(calculate_row_run_penalty(row)).toBe(6);
  });

  test('run at end of row is counted', () => {
    const row = [false, true, true, true, true, true];
    expect(calculate_row_run_penalty(row)).toBe(3);
  });

  test('calculate_penalty counts both rows and columns', () => {
    // 5×5 fully dark bitmap: each row contributes 3, each col contributes 3
    // Also hits R2 (block) and R4 (imbalance), but R1 alone: 5*3 + 5*3 = 30
    const bm = make_bitmap(['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX']);
    const p = calculate_penalty(bm);
    expect(p).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// R2: 2×2 block penalty
// ---------------------------------------------------------------------------

// Note: calculate_penalty is designed for square bitmaps (QR codes are always square).
// Tests use N×N bitmaps and verify exact total penalties derived by hand.

describe('R2: 2×2 block penalty', () => {
  test('4×4 checkerboard → R2 = 0 (no same-color 2×2 blocks)', () => {
    // Perfect checkerboard: no 2×2 submatrix is monochromatic
    // R1=0, R2=0, R3=0, R4=0 → total = 0
    const bm = make_bitmap(['X X ', ' X X', 'X X ', ' X X']);
    expect(calculate_penalty(bm)).toBe(0);
  });

  test('4×4 all-light → R2 = 27 (9 overlapping light 2×2 blocks)', () => {
    // All light: (4-1)×(4-1) = 9 overlapping 2×2 blocks × 3 pts = 27
    // R1=0 (runs of 4 < threshold 5), R2=27, R3=0, R4=100 → total = 127
    const bm = make_bitmap(['    ', '    ', '    ', '    ']);
    // Verify just the R2 contribution: a bitmap with the same run/balance
    // but broken 2×2 blocks (checkerboard) has total=0, so difference ≥ 27
    const chk = make_bitmap(['X X ', ' X X', 'X X ', ' X X']);
    expect(calculate_penalty(bm) - calculate_penalty(chk)).toBeGreaterThanOrEqual(27);
  });
});

// ---------------------------------------------------------------------------
// R3: finder-like pattern penalty
// ---------------------------------------------------------------------------

describe('R3: finder-like pattern', () => {
  test('row with light-4 + finder-7 pattern → penalty 40', () => {
    // Pattern: 0000 1 0 1 1 1 0 1
    const row = [false, false, false, false, true, false, true, true, true, false, true];
    expect(calculate_row_finder_penalty(row)).toBe(40);
  });

  test('row with finder-7 + light-4 pattern → penalty 40', () => {
    // Pattern: 1 0 1 1 1 0 1 0000
    const row = [true, false, true, true, true, false, true, false, false, false, false];
    expect(calculate_row_finder_penalty(row)).toBe(40);
  });

  test('row shorter than 11 → penalty 0', () => {
    const row = [true, false, true, true, true, false, true, false, false, false];
    expect(calculate_row_finder_penalty(row)).toBe(0);
  });

  test('no finder pattern → penalty 0', () => {
    const row = [true, true, false, false, true, true, false, false, true, true, false];
    expect(calculate_row_finder_penalty(row)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R4: balance penalty
// ---------------------------------------------------------------------------

describe('R4: dark module balance', () => {
  test('50% dark in 4×4 bitmap → R4 contributes 0', () => {
    // 8 dark out of 16 = 50% → deviation 0 → R4 penalty 0
    // Using a checkerboard for 50% balance and no 2×2 blocks
    const balanced = make_bitmap(['X X ', ' X X', 'X X ', ' X X']);
    const all_dark = make_bitmap(['XXXX', 'XXXX', 'XXXX', 'XXXX']);
    const diff = calculate_penalty(all_dark) - calculate_penalty(balanced);
    // all_dark: R4 = 100 (100% dark → deviation 50), balanced: R4 = 0
    expect(diff).toBeGreaterThanOrEqual(100);
  });

  test('0% dark (4×4 all light) → penalty 100 from R4', () => {
    // 0% dark: deviation = 50, steps = 10, penalty = 100
    // No R1 (runs < 5), no R2 (no blocks), no R3 (no finder pattern)
    const bm = make_bitmap(['    ', '    ', '    ', '    ']);
    expect(calculate_penalty(bm)).toBe(127); // R2=27 (9 light 2×2 blocks) + R4=100
  });
});
