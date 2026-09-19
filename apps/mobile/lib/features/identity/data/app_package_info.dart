import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Cross-platform installed application metadata (not build-number matchmaking).
@immutable
class ClientRuntimeMetadata {
  const ClientRuntimeMetadata({
    required this.appVersion,
    required this.buildNumber,
    required this.platform,
  });

  final String appVersion;
  final String buildNumber;
  final String platform;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'appVersion': appVersion,
        'buildNumber': buildNumber,
        'platform': platform,
      };
}

/// Abstraction over package information so tests can inject fixed versions.
abstract class AppPackageInfo {
  Future<ClientRuntimeMetadata> readRuntimeMetadata();
}

class PackageInfoAppPackageInfo implements AppPackageInfo {
  PackageInfoAppPackageInfo({PackageInfo? seed}) : _cached = seed;

  PackageInfo? _cached;

  @override
  Future<ClientRuntimeMetadata> readRuntimeMetadata() async {
    final PackageInfo info = _cached ?? await PackageInfo.fromPlatform();
    _cached = info;
    final String platform;
    if (kIsWeb) {
      platform = 'android';
    } else if (Platform.isIOS) {
      platform = 'ios';
    } else {
      platform = 'android';
    }
    return ClientRuntimeMetadata(
      appVersion: info.version,
      buildNumber: info.buildNumber,
      platform: platform,
    );
  }
}

/// Fixed metadata for widget / unit tests.
class FakeAppPackageInfo implements AppPackageInfo {
  FakeAppPackageInfo(this.metadata);

  ClientRuntimeMetadata metadata;

  @override
  Future<ClientRuntimeMetadata> readRuntimeMetadata() async => metadata;
}
