package io.github.jacklee992.wanba;

import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

/** Games draw edge-to-edge through cutouts; shell pages keep normal safe-area padding. */
final class GameImmersiveController {
    private final Window window;
    private final View content;
    private final int originalSystemUi;
    private final int originalStatusColor;
    private final int originalNavigationColor;
    private final int originalCutoutMode;
    private final GameImmersiveState state;
    private boolean immersive;

    @SuppressWarnings("deprecation")
    GameImmersiveController(Window window, View content) {
        this.window = window;
        this.content = content;
        originalSystemUi = window.getDecorView().getSystemUiVisibility();
        originalStatusColor = window.getStatusBarColor();
        originalNavigationColor = window.getNavigationBarColor();
        originalCutoutMode = Build.VERSION.SDK_INT >= 28
                ? window.getAttributes().layoutInDisplayCutoutMode
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            content.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = immersive
                        ? Insets.NONE
                        : insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard.bottom));
                return insets;
            });
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        state = new GameImmersiveState(this::apply);
    }

    void request(boolean enabled) { state.request(enabled); }
    void foreground(boolean enabled) { state.foreground(enabled); }
    void reset() { state.reset(); }
    void destroy() { state.destroy(); }

    @SuppressWarnings("deprecation")
    private void apply(boolean enabled) {
        immersive = enabled;
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = enabled ? immersiveCutoutMode() : originalCutoutMode;
            window.setAttributes(params);
        }
        window.setStatusBarColor(enabled ? Color.TRANSPARENT : originalStatusColor);
        window.setNavigationBarColor(enabled ? Color.TRANSPARENT : originalNavigationColor);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (enabled) controller.hide(WindowInsets.Type.systemBars());
                else controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(enabled
                    ? originalSystemUi | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    : originalSystemUi);
        }
        content.requestApplyInsets();
    }

    private int immersiveCutoutMode() {
        if (Build.VERSION.SDK_INT >= 35) return WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        return WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }
}
