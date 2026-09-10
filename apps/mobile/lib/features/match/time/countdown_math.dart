import '../time/server_time_clock.dart';

/// Computes remaining seconds until [deadlineAtMs] using the server-time clock.
///
/// Never uses device wall clock for gameplay eligibility.
int remainingSecondsUntil(
  ServerTimeClock clock,
  int? deadlineAtMs, {
  int maxSeconds = 99,
}) {
  if (deadlineAtMs == null) {
    return 0;
  }
  clock.setActiveDeadline(deadlineAtMs);
  final int nowMs = clock.estimateServerNowMs();
  if (nowMs <= 0) {
    return 0;
  }
  final int remaining = ((deadlineAtMs - nowMs) / 1000).ceil();
  if (remaining < 0) {
    return 0;
  }
  if (remaining > maxSeconds) {
    return maxSeconds;
  }
  return remaining;
}

/// Remaining milliseconds for fine-grained challenge timers.
double remainingMsUntil(ServerTimeClock clock, int deadlineAtMs) {
  clock.setActiveDeadline(deadlineAtMs);
  final int nowMs = clock.estimateServerNowMs();
  if (nowMs <= 0) {
    return 0;
  }
  final double remaining = (deadlineAtMs - nowMs).toDouble();
  return remaining < 0 ? 0 : remaining;
}
