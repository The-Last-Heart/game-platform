import 'dart:convert';
import 'dart:io' show HttpClient, HttpClientRequest, HttpClientResponse;

import 'package:flutter/foundation.dart';

import 'app_package_info.dart';

@immutable
class MobileVersionPolicy {
  const MobileVersionPolicy({
    required this.minimumSupportedVersion,
    required this.updateRequired,
    required this.storeUrl,
    required this.policyRevision,
  });

  final String minimumSupportedVersion;
  final bool updateRequired;
  final String storeUrl;
  final int policyRevision;

  factory MobileVersionPolicy.fromJson(Map<String, dynamic> json) {
    return MobileVersionPolicy(
      minimumSupportedVersion: json['minimumSupportedVersion'] as String,
      updateRequired: json['updateRequired'] as bool,
      storeUrl: json['storeUrl'] as String,
      policyRevision: (json['policyRevision'] as num).toInt(),
    );
  }
}

/// Fetches the authoritative mandatory-update decision from the backend.
class MobileVersionPolicyClient {
  MobileVersionPolicyClient({
    required this.backendBaseUrl,
    required this.packageInfo,
    this.httpGet,
  });

  final String backendBaseUrl;
  final AppPackageInfo packageInfo;
  final Future<String> Function(Uri uri)? httpGet;

  Future<MobileVersionPolicy> fetchPolicy() async {
    final ClientRuntimeMetadata meta = await packageInfo.readRuntimeMetadata();
    final Uri uri = Uri.parse('$backendBaseUrl/v1/mobile/version-policy')
        .replace(
          queryParameters: <String, String>{
            'platform': meta.platform,
            'appVersion': meta.appVersion,
          },
        );
    final String body = httpGet != null
        ? await httpGet!(uri)
        : await _defaultGet(uri);
    final Object? decoded = jsonDecode(body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('version policy response invalid');
    }
    return MobileVersionPolicy.fromJson(decoded);
  }

  static Future<String> _defaultGet(Uri uri) async {
    final HttpClient client = HttpClient();
    try {
      final HttpClientRequest request = await client.getUrl(uri);
      final HttpClientResponse response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError('version policy HTTP ${response.statusCode}');
      }
      return await utf8.decoder.bind(response).join();
    } finally {
      client.close(force: true);
    }
  }
}
