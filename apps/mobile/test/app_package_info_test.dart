import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/app_package_info.dart';

void main() {
  test('FakeAppPackageInfo returns injected version without hardcoding', () async {
    final FakeAppPackageInfo info = FakeAppPackageInfo(
      const ClientRuntimeMetadata(
        appVersion: '1.1.0',
        buildNumber: '42',
        platform: 'android',
      ),
    );
    final ClientRuntimeMetadata meta = await info.readRuntimeMetadata();
    expect(meta.appVersion, '1.1.0');
    expect(meta.buildNumber, '42');
    expect(meta.platform, 'android');
    expect(meta.toJson()['appVersion'], '1.1.0');
  });
}
