package io.github.jacklee992.wanba;

/** Activity-local lifecycle policy. It never changes game pause or device settings. */
final class GameImmersiveState {
    interface Sink { void apply(boolean immersive); }
    private final Sink sink;
    private boolean requested, foreground = true, active, destroyed;
    GameImmersiveState(Sink sink) { this.sink = sink; sink.apply(false); }
    void request(boolean enabled) { if (!destroyed) { requested = enabled; update(); } }
    void foreground(boolean value) { if (!destroyed) { foreground = value; update(); } }
    void reset() { request(false); }
    void destroy() { requested = false; foreground = false; update(); destroyed = true; }
    boolean active() { return active; }
    private void update() {
        boolean next = requested && foreground;
        if (next != active) { active = next; sink.apply(active); }
    }
}
