package com.kennethyepez.defendercompanion;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Camera frames and selected images are decoded locally; a QR can only fill an address. */
public final class ScanActivity extends ComponentActivity {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final AtomicBoolean processing = new AtomicBoolean();
  private BarcodeScanner scanner;
  private PreviewView preview;
  private TextView status;
  private ProcessCameraProvider camera;
  private volatile boolean paused;
  private boolean returned;
  private final ActivityResultLauncher<String> permission =
      registerForActivityResult(
          new ActivityResultContracts.RequestPermission(),
          granted -> {
            if (granted) startCamera();
            else
              status.setText(
                  "Camera access was not granted. Choose a QR image or go back to enter the"
                      + " address.");
          });
  private final ActivityResultLauncher<String[]> image =
      registerForActivityResult(
          new ActivityResultContracts.OpenDocument(),
          uri -> {
            if (uri != null) readImage(uri);
            else status.setText("No image selected. You can use the camera or try another image.");
          });

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private TextView text(String value, int size, boolean strong) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setTextSize(size);
    v.setTextColor(NativeAppearance.color(this, 0xFF25232C, 0xFFF5F1FA));
    v.setLineSpacing(dp(3), 1);
    if (strong) v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    return v;
  }

  private Button button(String label, Runnable action) {
    Button v = new Button(this);
    v.setText(label);
    v.setAllCaps(false);
    v.setTextSize(15);
    v.setTextColor(0xFF7139D8);
    v.setMinHeight(dp(52));
    boolean primary = label.equals("Use camera");
    v.setTextColor(
        primary
            ? android.graphics.Color.WHITE
            : NativeAppearance.color(this, 0xFF7139D8, 0xFFBD96FF));
    v.setPadding(dp(16), dp(12), dp(16), dp(12));
    v.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    GradientDrawable background = new GradientDrawable();
    background.setColor(
        primary ? 0xFF7139D8 : NativeAppearance.color(this, 0xFFEEE7FB, 0xFF302240));
    background.setCornerRadius(dp(14));
    v.setBackground(new RippleDrawable(ColorStateList.valueOf(0x227139D8), background, null));
    v.setStateListAnimator(null);
    LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
    layout.topMargin = dp(8);
    v.setLayoutParams(layout);
    v.setOnClickListener(view -> action.run());
    return v;
  }

  @Override
  public void onCreate(Bundle saved) {
    setTheme(NativeAppearance.isDark(this) ? R.style.AppThemeDark : R.style.AppTheme);
    super.onCreate(saved);
    NativeAppearance.systemBars(this, false);
    try {
      scanner =
          BarcodeScanning.getClient(
              new BarcodeScannerOptions.Builder()
                  .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                  .build());
    } catch (RuntimeException unavailable) {
      android.widget.Toast.makeText(
              this,
              "QR reader unavailable. Enter the workspace address instead.",
              android.widget.Toast.LENGTH_LONG)
          .show();
      finish();
      return;
    }
    if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setBackgroundColor(NativeAppearance.color(this, 0xFFF6F6F9, 0xFF121018));
    page.setPadding(dp(24), dp(24), dp(24), dp(24));
    page.setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets s = insets.getInsets(WindowInsets.Type.systemBars());
        v.setPadding(dp(24) + s.left, dp(24) + s.top, dp(24) + s.right, dp(24) + s.bottom);
      }
      return insets;
    });
    page.addView(text("Scan connection QR", 27, true));
    TextView help =
        text(
            "Scan the QR from your private workspace. Check its address before connecting.",
            15,
            false);
    help.setPadding(0, dp(10), 0, dp(20));
    page.addView(help);
    preview = new PreviewView(this);
    preview.setContentDescription("Connection QR camera preview");
    preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
    GradientDrawable background = new GradientDrawable();
    background.setColor(NativeAppearance.color(this, 0xFFEEE7FB, 0xFF302240));
    background.setCornerRadius(dp(20));
    preview.setBackground(background);
    preview.setClipToOutline(true);
    boolean landscape =
        getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    page.addView(
        preview,
        landscape
            ? new LinearLayout.LayoutParams(-1, dp(240))
            : new LinearLayout.LayoutParams(-1, 0, 1));
    status =
        text(
            "The camera starts only when you choose Use camera. Your QR image stays on this"
                + " device.",
            14,
            false);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    status.setPadding(0, dp(18), 0, dp(12));
    page.addView(status);
    page.addView(
        button(
            "Use camera",
            () -> {
              paused = false;
              if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                  == PackageManager.PERMISSION_GRANTED) startCamera();
              else permission.launch(Manifest.permission.CAMERA);
            }));
    page.addView(
        button(
            "Choose QR image",
            () -> {
              paused = true;
              if (camera != null) camera.unbindAll();
              image.launch(new String[] {"image/png", "image/jpeg", "image/webp"});
            }));
    page.addView(button("Enter address instead", this::finish));
    if (landscape) {
      ScrollView scroll = new ScrollView(this);
      scroll.setFillViewport(true);
      scroll.addView(page, new ScrollView.LayoutParams(-1, -2));
      setContentView(scroll);
    } else setContentView(page);
    preview
        .getPreviewStreamState()
        .observe(
            this,
            stream -> {
              if (stream == PreviewView.StreamState.STREAMING && !paused)
                status.setText("Point the camera at your connection QR. No photo will be saved.");
            });
  }

  @androidx.annotation.OptIn(markerClass = ExperimentalGetImage.class)
  private void startCamera() {
    status.setText("Starting camera…");
    ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
    future.addListener(
        () -> {
          if (isFinishing() || isDestroyed() || paused) return;
          try {
            camera = future.get();
            camera.unbindAll();
            Preview view = new Preview.Builder().build();
            view.setSurfaceProvider(preview.getSurfaceProvider());
            ImageAnalysis analysis =
                new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
            analysis.setAnalyzer(
                worker,
                frame -> {
                  if (paused || !processing.compareAndSet(false, true)) {
                    frame.close();
                    return;
                  }
                  if (frame.getImage() == null) {
                    processing.set(false);
                    frame.close();
                    return;
                  }
                  InputImage input =
                      InputImage.fromMediaImage(
                          frame.getImage(), frame.getImageInfo().getRotationDegrees());
                  scanner
                      .process(input)
                      .addOnSuccessListener(this::readCodes)
                      .addOnFailureListener(error -> {
                        if (!isFinishing() && !isDestroyed())
                          status.setText(
                              "The QR could not be read. Hold it steady or choose a QR image.");
                      })
                      .addOnCompleteListener(task -> {
                        frame.close();
                        processing.set(false);
                      });
                });
            camera.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, view, analysis);
          } catch (Exception unavailable) {
            status.setText(
                "Camera unavailable. Choose a QR image or go back to enter the address.");
          }
        },
        ContextCompat.getMainExecutor(this));
  }

  private void readImage(Uri uri) {
    if (!"content".equals(uri.getScheme())) return;
    status.setText("Reading QR image…");
    worker.execute(() -> {
      Bitmap decoded = null;
      try {
        try (android.content.res.AssetFileDescriptor file =
            getContentResolver().openAssetFileDescriptor(uri, "r")) {
          if (file == null || file.getLength() > 12 * 1024 * 1024) throw new java.io.IOException();
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
          BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth < 1
            || bounds.outHeight < 1
            || bounds.outWidth > 16000
            || bounds.outHeight > 16000) throw new java.io.IOException();
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2048)
          options.inSampleSize *= 2;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
          decoded = BitmapFactory.decodeStream(in, null, options);
        }
        if (decoded == null) throw new java.io.IOException();
        Bitmap bitmap = decoded;
        scanner
            .process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(codes -> {
              if (codes.isEmpty())
                status.setText("No QR code found. Choose a clear QR image or use the camera.");
              else readCodes(codes);
            })
            .addOnFailureListener(
                error -> status.setText("This QR image could not be read. Try another image."))
            .addOnCompleteListener(task -> bitmap.recycle());
      } catch (Exception invalid) {
        if (decoded != null) decoded.recycle();
        runOnUiThread(() -> {
          if (!isDestroyed()) status.setText("Choose a PNG, JPEG or WebP QR image under 12 MB.");
        });
      }
    });
  }

  private void readCodes(List<Barcode> codes) {
    if (isFinishing() || isDestroyed() || returned || codes.isEmpty()) return;
    // Never open the scanned value or send a request here. The caller revalidates it.
    try {
      if (codes.size() != 1) throw new IllegalArgumentException();
      String origin = WorkspaceAddress.normalize(codes.get(0).getRawValue());
      returned = true;
      paused = true;
      if (camera != null) camera.unbindAll();
      setResult(RESULT_OK, new Intent().putExtra("origin", origin));
      finish();
    } catch (IllegalArgumentException invalid) {
      paused = true;
      if (camera != null) camera.unbindAll();
      status.setText(
          "Use a single private workspace QR containing only its HTTPS .ts.net address. Sign-in"
              + " tokens and other links are rejected.");
    }
  }

  @Override
  public void onDestroy() {
    paused = true;
    if (camera != null) camera.unbindAll();
    if (scanner != null) scanner.close();
    worker.shutdownNow();
    super.onDestroy();
  }
}
