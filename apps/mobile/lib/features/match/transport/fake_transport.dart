import 'dart:async';

import 'realtime_transport.dart';

/// Test [RealtimeTransport] with scripted events and command capture.
class FakeTransport implements RealtimeTransport {
  FakeTransport({this.connectShouldFail = false});

  bool connectShouldFail;
  StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast(sync: true);
  StreamController<bool> _connectionController =
      StreamController<bool>.broadcast(sync: true);
  bool _connected = false;
  bool _disposed = false;

  /// Commands sent by the client, captured for assertions.
  final List<Map<String, dynamic>> sentCommands = <Map<String, dynamic>>[];

  /// Number of times connect() was called.
  int connectCount = 0;

  @override
  Stream<Map<String, dynamic>> get events => _eventController.stream;

  @override
  bool get isConnected => _connected;

  @override
  Stream<bool> get connectionState => _connectionController.stream;

  /// Whether dispose has been called.
  bool get isDisposed => _disposed;

  @override
  Future<void> connect() async {
    connectCount++;
    if (connectShouldFail) {
      _connected = false;
      _connectionController.add(false);
      throw Exception('FakeTransport: simulated connection failure');
    }
    _connected = true;
    _connectionController.add(true);
  }

  @override
  Future<void> disconnect() async {
    _connected = false;
    _connectionController.add(false);
  }

  @override
  void sendCommand(Map<String, dynamic> envelope) {
    sentCommands.add(envelope);
  }

  @override
  void dispose() {
    _disposed = true;
    _eventController.close();
    _connectionController.close();
  }

  /// Re-create stream controllers after dispose (for clearSessionAndDisconnect
  /// tests that create a fresh transport lifecycle).
  void reset() {
    if (_disposed) {
      _eventController = StreamController<Map<String, dynamic>>.broadcast(
        sync: true,
      );
      _connectionController = StreamController<bool>.broadcast(sync: true);
      _disposed = false;
    }
    _connected = false;
    sentCommands.clear();
    connectCount = 0;
  }

  /// Inject a server event into the stream (test helper).
  void emitEvent(Map<String, dynamic> event) {
    _eventController.add(event);
  }

  /// Simulate connection drop.
  void simulateDisconnect() {
    _connected = false;
    _connectionController.add(false);
  }

  /// Simulate reconnect.
  void simulateReconnect() {
    _connected = true;
    _connectionController.add(true);
  }
}
