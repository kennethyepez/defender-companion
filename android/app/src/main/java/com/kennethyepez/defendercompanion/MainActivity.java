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
  private final int violet = Color.rgb(113, 57, 216),
      ink = Color.rgb(37, 35, 44),
      muted = Color.rgb(104, 101, 114),
      canvas = Color.rgb(246, 246, 249);
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private EditText address;
  private TextView status;
  private Button connect;
  private SharedPreferences preferences;
  private final ActivityResultLauncher<Intent> scan =
      registerForActivityResult(
          new ActivityResultContracts.StartActivityForResult(),
          result -> {
            if (result.getResultCode() != RESULT_OK || result.getData() == null) return;
            try {
              String origin = WorkspaceAddress.normalize(result.getData().getStringExtra("origin"));
              address.setText(origin);
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
    b.setTextColor(primary ? Color.WHITE : violet);
    b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    b.setMinHeight(dp(52));
    b.setPadding(dp(16), dp(12), dp(16), dp(12));
    b.setBackground(
        new RippleDrawable(
            ColorStateList.valueOf(primary ? 0x33FFFFFF : 0x227139D8),
            shape(primary ? violet : 0xFFEEE7FB, 14),
            null));
    b.setStateListAnimator(null);
    return b;
  }

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    preferences = getSharedPreferences("connection", MODE_PRIVATE);
    if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(canvas);
    scroll.setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets s =
            insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
        v.setPadding(s.left, s.top, s.right, s.bottom);
      } else v.setPadding(0, 0, 0, insets.getSystemWindowInsetBottom());
      return insets;
    });
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(dp(24), dp(26), dp(24), dp(28));
    scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
    LinearLayout brand = new LinearLayout(this);
    brand.setGravity(Gravity.CENTER_VERTICAL);
    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.ic_shield);
    icon.setContentDescription(null);
    icon.setPadding(dp(11), dp(11), dp(11), dp(11));
    icon.setBackground(shape(violet, 16));
    brand.addView(icon, new LinearLayout.LayoutParams(dp(54), dp(54)));
    TextView name = text("Defender\nCompanion", 18, ink, true);
    LinearLayout.LayoutParams nameLayout = new LinearLayout.LayoutParams(-1, -2);
    nameLayout.leftMargin = dp(12);
    brand.addView(name, nameLayout);
    add(page, brand, 0);
    add(page, text("Choose your\nworkspace", 30, ink, true), 32);
    add(
        page,
        text("Review alerts, follow the evidence and decide what comes next.", 15, muted, false),
        10);
    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(20), dp(22), dp(20), dp(22));
    card.setBackground(shape(Color.WHITE, 20));
    add(page, card, 26);
    add(card, text("Private workspace", 19, ink, true), 0);
    add(card, text("Sign in with your passkey in your browser.", 14, muted, false), 6);
    Button qr = button("Scan connection QR", false);
    qr.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_qr, 0, 0, 0);
    qr.setCompoundDrawablePadding(dp(10));
    qr.setOnClickListener(v -> scan.launch(new Intent(this, ScanActivity.class)));
    add(card, qr, 20);
    TextView label = text("Workspace address", 13, ink, true);
    add(card, label, 22);
    address = new EditText(this);
    address.setId(R.id.workspace_address);
    label.setLabelFor(R.id.workspace_address);
    address.setTextSize(14);
    address.setTextColor(ink);
    address.setHintTextColor(muted);
    address.setHint("https://computer.example.ts.net:18449");
    address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    address.setSingleLine(true);
    address.setSelectAllOnFocus(false);
    address.setPadding(dp(12), dp(14), dp(12), dp(14));
    GradientDrawable border = shape(canvas, 12);
    border.setStroke(dp(1), 0xFFE5E3EB);
    address.setBackground(border);
    address.setText(preferences.getString("origin", ""));
    add(card, address, 8);
    connect = button("Open private workspace", true);
    connect.setOnClickListener(v -> checkWorkspace());
    add(card, connect, 16);
    status = text("Use the private address provided during setup.", 13, muted, false);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    add(card, status, 12);
    if (!preferences.getString("origin", "").isEmpty()) {
      Button forget = button("Forget address", false);
      forget.setOnClickListener(v -> {
        preferences.edit().remove("origin").apply();
        address.setText("");
        status.setText("Address removed. Your browser sessions are unchanged.");
        v.setVisibility(View.GONE);
      });
      add(card, forget, 12);
    }
    Button demo = button("Explore offline demo", false);
    demo.setOnClickListener(v -> startActivity(new Intent(this, DemoActivity.class)));
    add(page, demo, 24);
    TextView sample =
        text("Fictional alerts. All 46 screens. No account needed.", 13, muted, false);
    sample.setGravity(Gravity.CENTER);
    add(page, sample, 10);
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
    add(page, privacy, 22);
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
  public void onDestroy() {
    worker.shutdownNow();
    super.onDestroy();
  }
}
