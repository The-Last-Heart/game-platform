import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';
import 'lh_ui_sound.dart';

Future<void> _fireTap(VoidCallback? onPressed) async {
  if (onPressed == null) return;
  // Invoke immediately so UI actions are not blocked by audio/haptics.
  onPressed();
  await LhUiSound.instance.playTap();
}

/// Primary stadium CTA — solid red with soft glow (e.g. العب الآن).
class LhPrimaryButton extends StatefulWidget {
  const LhPrimaryButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.height = 56,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;

  @override
  State<LhPrimaryButton> createState() => _LhPrimaryButtonState();
}

class _LhPrimaryButtonState extends State<LhPrimaryButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final bool enabled = widget.onPressed != null;
    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
      onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
      onTapUp: enabled
          ? (_) {
              setState(() => _pressed = false);
              _fireTap(widget.onPressed);
            }
          : null,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 90),
        child: AnimatedOpacity(
          opacity: enabled ? 1 : 0.45,
          duration: const Duration(milliseconds: 120),
          child: Container(
            height: widget.height,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: LhColors.primary,
              borderRadius: LhRadii.pillAll,
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: LhColors.primary.withValues(alpha: 0.45),
                  blurRadius: 18,
                  spreadRadius: 0,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  widget.label,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: LhColors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (widget.icon != null) ...<Widget>[
                  const SizedBox(width: 8),
                  Icon(widget.icon, color: LhColors.text, size: 22),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Secondary CTA — dark fill with cyan/blue border glow (e.g. إلغاء البحث).
class LhSecondaryButton extends StatefulWidget {
  const LhSecondaryButton({
    required this.label,
    required this.onPressed,
    this.height = 52,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final double height;

  @override
  State<LhSecondaryButton> createState() => _LhSecondaryButtonState();
}

class _LhSecondaryButtonState extends State<LhSecondaryButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final bool enabled = widget.onPressed != null;
    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
      onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
      onTapUp: enabled
          ? (_) {
              setState(() => _pressed = false);
              _fireTap(widget.onPressed);
            }
          : null,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 90),
        child: AnimatedOpacity(
          opacity: enabled ? 1 : 0.45,
          duration: const Duration(milliseconds: 120),
          child: Container(
            height: widget.height,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: LhColors.elevated.withValues(alpha: 0.85),
              borderRadius: LhRadii.pillAll,
              border: Border.all(
                color: LhColors.success.withValues(alpha: 0.85),
                width: 1.5,
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: LhColors.success.withValues(alpha: 0.22),
                  blurRadius: 14,
                  spreadRadius: 0,
                ),
              ],
            ),
            child: Text(
              widget.label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: LhColors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Compact chrome control with tap SFX (back, text actions).
class LhChromeIconButton extends StatelessWidget {
  const LhChromeIconButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
    super.key,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final Widget child = Material(
      color: LhColors.elevated.withValues(alpha: 0.9),
      borderRadius: LhRadii.mdAll,
      child: InkWell(
        borderRadius: LhRadii.mdAll,
        onTap: () => _fireTap(onPressed),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: LhColors.text, size: 22),
        ),
      ),
    );
    if (tooltip == null) return child;
    return Tooltip(message: tooltip, child: child);
  }
}
