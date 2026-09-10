import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'realtime_transport.dart';

/// Production [RealtimeTransport] using Socket.IO.
class SocketIoTransport implements RealtimeTransport {
  SocketIoTransport({required this.url});

  final String url;
  io.Socket? _socket;
  final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<bool> _connectionController =
      StreamController<bool>.broadcast();
  bool _connected = false;

  @override
  Stream<Map<String, dynamic>> get events => _eventController.stream;

  @override
  bool get isConnected => _connected;

  @override
  Stream<bool> get connectionState => _connectionController.stream;

  @override
  Future<void> connect() async {
    // Disconnect/dispose any previous socket before creating a new one.
    if (_socket != null) {
      _socket!.dispose();
      _socket = null;
      _connected = false;
    }

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(<String>['websocket'])
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );

    final Completer<void> completer = Completer<void>();

    _socket!.onConnect((_) {
      _connected = true;
      _connectionController.add(true);
      if (!completer.isCompleted) {
        completer.complete();
      }
    });

    _socket!.onDisconnect((_) {
      _connected = false;
      _connectionController.add(false);
    });

    _socket!.onConnectError((_) {
      _connected = false;
      _connectionController.add(false);
      if (!completer.isCompleted) {
        completer.completeError(Exception('Socket.IO connection failed'));
      }
    });

    _socket!.on('event', (dynamic data) {
      if (data is Map) {
        _eventController.add(Map<String, dynamic>.from(data));
      }
    });

    _socket!.connect();
    return completer.future;
  }

  @override
  Future<void> disconnect() async {
    // Fully dispose so Play Again cannot reuse a socket still bound server-side.
    _socket?.dispose();
    _socket = null;
    _connected = false;
    _connectionController.add(false);
  }

  @override
  void sendCommand(Map<String, dynamic> envelope) {
    _socket?.emit('command', envelope);
  }

  @override
  void dispose() {
    _socket?.dispose();
    _socket = null;
    _eventController.close();
    _connectionController.close();
  }
}
