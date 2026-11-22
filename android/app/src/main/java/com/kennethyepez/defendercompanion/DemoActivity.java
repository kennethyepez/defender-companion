package com.kennethyepez.defendercompanion;

import android.content.Intent;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/** Offline fixture renderer. It never loads a tenant, sign-in page or remote script. */
public final class DemoActivity extends ComponentActivity {
  private static final String HOST = "appassets.androidplatform.net";
  private static final String ORIGIN = "https://" + HOST;
  private static final int SAVE_EXPORT = 41;
  private WebView web;
  private byte[] pendingExport;

  private static boolean local(Uri url) {
    return "https".equals(url.getScheme())
        && HOST.equals(url.getHost())
        && url.getPort() == -1
        && url.getUserInfo() == null
        && url.getQuery() == null
        && url.getPath() != null
        && url.getPath().startsWith("/assets/web/");
  }

  private static WebResourceResponse blocked() {
    return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        403,
        "Blocked",
        Collections.emptyMap(),
        new ByteArrayInputStream(
            "This offline view does not load network content.".getBytes(StandardCharsets.UTF_8)));
  }

  @Override
  public void onCreate(Bundle state) {
    // Keep WebView's prefers-color-scheme tied to Android; the web choice can override it.
    setTheme(NativeAppearance.systemIsDark(this) ? R.style.AppThemeDark : R.style.AppTheme);
    super.onCreate(state);
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      Toast.makeText(
              this,
              "Update Android System WebView to open this demo and save exports.",
              Toast.LENGTH_LONG)
          .show();
      finish();
      return;
    }
    if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
    NativeAppearance.systemBars(this, true);
    FrameLayout frame = new FrameLayout(this);
    frame.setBackgroundColor(0xFF6330BD);
    frame.setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets s =
            insets.getInsets(
                WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout()
                    | WindowInsets.Type.ime());
        v.setPadding(s.left, s.top, s.right, s.bottom);
        return WindowInsets.CONSUMED;
      }
      return insets;
    });
    web = new WebView(this);
    web.setId(R.id.demo_webview);
    web.setBackgroundColor(NativeAppearance.color(this, 0xFFF6F6F9, 0xFF121018));
    WebView.setWebContentsDebuggingEnabled(false);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setSupportMultipleWindows(false);
    settings.setGeolocationEnabled(false);
    settings.setSafeBrowsingEnabled(true);
    CookieManager.getInstance().setAcceptCookie(false);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
    final WebViewAssetLoader loader =
        new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
    web.setWebViewClient(
        new WebViewClientCompat() {
          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            if (!local(request.getUrl())) return blocked();
            WebResourceResponse result = loader.shouldInterceptRequest(request.getUrl());
            return result == null ? blocked() : result;
          }

          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (local(uri)) return false;
            if (request.isForMainFrame()
                && request.hasGesture()
                && "https".equals(uri.getScheme())
                && "github.com".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getUserInfo() == null
                && uri.getPath() != null
                && (uri.getPath().equals("/kennethyepez/defender-companion")
                    || uri.getPath().startsWith("/kennethyepez/defender-companion/")))
              new CustomTabsIntent.Builder().build().launchUrl(DemoActivity.this, uri);
            return true;
          }

          @Override
          public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
          }

          @Override
          public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            frame.removeView(view);
            view.destroy();
            web = null;
            Toast.makeText(
                    DemoActivity.this,
                    "The demo closed. Open it again to continue.",
                    Toast.LENGTH_LONG)
                .show();
            finish();
            return true;
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onPermissionRequest(PermissionRequest request) {
            request.deny();
          }
        });
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(
          web,
          "DefenderNative",
          Collections.singleton(ORIGIN),
          (view, message, sourceOrigin, isMainFrame, reply) -> {
            if (!isMainFrame
                || !ORIGIN.equals(sourceOrigin.toString())
                || isFinishing()
                || !hasWindowFocus()) return;
            String value = message.getData();
            if (value == null || value.length() > 262144) return;
            try {
              JSONObject action = new JSONObject(value);
              if ("appearance".equals(action.optString("action"))) {
                NativeAppearance.save(this, action.optString("value"));
                return;
              }
              if (!"exportDemo".equals(action.getString("action"))) return;
              String json = action.getString("json");
              JSONObject snapshot = new JSONObject(json);
              if (!"sample".equals(snapshot.getString("mode"))) return;
              byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
              if (bytes.length > 131072 || pendingExport != null) return;
              pendingExport = bytes;
              Intent save =
                  new Intent(Intent.ACTION_CREATE_DOCUMENT)
                      .addCategory(Intent.CATEGORY_OPENABLE)
                      .setType("application/json")
                      .putExtra(Intent.EXTRA_TITLE, "Defender-Companion-demo.json");
              startActivityForResult(save, SAVE_EXPORT);
            } catch (Exception invalid) {
              pendingExport = null;
              Toast.makeText(
                      this, "The demo export could not be prepared. Try again.", Toast.LENGTH_LONG)
                  .show();
            }
          });
    }
    frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
    setContentView(frame);
    if (state == null || web.restoreState(state) == null)
      web.loadUrl(ORIGIN + "/assets/web/index.html");
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                back();
              }
            });
  }

  private void back() {
    if (web != null && web.canGoBack()) web.goBack();
    else finish();
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    if (web != null) web.saveState(out);
    super.onSaveInstanceState(out);
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != SAVE_EXPORT) return;
    byte[] bytes = pendingExport;
    pendingExport = null;
    if (result != RESULT_OK) return;
    if (bytes == null
        || data == null
        || data.getData() == null
        || !"content".equals(data.getData().getScheme())) {
      Toast.makeText(this, "Export expired. Choose Export again.", Toast.LENGTH_LONG).show();
      return;
    }
    try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "wt")) {
      if (output == null) throw new java.io.IOException();
      output.write(bytes);
      Toast.makeText(this, "Demo export saved.", Toast.LENGTH_SHORT).show();
    } catch (Exception unavailable) {
      Toast.makeText(
              this,
              "The export could not be saved. Choose another location and try again.",
              Toast.LENGTH_LONG)
          .show();
    }
  }

  @Override
  public void onDestroy() {
    if (web != null) {
      web.stopLoading();
      web.destroy();
    }
    pendingExport = null;
    super.onDestroy();
  }
}
