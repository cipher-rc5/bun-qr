import { describe, expect, spyOn, test } from 'bun:test';
import { absolute_path, child_path, create_directory, remove_directory, temporary_directory } from '../scripts/bun-utils';

describe('Bun script filesystem helpers', () => {
  test('preserves literal path characters and removes nested files', async () => {
    const root = await temporary_directory('bun-qr-script-');
    const directory = child_path(root, 'space #?%; & unicode-é');
    try {
      await create_directory(directory);
      const file = child_path(directory, 'payload #?%.txt');
      expect(absolute_path(file)).toBe(file);
      await Bun.write(file, 'literal path');
      expect(await Bun.file(file).text()).toBe('literal path');
      await remove_directory(directory);
      expect(await Bun.file(file).exists()).toBe(false);
      await remove_directory(directory);
    } finally {
      await remove_directory(root);
    }
  });

  test('creates distinct directories with private Unix permissions', async () => {
    const first = await temporary_directory('bun-qr-script-');
    try {
      const second = await temporary_directory('bun-qr-script-');
      try {
        expect(first).not.toBe(second);
        for (const directory of [first, second]) {
          const stat = await Bun.file(directory).stat();
          expect(stat.isDirectory()).toBe(true);
          if (navigator.platform !== 'Win32') expect(stat.mode & 0o777).toBe(0o700);
        }
      } finally {
        await remove_directory(second);
      }
    } finally {
      await remove_directory(first);
    }
  });

  test('fails safely on a name collision without deleting existing content', async () => {
    const root = await temporary_directory('bun-qr-script-');
    const base = child_path(root, 'temporary base #?%;&');
    const previous = Bun.env.BUN_TMPDIR;
    const uuid = '00000000-0000-4000-8000-000000000000';
    try {
      await create_directory(base);
      const occupied = child_path(base, `collision-${uuid}`);
      await create_directory(occupied);
      const marker = child_path(occupied, 'keep.txt');
      await Bun.write(marker, 'keep');
      Bun.env.BUN_TMPDIR = base;
      const random = spyOn(crypto, 'randomUUID').mockReturnValue(uuid);
      try {
        await expect(temporary_directory('collision-')).rejects.toThrow();
        expect(await Bun.file(marker).text()).toBe('keep');
      } finally {
        random.mockRestore();
      }
    } finally {
      if (previous === undefined) delete Bun.env.BUN_TMPDIR;
      else Bun.env.BUN_TMPDIR = previous;
      await remove_directory(root);
    }
  });
});
