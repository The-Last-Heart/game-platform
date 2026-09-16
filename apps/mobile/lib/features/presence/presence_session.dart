import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../match/session/match_session_controller.dart';
import 'presence_client_id_store.dart';

const String presenceSchemaVersion = '1';
const String presenceHelloType = 'presence.hello';
const String presenceOnlineCountType = 'presence.online_count';

/// Live online-player occupancy for the home hero.
///
/// Only foreground sessions should call [setForeground](true). Backgrounding
/// or closing the app must call [setForeground](false) so the player drops
/// out of the count immediately.
abstract class PresenceSession {
  ValueListenable<int?> get onlineCount;

  Future<void> setForeground(bool foreground);

  void dispose();
}

/// Test double that never opens a socket.
class FakePresenceSession implements PresenceSession {
  FakePresenceSession({int? count}) : _count = ValueNotifier<int?>(count);

  final ValueNotifier<int?> _count;
  bool foreground = false;
  int foregroundCalls = 0;
  int backgroundCalls = 0;

  @override
  ValueListenable<int?> get onlineCount => _count;

  void setCount(int? value) {
    _count.value = value;
  }

  @override
  Future<void> setForeground(bool next) async {
    foreground = next;
    if (next) {
      foregroundCalls += 1;
    } else {
      backgroundCalls += 1;
    }
  }

  @override
  void dispose() {
    _count.dispose();
  }
}

/// Socket.IO occupancy on the `/presence` namespace.
class SocketPresenceSession implements PresenceSession {
  SocketPresenceSession({
    required this.url,
    PresenceClientIdStore? clientIdStore,
  }) : _clientIdStore = clientIdStore ?? PresenceClientIdStore();

  final String url;
  final PresenceClientIdStore _clientIdStore;
  final ValueNotifier<int?> _onlineCount = ValueNotifier<int?>(null);

  io.Socket? _socket;
  bool _wantForeground = false;
  bool _disposed = false;
  int _generation = 0;
  String? _clientId;

  @override
  ValueListenable<int?> get onlineCount => _onlineCount;

  @override
  Future<void> setForeground(bool foreground) async {
    if (_disposed) return;
    _wantForeground = foreground;
    if (foreground) {
      await _connect();
    } else {
      _disconnect();
    }
  }

  Future<void> _connect() async {
    final int generation = ++_generation;
    _disconnectSocket();
    final String clientId = _clientId ??= await _clientIdStore.loadOrCreate();
    if (_disposed || !_wantForeground || generation != _generation) {
      return;
    }

    final String namespaceUrl = _presenceUrl(url);
    final io.Socket socket = io.io(
      namespaceUrl,
      io.OptionBuilder()
          .setTransports(<String>['websocket'])
          .disableAutoConnect()
          .enableForceNew()
          .enableReconnection()
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      if (!_wantForeground || _socket != socket) return;
      _sendHello(clientId);
    });
    socket.on('event', (dynamic data) {
      if (data is Map) {
        _onEvent(Map<String, dynamic>.from(data));
      }
    });
    socket.connect();
  }

  void _sendHello(String clientId) {
    _socket?.emit('command', <String, dynamic>{
      'schemaVersion': presenceSchemaVersion,
      'type': presenceHelloType,
      'messageId': generateSecureId(),
      'commandId': generateSecureId(),
      'payload': <String, String>{'clientId': clientId},
    });
  }

  void _onEvent(Map<String, dynamic> event) {
    final int? count = parsePresenceOnlineCount(event);
    if (count != null) {
      _onlineCount.value = count;
    }
  }

  void _disconnect() {
    _generation += 1;
    _disconnectSocket();
  }

  void _disconnectSocket() {
    _socket?.dispose();
    _socket = null;
  }

  static String _presenceUrl(String base) {
    final String trimmed = base.endsWith('/')
        ? base.substring(0, base.length - 1)
        : base;
    return '$trimmed/presence';
  }

  @override
  void dispose() {
    _disposed = true;
    _wantForeground = false;
    _disconnect();
    _onlineCount.dispose();
  }
}

int? parsePresenceOnlineCount(Map<String, dynamic> event) {
  if (event['type'] != presenceOnlineCountType) return null;
  final Object? payload = event['payload'];
  if (payload is! Map) return null;
  final Object? count = payload['count'];
  if (count is int && count >= 0) return count;
  if (count is num && count >= 0) return count.toInt();
  return null;
}
