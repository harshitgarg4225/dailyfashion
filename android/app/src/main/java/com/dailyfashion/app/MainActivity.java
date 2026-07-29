package com.dailyfashion.app;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // FLAG_SECURE: the log is photographs of somebody in a mirror. This
        // keeps them out of the recents-screen preview, out of screenshots and
        // out of screen recordings taken by other apps. The passcode lock
        // guards the front door; this closes the windows. The cost — the user
        // cannot screenshot their own journal — is the right trade for an app
        // whose whole pitch is that the photos stay private, and the share
        // card exists precisely so nothing needs screenshotting.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
