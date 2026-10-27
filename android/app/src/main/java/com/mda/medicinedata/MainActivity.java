package com.mda.medicinedata;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * MDA Android shell.
 *
 * Screenshot / screen-recording protection (FLAG_SECURE) is opt-in. The web layer writes
 * {@code localStorage["mda.secureFlag"] = "1"} when the user enables it
 * (المزيد → قفل التطبيق → منع لقطات الشاشة), and this activity re-reads that value
 * every time the window is focused.
 *
 * Why opt-in: FLAG_SECURE also blocks screen sharing, which a pharmacist may need when
 * asking a colleague for help. Prescriptions and allergy lists deserve the protection;
 * the medicine catalogue does not.
 *
 * v1.8.0 adds {@code window.MDASecure.set('1'|'0')} so the per-prescription toggle takes
 * effect while the prescription is on screen (calls only from our own bundled pages).
 *
 * v1.10.1 — "I installed the update and nothing changed". The WebView keeps an HTTP cache of
 * the bundled pages, so a new APK could keep painting yesterday's JavaScript. On every launch
 * the shell compares the installed versionName with the last one it saw; when they differ it
 * drops the WebView cache before the first page loads. This is the difference between an
 * update that is visible and one that only exists in the APK.
 */
public class MainActivity extends BridgeActivity {

    private static final String JS_READ_FLAG =
            "(function(){try{var n=localStorage.getItem('mda.secureNow');" +
            "if(n==='1'||n==='0')return n;return localStorage.getItem('mda.secureFlag')==='1'?'1':'0';}" +
            "catch(e){return '0';}})()";

    private Boolean applied = null; // last value pushed to the window flags
    private boolean bridgeAdded = false; // the JS interface is registered once

    /** Apply FLAG_SECURE to the window; safe to call repeatedly. */
    private void applySecure(final boolean secure) {
        runOnUiThread(() -> {
            try {
                applied = secure;
                if (secure) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
            } catch (Throwable ignored) {
                // A cosmetic protection must never crash the shell.
            }
        });
    }

    /** Only the packaged app pages may flip the flag (never a page we navigated to). */
    private boolean isTrustedPage() {
        try {
            String url = getBridge().getWebView().getUrl();
            return url == null || url.startsWith("https://localhost") || url.startsWith("http://localhost")
                    || url.startsWith("file://");
        } catch (Throwable t) {
            return false;
        }
    }

    /** JS bridge: {@code window.MDASecure.set('1')}. */
    public class SecureBridge {
        @JavascriptInterface
        public String set(String on) {
            if (!isTrustedPage()) return "denied";
            boolean secure = "1".equals(on) || "true".equalsIgnoreCase(on);
            applySecure(secure);
            return secure ? "1" : "0";
        }

        @JavascriptInterface
        public String get() {
            return applied != null && applied ? "1" : "0";
        }
    }

    private void registerSecureBridge() {
        if (bridgeAdded) return;
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().addJavascriptInterface(new SecureBridge(), "MDASecure");
            bridgeAdded = true;
        } catch (Throwable ignored) {
            // Falls back to the localStorage check below (applies on the next resume).
        }
    }

    /** Ask the WebView for the current preference and apply it. */
    private void refreshSecureFlag() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(JS_READ_FLAG, raw -> {
                boolean secure = "1".equals(unquote(raw));
                if (applied != null && applied == secure) return; // nothing changed
                applySecure(secure);
            });
        } catch (Throwable ignored) {
            // A cosmetic protection must never crash the shell.
        }
    }

    /** evaluateJavascript returns JSON: "1", null, or true — normalise all of them. */
    private static String unquote(String raw) {
        if (raw == null) return "0";
        String v = raw.trim();
        if (v.startsWith("\"") && v.endsWith("\"") && v.length() >= 2) v = v.substring(1, v.length() - 1);
        if ("true".equals(v)) return "1";
        if ("false".equals(v) || "null".equals(v)) return "0";
        return v;
    }

    private static final String PREFS = "mda_shell";
    private static final String KEY_VERSION = "lastVersionName";

    /** Clear the WebView cache the first time a *different* APK version runs. */
    private void clearCacheAfterUpdate() {
        try {
            Context ctx = getApplicationContext();
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String installed = "";
            try {
                installed = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
            } catch (Throwable ignored) { /* package info unavailable */ }
            String lastSeen = prefs.getString(KEY_VERSION, "");
            if (installed != null && !installed.isEmpty() && !installed.equals(lastSeen)) {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null) {
                    webView.clearCache(true);
                    webView.clearFormData();
                }
                prefs.edit().putString(KEY_VERSION, installed).apply();
            }
        } catch (Throwable ignored) {
            // A cache is an optimisation: never let it stop the app from starting.
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        clearCacheAfterUpdate();
        registerSecureBridge();
        refreshSecureFlag();
    }

    @Override
    public void onResume() {
        super.onResume();
        registerSecureBridge(); // the bridge exists only after the WebView is created
        applied = null; // force a re-check: the setting may have changed while away
        refreshSecureFlag();
    }
}
