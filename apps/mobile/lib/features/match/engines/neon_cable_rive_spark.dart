import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:rive/rive.dart' as rive;

Future<Object?> decodeCableSparkRive(Uint8List bytes) {
  return rive.File.decode(bytes, riveFactory: rive.Factory.flutter);
}

Object createCableSparkController(
  Object file, {
  required String kind,
}) {
  final String artboard = kind == 'red' ? 'Red Spark' : 'Cyan Spark';
  return rive.RiveWidgetController(
    file as rive.File,
    artboardSelector: rive.ArtboardSelector.byName(artboard),
    stateMachineSelector: rive.StateMachineSelector.byName('State Machine 1'),
  );
}

Widget buildCableSparkView(Object controller) {
  return rive.RiveWidget(
    controller: controller as rive.RiveWidgetController,
    fit: rive.Fit.contain,
  );
}

void disposeCableSparkController(Object? controller) {
  if (controller is rive.RiveWidgetController) {
    controller.dispose();
  }
}

void disposeCableSparkFile(Object? file) {
  if (file is rive.File) {
    file.dispose();
  }
}
