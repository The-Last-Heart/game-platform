import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// Four-segment energy meter (0..4 filled segments).
class EnergyDisplay extends StatelessWidget {
  const EnergyDisplay({
    required this.energy,
    this.maxSegments = 4,
    this.compact = false,
    super.key,
  });

  final int energy;
  final int maxSegments;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final int filled = energy.clamp(0, maxSegments);
    final double segmentWidth = compact ? 10 : 14;
    final double segmentHeight = compact ? 16 : 22;
    return Semantics(
      label: '$filled of $maxSegments energy',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            Icons.bolt,
            color: LhColors.warning,
            size: compact ? 18 : 22,
          ),
          const SizedBox(width: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: List<Widget>.generate(maxSegments, (int index) {
              final bool isFilled = index < filled;
              return Padding(
                padding: EdgeInsetsDirectional.only(
                  end: index == maxSegments - 1 ? 0 : 3,
                ),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: segmentWidth,
                  height: segmentHeight,
                  decoration: BoxDecoration(
                    color: isFilled
                        ? LhColors.warning
                        : LhColors.border.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: isFilled
                          ? LhColors.warning
                          : LhColors.border,
                    ),
                    boxShadow: isFilled
                        ? <BoxShadow>[
                            BoxShadow(
                              color: LhColors.warning.withValues(alpha: 0.35),
                              blurRadius: 6,
                            ),
                          ]
                        : null,
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
