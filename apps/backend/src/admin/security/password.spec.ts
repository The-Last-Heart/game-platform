import { hashPassword, verifyPassword } from './password';

describe('admin password hashing', () => {
  it('hashes and verifies with versioned scrypt format', async () => {
    const password = 'correct-horse-battery';
    const encoded = await hashPassword(password);
    expect(encoded.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword(password, encoded)).toBe(true);
    expect(await verifyPassword('wrong-password!!', encoded)).toBe(false);
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });

  it('rejects malformed encodings safely', async () => {
    expect(await verifyPassword('anything-long', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything-long', 'scrypt$1$2')).toBe(false);
  });
});
