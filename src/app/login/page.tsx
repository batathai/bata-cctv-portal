import ThailandScene from "@/components/login/ThailandScene";
import LoginForm from "@/components/login/LoginForm";
import "./login.css";

/* The artwork below (camera, storefront, Bata wordmark) are layers cut from the approved reference image. */
/* eslint-disable @next/next/no-img-element */
export default function LoginPage() {
  return (
    <div className="login-root">
      <div className="login-stage">
        <svg className="ls-swoosh" viewBox="0 0 1670 941" preserveAspectRatio="xMidYMax slice" overflow="visible" aria-hidden="true">
          <defs>
            <linearGradient id="lsRedL" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#c4101a" />
              <stop offset="1" stopColor="#ef3a42" />
            </linearGradient>
            <linearGradient id="lsRedR" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#c4101a" />
              <stop offset="1" stopColor="#ef3a42" />
            </linearGradient>
          </defs>
          <path d="M-4000 782 L0 782 C 130 838 290 900 440 941 L-4000 941 Z" fill="url(#lsRedL)" />
          <path d="M-4000 800 L0 800 C 120 850 270 905 380 941" fill="none" stroke="#fff" strokeWidth="3" opacity=".85" />
          <path d="M5670 792 L1670 792 C 1500 826 1260 905 1070 941 L5670 941 Z" fill="url(#lsRedR)" />
          <path d="M5670 812 L1670 812 C 1500 846 1290 912 1150 941" fill="none" stroke="#fff" strokeWidth="3" opacity=".85" />
        </svg>

        <img className="ls-store" src="/login/storefront.webp" alt="" width={625} height={220} />

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

        <LoginForm />
      </div>
    </div>
  );
}
