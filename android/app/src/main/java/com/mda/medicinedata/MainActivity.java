package com.mda.medicinedata;

import android.os.Bundle;
import android.view.WindowManager;

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
 */
public class MainActivity extends BridgeActivity {

    private static final String JS_READ_FLAG =
            "(function(){try{return localStorage.getItem('mda.secureFlag')==='1'?'1':'0';}catch(e){return '0';}})()";

    private Boolean applied = null; // last value pushed to the window flags

    /** Ask the WebView for the current preference and apply it. */
    private void refreshSecureFlag() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(JS_READ_FLAG, raw -> {
                boolean secure = "1".equals(unquote(raw));
                if (applied != null && applied == secure) return; // nothing changed
                applied = secure;
                runOnUiThread(() -> {
                    if (secure) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    }
                });
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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        refreshSecureFlag();
    }

    @Override
    public void onResume() {
        super.onResume();
        applied = null; // force a re-check: the setting may have changed while away
        refreshSecureFlag();
    }
}
