import { Bitmap } from './bitmap';

const R1_RUN_LENGTH_THRESHOLD = 5;
const R2_BLOCK_PENALTY = 3;
/** The 1011101 core of the finder-like pattern; must lie inside the symbol. */
const R3_FINDER_CORE_LENGTH = 7;
/** The 4 adjacent light modules; may fall outside the symbol (ISO/IEC 18004 §6.8.2.2). */
const R3_FINDER_LIGHT_LENGTH = 4;
const R3_FINDER_PENALTY = 40;
const R4_BALANCE_STEP_PERCENT = 5;
const R4_BALANCE_STEP_POINTS = 10;

function calculate_row_run_penalty(row_bits: readonly boolean[]): number {
  const module_count = row_bits.length;
  if (module_count <= 1) return 0;

  let penalty = 0;
  let run_length = 1;
  let previous_color = row_bits[0];

  for (let i = 1;i < module_count;i++) {
    const current_color = row_bits[i];
    if (current_color === previous_color) {
      run_length++;
    } else {
      if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;
      run_length = 1;
      previous_color = current_color;
    }
  }

  if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;

  return penalty;
}

function calculate_column_run_penalty(matrix: readonly boolean[][], column_index: number, column_height: number): number {
  if (column_height <= 1) return 0;

  let penalty = 0;
  let run_length = 1;
  // Callers pass column_height = bitmap height, so rows 0..column_height-1 all exist.
  let previous_color = matrix[0]?.[column_index];

  for (let y = 1;y < column_height;y++) {
    const current_color = matrix[y]?.[column_index];
    if (current_color === previous_color) {
      run_length++;
    } else {
      if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;
      run_length = 1;
      previous_color = current_color;
    }
  }

  if (run_length >= R1_RUN_LENGTH_THRESHOLD) penalty += run_length - 2;

  return penalty;
}

/**
 * Scan a single line (row or column) for the 1:1:3:1:1 finder-like pattern of rule 3.
 *
 * `at(i)` reads the module at index `i` along the line. Per ISO/IEC 18004 §6.8.2.2 the four
 * light modules adjacent to the 1011101 core may fall *outside* the symbol boundary, so the
 * scan window starts at -4 and ends at `line_length - 7`, and out-of-range indices are read
 * as light. The 7 core modules must always lie within the symbol.
 */
function calculate_line_finder_penalty(line_length: number, at: (i: number) => boolean): number {
  if (line_length < R3_FINDER_CORE_LENGTH) return 0;

  // Out-of-symbol modules count as light, per §6.8.2.2.
  const read = (i: number): boolean => (i < 0 || i >= line_length ? false : at(i));

  const is_light_run = (start: number): boolean => {
    for (let i = start;i < start + R3_FINDER_LIGHT_LENGTH;i++) {
      if (read(i)) return false;
    }
    return true;
  };

  let penalty = 0;
  const last_core_start = line_length - R3_FINDER_CORE_LENGTH;

  for (let i = 0;i <= last_core_start;i++) {
    // The 1011101 core must lie entirely inside the symbol.
    const is_core = read(i) && !read(i + 1) && read(i + 2) && read(i + 3) && read(i + 4) && !read(i + 5) && read(i + 6);
    if (!is_core) continue;

    // 4 light modules on either side qualify. A core flanked on both sides is a single
    // occurrence and is scored once, matching the behaviour for interior patterns.
    if (is_light_run(i - R3_FINDER_LIGHT_LENGTH) || is_light_run(i + R3_FINDER_CORE_LENGTH)) {
      penalty += R3_FINDER_PENALTY;
    }
  }
  return penalty;
}

function calculate_row_finder_penalty(row_bits: readonly boolean[]): number {
  // `calculate_line_finder_penalty` only calls `at` for indices inside [0, length), so
  // `?? false` is unreachable padding that matches its own out-of-symbol convention.
  return calculate_line_finder_penalty(row_bits.length, (i) => row_bits[i] ?? false);
}

function calculate_column_finder_penalty(matrix: readonly boolean[][], column_index: number, column_height: number): number {
  return calculate_line_finder_penalty(column_height, (y) => matrix[y]?.[column_index] ?? false);
}

export function calculate_penalty(bitmap: Bitmap): number {
  const matrix = bitmap.data as boolean[][];
  const width = bitmap.width | 0;
  const height = bitmap.height | 0;

  if (width === 0 || height === 0) return 0;

  // Bitmap stores data row-major: matrix[y][x]. Every loop below is bounded by
  // `height`/`width`, which are the bitmap's own dimensions, so each row lookup resolves;
  // the guards are hoisted to once per row rather than once per module.
  let run_penalty = 0;
  for (let y = 0;y < height;y++) {
    const row = matrix[y];
    if (row !== undefined) run_penalty += calculate_row_run_penalty(row);
  }
  for (let x = 0;x < width;x++) run_penalty += calculate_column_run_penalty(matrix, x, height);

  let block_penalty = 0;
  const last_col = width - 1;
  const last_row = height - 1;
  for (let y = 0;y < last_row;y++) {
    const row = matrix[y];
    const next_row = matrix[y + 1];
    if (row === undefined || next_row === undefined) continue;
    for (let x = 0;x < last_col;x++) {
      const cell = row[x];
      if (cell === row[x + 1] && cell === next_row[x] && cell === next_row[x + 1]) {
        block_penalty += R2_BLOCK_PENALTY;
      }
    }
  }

  let finder_penalty = 0;
  for (let y = 0;y < height;y++) {
    const row = matrix[y];
    if (row !== undefined) finder_penalty += calculate_row_finder_penalty(row);
  }
  for (let x = 0;x < width;x++) finder_penalty += calculate_column_finder_penalty(matrix, x, height);

  let dark_count = 0;
  for (let y = 0;y < height;y++) {
    const row = matrix[y];
    if (row === undefined) continue;
    for (let x = 0;x < width;x++) if (row[x]) dark_count++;
  }
  const module_count = width * height;
  const dark_percent = (dark_count * 100) / module_count;
  const deviation = Math.abs(dark_percent - 50);
  const balance_penalty = R4_BALANCE_STEP_POINTS * Math.floor(deviation / R4_BALANCE_STEP_PERCENT);

  return run_penalty + block_penalty + finder_penalty + balance_penalty;
}

// Internal exports for unit testing — do not use in application code
export const _tests = {
  calculate_row_run_penalty,
  calculate_column_run_penalty,
  calculate_row_finder_penalty,
  calculate_column_finder_penalty
};
