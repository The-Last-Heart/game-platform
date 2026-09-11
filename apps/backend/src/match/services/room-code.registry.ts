const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

type RoomEntry = {
  matchId: string;
  expiresAtMs: number;
};

/**
 * In-memory roomCode → matchId map. Codes are normalized to uppercase.
 * Entries expire after TTL or when explicitly unregistered (match leaves lobby).
 */
export class RoomCodeRegistry {
  private readonly byCode = new Map<string, RoomEntry>();
  private readonly byMatchId = new Map<string, string>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  normalize(code: string): string {
    return code.trim().toUpperCase();
  }

  generate(nowMs: number): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let code = '';
      for (let i = 0; i < 6; i += 1) {
        code += ROOM_CODE_ALPHABET[
          Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
        ]!;
      }
      this.purgeExpired(nowMs);
      if (!this.byCode.has(code)) {
        return code;
      }
    }
    throw new Error('unable to allocate room code');
  }

  register(roomCode: string, matchId: string, nowMs: number): string {
    const code = this.normalize(roomCode);
    this.purgeExpired(nowMs);
    this.unregisterMatch(matchId);
    this.byCode.set(code, { matchId, expiresAtMs: nowMs + this.ttlMs });
    this.byMatchId.set(matchId, code);
    return code;
  }

  lookup(roomCode: string, nowMs: number): string | null {
    const code = this.normalize(roomCode);
    this.purgeExpired(nowMs);
    return this.byCode.get(code)?.matchId ?? null;
  }

  unregisterMatch(matchId: string): void {
    const code = this.byMatchId.get(matchId);
    if (!code) {
      return;
    }
    this.byMatchId.delete(matchId);
    this.byCode.delete(code);
  }

  private purgeExpired(nowMs: number): void {
    for (const [code, entry] of this.byCode) {
      if (entry.expiresAtMs <= nowMs) {
        this.byCode.delete(code);
        this.byMatchId.delete(entry.matchId);
      }
    }
  }
}
