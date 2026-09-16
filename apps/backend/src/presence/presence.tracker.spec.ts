import { PresenceTracker } from './presence.tracker';

describe('PresenceTracker', () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    tracker = new PresenceTracker();
  });

  it('counts unique client ids after hello', () => {
    expect(tracker.hello('s1', 'client-aaaa').count).toBe(1);
    expect(tracker.hello('s2', 'client-bbbb').count).toBe(2);
  });

  it('does not double-count the same client on reconnect', () => {
    tracker.hello('s1', 'client-aaaa');
    const second = tracker.hello('s2', 'client-aaaa');
    expect(second.count).toBe(1);
    expect(second.changed).toBe(false);
    const staleLeave = tracker.goodbye('s1');
    expect(staleLeave.count).toBe(1);
    expect(staleLeave.changed).toBe(false);
  });

  it('decrements when the live socket disconnects', () => {
    tracker.hello('s1', 'client-aaaa');
    tracker.hello('s2', 'client-bbbb');
    const left = tracker.goodbye('s2');
    expect(left.count).toBe(1);
    expect(left.changed).toBe(true);
  });

  it('ignores goodbye for an unknown socket', () => {
    tracker.hello('s1', 'client-aaaa');
    const result = tracker.goodbye('missing');
    expect(result.count).toBe(1);
    expect(result.changed).toBe(false);
  });

  it('replacing client id on the same socket drops the previous id', () => {
    tracker.hello('s1', 'client-aaaa');
    const swapped = tracker.hello('s1', 'client-bbbb');
    expect(swapped.count).toBe(1);
    expect(swapped.changed).toBe(false);
    tracker.hello('s2', 'client-aaaa');
    expect(tracker.count()).toBe(2);
  });
});
