import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/transport/fake_transport.dart';

void main() {
  group('FakeTransport', () {
    test('connect sets isConnected', () async {
      final FakeTransport transport = FakeTransport();
      expect(transport.isConnected, isFalse);
      await transport.connect();
      expect(transport.isConnected, isTrue);
      transport.dispose();
    });

    test('connection failure throws and sets disconnected', () async {
      final FakeTransport transport = FakeTransport(connectShouldFail: true);
      expect(() => transport.connect(), throwsException);
      expect(transport.isConnected, isFalse);
      transport.dispose();
    });

    test('emitEvent delivers events to stream', () async {
      final FakeTransport transport = FakeTransport();
      await transport.connect();

      final List<Map<String, dynamic>> received = <Map<String, dynamic>>[];
      transport.events.listen(received.add);

      transport.emitEvent(<String, dynamic>{'type': 'test'});
      await Future<void>.delayed(Duration.zero);
      expect(received.length, 1);
      expect(received[0]['type'], 'test');
      transport.dispose();
    });

    test('sendCommand captures commands', () async {
      final FakeTransport transport = FakeTransport();
      await transport.connect();
      transport.sendCommand(<String, dynamic>{'type': 'cmd'});
      expect(transport.sentCommands.length, 1);
      expect(transport.sentCommands[0]['type'], 'cmd');
      transport.dispose();
    });

    test('simulateDisconnect sets isConnected to false', () async {
      final FakeTransport transport = FakeTransport();
      await transport.connect();
      expect(transport.isConnected, isTrue);
      transport.simulateDisconnect();
      expect(transport.isConnected, isFalse);
      transport.dispose();
    });

    test('connectionState stream emits changes', () async {
      final FakeTransport transport = FakeTransport();
      final List<bool> states = <bool>[];
      transport.connectionState.listen(states.add);

      await transport.connect();
      transport.simulateDisconnect();
      transport.simulateReconnect();
      await Future<void>.delayed(Duration.zero);

      expect(states, containsAllInOrder(<bool>[true, false, true]));
      transport.dispose();
    });
  });
}
