import { createHash, randomBytes, randomUUID } from 'node:crypto';

export class ResumeTokenService {
  issue(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  matches(token: string, hash: string): boolean {
    return this.hash(token) === hash;
  }

  newPlayerId(): string {
    return randomUUID();
  }
}
