import 'package:flutter/widgets.dart';

import 'locale_metadata.dart';
import 'translation_resolver.dart';

/// Provides [TranslationResolver] to the widget tree.
class AppLocalization extends InheritedWidget {
  const AppLocalization({
    required this.resolver,
    required super.child,
    super.key,
  });

  final TranslationResolver resolver;

  static TranslationResolver of(BuildContext context) {
    final AppLocalization? scope = context
        .dependOnInheritedWidgetOfExactType<AppLocalization>();
    assert(scope != null, 'AppLocalization not found in widget tree');
    return scope!.resolver;
  }

  static TranslationResolver? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<AppLocalization>()
        ?.resolver;
  }

  String t(
    String key, {
    Map<String, String> params = const <String, String>{},
  }) {
    return resolver.resolve(key, params: params);
  }

  LocaleMetadata get localeMetadata => resolver.resolveLocaleMetadata();

  @override
  bool updateShouldNotify(AppLocalization oldWidget) {
    return oldWidget.resolver != resolver;
  }
}
