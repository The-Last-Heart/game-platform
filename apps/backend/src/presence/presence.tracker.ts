/**
 * In-process unique-client presence. Count is the number of distinct client
 * ids with a live socket that has completed presence.hello.
 *
 * One backend process only — same limitation as the in-memory match store.
 * A future Redis-backed tracker can replace this without changing the gateway.
 */
export class PresenceTracker {
  private readonly clientBySocket = new Map<string, string>();
  private readonly socketByClient = new Map<string, string>();

  hello(
    socketId: string,
    clientId: string,
  ): { count: number; changed: boolean } {
    const previousCount = this.count();
    const previousSocket = this.socketByClient.get(clientId);
    if (previousSocket && previousSocket !== socketId) {
      this.clientBySocket.delete(previousSocket);
    }
    const previousClient = this.clientBySocket.get(socketId);
    if (previousClient && previousClient !== clientId) {
      if (this.socketByClient.get(previousClient) === socketId) {
        this.socketByClient.delete(previousClient);
      }
    }
    this.clientBySocket.set(socketId, clientId);
    this.socketByClient.set(clientId, socketId);
    const count = this.count();
    return { count, changed: count !== previousCount };
  }

  goodbye(socketId: string): { count: number; changed: boolean } {
    const previousCount = this.count();
    const clientId = this.clientBySocket.get(socketId);
    if (!clientId) {
      return { count: previousCount, changed: false };
    }
    this.clientBySocket.delete(socketId);
    if (this.socketByClient.get(clientId) === socketId) {
      this.socketByClient.delete(clientId);
    }
    const count = this.count();
    return { count, changed: count !== previousCount };
  }

  count(): number {
    return this.socketByClient.size;
  }

  clear(): void {
    this.clientBySocket.clear();
    this.socketByClient.clear();
  }
}
