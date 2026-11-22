package com.kennethyepez.defendercompanion;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

public final class MainActivity extends ComponentActivity {
  private int violet = Color.rgb(113, 57, 216),
      ink = Color.rgb(37, 35, 44),
      muted = Color.rgb(91, 84, 104),
      canvas = 0xFFEDE9F5;
  private int secondary = 0xFFEEE7FB;
  private boolean appliedDark;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private EditText address;
  private TextView status;
  private Button connect;
  private LinearLayout manualPanel;
  private SharedPreferences preferences;
  private final ActivityResultLauncher<Intent> scan =
      registerForActivityResult(
          new ActivityResultContracts.StartActivityForResult(),
          result -> {
            if (result.getResultCode() != RESULT_OK || result.getData() == null) return;
            try {
              String origin = WorkspaceAddress.normalize(result.getData().getStringExtra("origin"));
              address.setText(origin);
              manualPanel.setVisibility(View.VISIBLE);
              status.setTextColor(muted);
              status.setText("QR code read. Check the address, then open your workspace.");
            } catch (IllegalArgumentException invalid) {
              status.setTextColor(0xFFB82236);
              status.setText("This QR code does not contain a valid private workspace address.");
            }
          });

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private GradientDrawable shape(int color, int radius) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(color);
    d.setCornerRadius(dp(radius));
    return d;
  }

  private TextView text(String value, int size, int color, boolean strong) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setTextSize(size);
    v.setTextColor(color);
    v.setLineSpacing(dp(3), 1);
    if (strong) v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    return v;
  }

  private void add(LinearLayout box, View view, int top) {
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.topMargin = dp(top);
    box.addView(view, p);
  }

  private Button button(String label, boolean primary) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setTextSize(15);
    b.setTextColor(primary ? (appliedDark ? 0xFF251437 : Color.WHITE) : violet);
    b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    b.setMinHeight(dp(52));
    b.setPadding(dp(16), dp(12), dp(16), dp(12));
    b.setBackground(
        new RippleDrawable(
            ColorStateList.valueOf(primary ? 0x33FFFFFF : 0x227139D8),
            shape(primary ? violet : secondary, 14),
            null));
    b.setStateListAnimator(null);
    return b;
  }

  @Override
  public void onCreate(Bundle state) {
    appliedDark = NativeAppearance.isDark(this);
    setTheme(appliedDark ? R.style.AppThemeDark : R.style.AppTheme);
    super.onCreate(state);
    if (appliedDark) {
      violet = 0xFFBD96FF;
      ink = 0xFFF5F1FA;
      muted = 0xFFBDB3CA;
      canvas = 0xFF121018;
      secondary = 0xFF302240;
    }
    preferences = getSharedPreferences("connection", MODE_PRIVATE);
    if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    NativeAppearance.systemBars(this, false);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackground(NativeAppearance.glassCanvas(this));
    scroll.setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets s =
            insets.getInsets(
                WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout()
                    | WindowInsets.Type.ime());
        v.setPadding(s.left, s.top, s.right, s.bottom);
        return WindowInsets.CONSUMED;
      } else v.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom());
      return insets;
    });
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(dp(24), dp(20), dp(24), dp(20));
    scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
    LinearLayout brand = new LinearLayout(this);
    brand.setGravity(Gravity.CENTER_VERTICAL);
    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.ic_shield);
    icon.setContentDescription(null);
    icon.setPadding(dp(8), dp(8), dp(8), dp(8));
    icon.setBackground(shape(0xFF7139D8, 12));
    brand.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));
    TextView name = text("Defender Companion", 16, ink, true);
    LinearLayout.LayoutParams nameLayout = new LinearLayout.LayoutParams(-1, -2);
    nameLayout.leftMargin = dp(12);
    brand.addView(name, nameLayout);
    add(page, brand, 0);
    add(page, text("Connect your workspace", 27, ink, true), 28);
    add(page, text("Your alerts, devices and next steps in one place.", 15, muted, false), 10);
    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(20), dp(20), dp(20), dp(16));
    card.setBackground(NativeAppearance.glassCard(this, 18));
    card.setElevation(dp(2));
    add(page, card, 24);
    add(card, text("Private workspace", 17, ink, true), 0);
    add(
        card,
        text(
            "Scan your workspace QR, then sign in with your passkey in your browser.",
            14,
            muted,
            false),
        6);
    Button qr = button("Scan connection QR", true);
    qr.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_qr, 0, 0, 0);
    qr.setCompoundDrawablePadding(dp(10));
    qr.setCompoundDrawableTintList(ColorStateList.valueOf(appliedDark ? 0xFF251437 : Color.WHITE));
    qr.setOnClickListener(v -> scan.launch(new Intent(this, ScanActivity.class)));
    add(card, qr, 16);
    Button manual = button("Enter address instead", false);
    manual.setBackgroundColor(Color.TRANSPARENT);
    manual.setOnClickListener(v ->
        manualPanel.setVisibility(
            manualPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
    add(card, manual, 6);
    manualPanel = new LinearLayout(this);
    manualPanel.setOrientation(LinearLayout.VERTICAL);
    manualPanel.setVisibility(
        preferences.getString("origin", "").isEmpty() ? View.GONE : View.VISIBLE);
    add(card, manualPanel, 0);
    TextView label = text("Workspace address", 13, ink, true);
    add(manualPanel, label, 8);
    address = new EditText(this);
    address.setId(R.id.workspace_address);
    label.setLabelFor(R.id.workspace_address);
    address.setTextSize(14);
    address.setTextColor(ink);
    address.setHintTextColor(muted);
    address.setHint("Private workspace URL");
    address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    address.setSingleLine(true);
    address.setSelectAllOnFocus(false);
    address.setPadding(dp(12), dp(14), dp(12), dp(14));
    GradientDrawable border = shape(canvas, 12);
    border.setStroke(dp(1), appliedDark ? 0xFF40374D : 0xFFE5E3EB);
    address.setBackground(border);
    address.setText(preferences.getString("origin", ""));
    add(manualPanel, address, 8);
    connect = button("Open workspace", true);
    connect.setOnClickListener(v -> checkWorkspace());
    add(manualPanel, connect, 12);
    status = text("Use the address from your workspace setup.", 13, muted, false);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    add(manualPanel, status, 10);
    if (!preferences.getString("origin", "").isEmpty()) {
      Button forget = button("Forget address", false);
      forget.setOnClickListener(v -> {
        preferences.edit().remove("origin").apply();
        address.setText("");
        status.setText("Address removed. Your browser sessions are unchanged.");
        v.setVisibility(View.GONE);
      });
      add(manualPanel, forget, 10);
    }
    Button demo = button("Explore offline demo", false);
    demo.setOnClickListener(v -> startActivity(new Intent(this, DemoActivity.class)));
    add(page, demo, 20);
    TextView sample = text("Fictional data · No account needed", 13, muted, false);
    sample.setGravity(Gravity.CENTER);
    add(page, sample, 6);
    // Use spare viewport height for a footer; collapse naturally when the form needs scrolling.
    View footerSpace = new View(this);
    footerSpace.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    page.addView(footerSpace, new LinearLayout.LayoutParams(-1, 0, 1f));
    Button privacy = button("Privacy & access", false);
    privacy.setBackgroundColor(Color.TRANSPARENT);
    privacy.setOnClickListener(v ->
        new AlertDialog.Builder(this)
            .setTitle("Privacy & access")
            .setMessage(
                "For private access, this app saves only the workspace address. Sign-in and"
                    + " sessions stay in your browser.\n\n"
                    + "The offline demo uses fictional records. Demo notes and preferences stay on"
                    + " this device. Exports use the file picker you control.\n\n"
                    + "The camera is used only when you scan a connection QR. Images are processed"
                    + " on your device and are not saved by the app. You can also enter the address"
                    + " or choose a QR image without granting camera access.")
            .setPositiveButton("Done", null)
            .show());
    add(page, privacy, 8);
    setContentView(scroll);
  }

  private void checkWorkspace() {
    final String origin;
    try {
      origin = WorkspaceAddress.normalize(address.getText().toString());
    } catch (IllegalArgumentException error) {
      address.setError(error.getMessage());
      return;
    }
    connect.setEnabled(false);
    connect.setAlpha(0.65f);
    status.setTextColor(muted);
    status.setText("Checking workspace…");
    worker.execute(() -> {
      String error = null;
      HttpsURLConnection connection = null;
      try {
        connection = (HttpsURLConnection) new URL(origin + "/api/auth/status").openConnection();
        connection.setConnectTimeout(6000);
        connection.setReadTimeout(6000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        int code = connection.getResponseCode();
        if (code == 403)
          throw new Exception(
              "Your private network account does not have access to this workspace.");
        if (code != 200
            || connection.getContentType() == null
            || !connection.getContentType().startsWith("application/json"))
          throw new Exception("This address did not respond as a Defender Companion workspace.");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream input = connection.getInputStream()) {
          byte[] buffer = new byte[2048];
          int count;
          while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > 16384)
              throw new Exception("The workspace response could not be verified.");
            output.write(buffer, 0, count);
          }
        }
        JSONObject result = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        if (!(result.get("enrolled") instanceof Boolean)
            || !(result.get("authenticated") instanceof Boolean)
            || result.optLong("idleTimeoutMs", 0) <= 0
            || result.optLong("idleTimeoutMs", 0) > 900000)
          throw new Exception("The workspace response could not be verified.");
      } catch (Exception failure) {
        error = failure.getMessage();
        if (error == null
            || !(error.startsWith("Your private")
                || error.startsWith("This address")
                || error.startsWith("The workspace")))
          error =
              "Workspace not reachable. Connect to your private network, check the address and try"
                  + " again.";
      } finally {
        if (connection != null) connection.disconnect();
      }
      final String outcome = error;
      runOnUiThread(() -> {
        if (isFinishing() || isDestroyed()) return;
        connect.setEnabled(true);
        connect.setAlpha(1);
        if (outcome != null) {
          status.setTextColor(0xFFB82236);
          status.setText(outcome);
          return;
        }
        status.setTextColor(muted);
        status.setText("Workspace reached. Continue with your passkey.");
        new AlertDialog.Builder(this)
            .setTitle("Open private workspace?")
            .setMessage(
                origin
                    + "\n\n"
                    + "Check this address before signing in. Your passkey and session stay in your"
                    + " browser.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton(
                "Open workspace",
                (d, w) -> {
                  preferences.edit().putString("origin", origin).apply();
                  openBrowser(Uri.parse(origin + "/?mode=live#access"));
                })
            .show();
      });
    });
  }

  private void openBrowser(Uri uri) {
    try {
      CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
      String provider = CustomTabsClient.getPackageName(this, null);
      if (provider != null) tab.intent.setPackage(provider);
      tab.launchUrl(this, uri);
    } catch (Exception unavailable) {
      status.setTextColor(0xFFB82236);
      status.setText(
          "A browser is needed for private passkey access. Install or enable one, then try again.");
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    if (appliedDark != NativeAppearance.isDark(this)) recreate();
  }

  @Override
  public void onDestroy() {
    worker.shutdownNow();
    super.onDestroy();
  }
}
