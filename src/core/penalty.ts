import { Bitmap } from './bitmap';

const R1_RUN_LENGTH_THRESHOLD = 5;
const R2_BLOCK_PENALTY = 3;
const R3_FINDER_PATTERN_LENGTH = 11;
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

function calculate_column_run_penalty(bitmap: readonly boolean[][], column_index: number, column_height: number): number {
  if (column_height <= 1) return 0;

  let penalty = 0;
  let run_length = 1;
  let previous_color = bitmap[0][column_index];

  for (let y = 1;y < column_height;y++) {
    const current_color = bitmap[y][column_index];
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

function calculate_row_finder_penalty(row_bits: readonly boolean[]): number {
  const row_length = row_bits.length;
  if (row_length < R3_FINDER_PATTERN_LENGTH) return 0;

  let penalty = 0;
  const last_start = row_length - R3_FINDER_PATTERN_LENGTH;

  for (let i = 0;i <= last_start;i++) {
    const light_4_then_finder_7 = !row_bits[i] &&
      !row_bits[i + 1] &&
      !row_bits[i + 2] &&
      !row_bits[i + 3] &&
      row_bits[i + 4] &&
      !row_bits[i + 5] &&
      row_bits[i + 6] &&
      row_bits[i + 7] &&
      row_bits[i + 8] &&
      !row_bits[i + 9] &&
      row_bits[i + 10];

    const finder_7_then_light_4 = row_bits[i] &&
      !row_bits[i + 1] &&
      row_bits[i + 2] &&
      row_bits[i + 3] &&
      row_bits[i + 4] &&
      !row_bits[i + 5] &&
      row_bits[i + 6] &&
      !row_bits[i + 7] &&
      !row_bits[i + 8] &&
      !row_bits[i + 9] &&
      !row_bits[i + 10];

    if (light_4_then_finder_7 || finder_7_then_light_4) penalty += R3_FINDER_PENALTY;
  }
  return penalty;
}

function calculate_column_finder_penalty(matrix: readonly boolean[][], row_index: number, width: number): number {
  if (width < R3_FINDER_PATTERN_LENGTH) return 0;

  let penalty = 0;
  const y = row_index;
  const last_start = width - R3_FINDER_PATTERN_LENGTH;

  for (let x = 0;x <= last_start;x++) {
    const light_4_then_finder_7 = !matrix[x][y] &&
      !matrix[x + 1][y] &&
      !matrix[x + 2][y] &&
      !matrix[x + 3][y] &&
      matrix[x + 4][y] &&
      !matrix[x + 5][y] &&
      matrix[x + 6][y] &&
      matrix[x + 7][y] &&
      matrix[x + 8][y] &&
      !matrix[x + 9][y] &&
      matrix[x + 10][y];

    const finder_7_then_light_4 = matrix[x][y] &&
      !matrix[x + 1][y] &&
      matrix[x + 2][y] &&
      matrix[x + 3][y] &&
      matrix[x + 4][y] &&
      !matrix[x + 5][y] &&
      matrix[x + 6][y] &&
      !matrix[x + 7][y] &&
      !matrix[x + 8][y] &&
      !matrix[x + 9][y] &&
      !matrix[x + 10][y];

    if (light_4_then_finder_7 || finder_7_then_light_4) penalty += R3_FINDER_PENALTY;
  }
  return penalty;
}

export function calculate_penalty(bitmap: Bitmap): number {
  const matrix = bitmap.data as boolean[][];
  const width = bitmap.width | 0;
  const height = bitmap.height | 0;

  if (width === 0 || height === 0) return 0;

  let run_penalty = 0;
  for (let x = 0;x < width;x++) run_penalty += calculate_row_run_penalty(matrix[x]);
  for (let y = 0;y < height;y++) run_penalty += calculate_column_run_penalty(matrix, y, width);

  let block_penalty = 0;
  const last_col = width - 1;
  const last_row = height - 1;
  for (let x = 0;x < last_col;x++) {
    const col = matrix[x];
    const next_col = matrix[x + 1];
    for (let y = 0;y < last_row;y++) {
      const cell = col[y];
      if (cell === next_col[y] && cell === col[y + 1] && cell === next_col[y + 1]) {
        block_penalty += R2_BLOCK_PENALTY;
      }
    }
  }

  let finder_penalty = 0;
  for (let x = 0;x < width;x++) finder_penalty += calculate_row_finder_penalty(matrix[x]);
  for (let y = 0;y < height;y++) finder_penalty += calculate_column_finder_penalty(matrix, y, width);

  let dark_count = 0;
  for (let x = 0;x < width;x++) {
    const col = matrix[x];
    for (let y = 0;y < height;y++) if (col[y]) dark_count++;
  }
  const module_count = width * height;
  const dark_percent = (dark_count * 100) / module_count;
  const deviation = Math.abs(dark_percent - 50);
  const balance_penalty = R4_BALANCE_STEP_POINTS * Math.floor(deviation / R4_BALANCE_STEP_PERCENT);

  return run_penalty + block_penalty + finder_penalty + balance_penalty;
}
