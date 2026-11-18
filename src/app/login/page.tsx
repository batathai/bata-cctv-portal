import ThailandScene from "@/components/login/ThailandScene";
import LoginForm from "@/components/login/LoginForm";
import "./login.css";

/* The artwork below (camera, storefront, Bata wordmark) are layers cut from the approved reference image. */
/* eslint-disable @next/next/no-img-element */
export default function LoginPage() {
  return (
    <div className="login-root">
      <div className="login-stage">
        <div className="ls-left">
          <div className="ls-visual">
            <img className="ls-store" src="/login/storefront.webp" alt="" width={640} height={254} />

            <div className="ls-art">
              <ThailandScene />
              <img className="ls-camera" src="/login/camera.webp" alt="Bata bullet CCTV camera" width={505} height={362} />
            </div>

            <header className="ls-brand">
              <img className="ls-logo" src="/login/bata-logo.png" alt="Bata" width={300} height={88} />
              <span className="ls-sep" aria-hidden="true" />
              <div className="ls-brand-text">
                <strong>BATA CCTV</strong>
                <span>COMMAND CENTER</span>
              </div>
            </header>
          </div>
        </div>

        <div className="ls-right">
          <LoginForm />
        </div>

        <span className="ls-accent" aria-hidden="true" />
      </div>
    </div>
  );
}
