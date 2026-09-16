import { Injectable } from '@nestjs/common';
import { PresenceTracker } from './presence.tracker';

@Injectable()
export class PresenceService {
  private readonly tracker = new PresenceTracker();

  hello(
    socketId: string,
    clientId: string,
  ): { count: number; changed: boolean } {
    return this.tracker.hello(socketId, clientId);
  }

  goodbye(socketId: string): { count: number; changed: boolean } {
    return this.tracker.goodbye(socketId);
  }

  count(): number {
    return this.tracker.count();
  }

  /** Test-only: drop every tracked socket so integration cases stay isolated. */
  resetForTests(): void {
    this.tracker.clear();
  }
}
