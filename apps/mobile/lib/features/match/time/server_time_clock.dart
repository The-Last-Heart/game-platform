/// Abstraction over monotonic time for testability.
///
/// Production uses [StopwatchMonotonicClock]; tests inject a fake.
abstract class MonotonicClock {
  /// Returns elapsed monotonic milliseconds since an arbitrary epoch.
  int elapsedMs();
}

/// Production [MonotonicClock] backed by [Stopwatch].
class StopwatchMonotonicClock implements MonotonicClock {
  StopwatchMonotonicClock() {
    _stopwatch.start();
  }

  final Stopwatch _stopwatch = Stopwatch();

  @override
  int elapsedMs() => _stopwatch.elapsedMilliseconds;
}

/// Estimates server time from periodic anchors (snapshots / events).
///
/// Uses a monotonic clock to avoid wall-clock jumps (NTP, timezone, etc.).
/// Never moves an active countdown backward: if a re-anchor would increase
/// the remaining time on an active deadline, the new anchor is clamped so
/// remaining stays the same or decreases.
class ServerTimeClock {
  ServerTimeClock({MonotonicClock? clock})
    : _clock = clock ?? StopwatchMonotonicClock();

  final MonotonicClock _clock;

  int? _anchorServerMs;
  int? _anchorMonotonicMs;

  /// Active deadline (phaseDeadlineAtMs) used for backward-jump prevention.
  int? _activeDeadlineMs;

  /// Anchor the clock from a server-provided timestamp.
  ///
  /// Call this whenever a snapshot or timestamped event arrives.
  void anchor(int serverNowMs) {
    final int monoNow = _clock.elapsedMs();

    if (_anchorServerMs != null && _activeDeadlineMs != null) {
      // Compute remaining time under old anchor.
      final int oldEstimate =
          _anchorServerMs! + (monoNow - _anchorMonotonicMs!);
      final int oldRemaining = _activeDeadlineMs! - oldEstimate;

      // Compute remaining time under new anchor.
      final int newRemaining = _activeDeadlineMs! - serverNowMs;

      if (newRemaining > oldRemaining && oldRemaining > 0) {
        // New anchor would increase remaining time → clamp.
        // Adjust the anchor so remaining stays at oldRemaining.
        _anchorServerMs = _activeDeadlineMs! - oldRemaining;
        _anchorMonotonicMs = monoNow;
        return;
      }
    }

    _anchorServerMs = serverNowMs;
    _anchorMonotonicMs = monoNow;
  }

  /// Set the active countdown deadline for backward-jump prevention.
  void setActiveDeadline(int? deadlineMs) {
    _activeDeadlineMs = deadlineMs;
  }

  /// Estimate the current server time in milliseconds.
  ///
  /// Returns 0 if no anchor has been set.
  int estimateServerNowMs() {
    if (_anchorServerMs == null || _anchorMonotonicMs == null) {
      return 0;
    }
    final int elapsed = _clock.elapsedMs() - _anchorMonotonicMs!;
    return _anchorServerMs! + elapsed;
  }
}
