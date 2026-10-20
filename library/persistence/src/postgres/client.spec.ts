import { describe, expect, it, vi } from 'vitest';
import { createPool } from './client';

describe('postgres/client', () => {
  it('TST-508 onConnectionError を渡したとき待機中の接続の error で落ちず callback が Error を受け取る', async () => {
    const received: Error[] = [];
    const pool = createPool('postgres://postgres@127.0.0.1:1/postgres', {
      onConnectionError: (error) => received.push(error),
    });

    pool.emit('error', new Error('terminating connection'));

    expect(received.map((error) => error.message)).toEqual(['terminating connection']);
    await pool.end();
  });

  it('TST-508 onConnectionError を渡さないとき error は stderr に記録される', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const pool = createPool('postgres://postgres@127.0.0.1:1/postgres');

    pool.emit('error', new Error('terminating connection'));

    expect(write).toHaveBeenCalledWith(expect.stringContaining('terminating connection'));
    write.mockRestore();
    await pool.end();
  });
});
