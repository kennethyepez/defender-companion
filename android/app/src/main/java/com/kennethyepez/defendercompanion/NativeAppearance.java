package com.kennethyepez.defendercompanion;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;

/** The same three appearance choices used by the bundled workspace; no account data. */
final class NativeAppearance {
  static boolean systemIsDark(Context context) {
    return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
  }

  static boolean isDark(Context context) {
    String mode =
        context
            .getSharedPreferences("appearance", Context.MODE_PRIVATE)
            .getString("mode", "system");
    return "dark".equals(mode) || ("system".equals(mode) && systemIsDark(context));
  }

  static void save(Context context, String mode) {
    if (!"system".equals(mode) && !"light".equals(mode) && !"dark".equals(mode)) return;
    context
        .getSharedPreferences("appearance", Context.MODE_PRIVATE)
        .edit()
        .putString("mode", mode)
        .apply();
  }

  static int color(Context context, int light, int dark) {
    return isDark(context) ? dark : light;
  }

  static GradientDrawable glassCanvas(Context context) {
    return new GradientDrawable(
        GradientDrawable.Orientation.TR_BL,
        isDark(context)
            ? new int[] {0xFF302042, 0xFF121018, 0xFF1B1C30}
            : new int[] {0xFFD9C7F2, 0xFFEDE9F5, 0xFFDADDF2});
  }

  static GradientDrawable glassCard(Context context, int radius) {
    boolean dark = isDark(context);
    float density = context.getResources().getDisplayMetrics().density;
    GradientDrawable card =
        new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            dark ? new int[] {0xBD30253F, 0xAD241D35} : new int[] {0x7BFBF9FF, 0x52F8F5FF});
    card.setCornerRadius(radius * density);
    card.setStroke(Math.max(1, Math.round(density)), dark ? 0x31D7BFFF : 0xADFFFFFF);
    return card;
  }

  static void systemBars(Activity activity, boolean purpleChrome) {
    boolean light = !purpleChrome && !isDark(activity);
    activity
        .getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            light
                ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                : 0);
    if (Build.VERSION.SDK_INT >= 30) {
      int mask =
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
              | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
      activity.getWindow().getInsetsController().setSystemBarsAppearance(light ? mask : 0, mask);
    }
  }
}
