"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hosts the Three.js scene. three is loaded with a dynamic import after mount, so the login form is
 * interactive first and the 3D bundle only ever loads on /login. Falls back to a static picture if WebGL
 * is unavailable or the GPU context is lost.
 */
export default function ThailandScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: { dispose: () => void } | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("@/lib/login-scene/createScene")
      .then(({ createLoginScene }) => {
        if (cancelled) return;
        handle = createLoginScene(canvas, {
          reducedMotion,
          onFail: () => !cancelled && setFailed(true),
        });
        if (!cancelled) setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);

  return (
    <div className="ls-scene">
      {failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ls-scene-fallback" src="/login/map-fallback.webp" alt="Thailand store network map" />
      ) : (
        <canvas
          ref={canvasRef}
          className={`ls-canvas${ready ? " is-ready" : ""}`}
          role="img"
          aria-label="Rotating 3D map of Thailand with orbital rings and store location markers"
        />
      )}
    </div>
  );
}
