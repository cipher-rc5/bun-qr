import { describe, expect, test } from 'bun:test';
import { type ToolchainConfig, verifyToolchain } from '../scripts/verify-toolchain';

const valid: ToolchainConfig = {
  engine: '>=1.4.2',
  pinned: '1.4.2',
  workflowPins: ['1.4.2', '1.4.2'],
  matrix: ['1.4.2'],
  runtime: '1.4.2'
};

describe('toolchain verification', () => {
  test('accepts minimum and pinned version sharing one matrix entry', () => {
    expect(() => verifyToolchain(valid)).not.toThrow();
  });
  test('accepts a newer pin and runtime when both minimum and pin are tested', () => {
    expect(() =>
      verifyToolchain({ ...valid, pinned: '1.5.0', workflowPins: ['1.5.0', '1.5.0'], matrix: ['1.4.2', '1.5.0'], runtime: '2.0.0' })
    ).not.toThrow();
  });
  test.each([
    { engine: '^1.4.2' },
    { pinned: '1.3.14', workflowPins: ['1.3.14', '1.3.14'] },
    { workflowPins: ['1.4.2', '1.3.14'] },
    { matrix: ['1.3.0', '1.3.14'] },
    { matrix: ['1.4.3'] },
    { runtime: '1.4.1' },
    { runtime: '1.4.2-canary' }
  ])('rejects inconsistent configuration %p', (change) => {
    expect(() => verifyToolchain({ ...valid, ...change })).toThrow();
  });
});
