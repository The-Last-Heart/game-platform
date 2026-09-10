import 'dart:async';

/// Abstract realtime transport for the match system.
///
/// Implementations: [SocketIoTransport] for production, [FakeTransport] for
/// tests. Emits raw JSON maps; deserialization happens in the reducer layer.
abstract class RealtimeTransport {
  /// Stream of server events (raw JSON maps from 'event' channel).
  Stream<Map<String, dynamic>> get events;

  /// Whether currently connected.
  bool get isConnected;

  /// Stream that emits when connection state changes.
  Stream<bool> get connectionState;

  /// Connect to the server.
  ///
  /// Implementations must disconnect/dispose any previous socket before
  /// establishing a new connection.
  Future<void> connect();

  /// Disconnect from the server.
  Future<void> disconnect();

  /// Send a command envelope to the server.
  void sendCommand(Map<String, dynamic> envelope);

  /// Dispose resources.
  void dispose();
}
