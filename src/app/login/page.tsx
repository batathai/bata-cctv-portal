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
              <stop offset="0" stopColor="#d8222b" />
              <stop offset="1" stopColor="#f26a71" />
            </linearGradient>
            <linearGradient id="lsRedR" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#d8222b" />
              <stop offset="1" stopColor="#f26a71" />
            </linearGradient>
          </defs>
          <path d="M-4000 872 L0 872 C 120 894 230 918 335 941 L-4000 941 Z" fill="url(#lsRedL)" />
          <path d="M-4000 860 L0 860 C 125 884 240 910 350 941" fill="none" stroke="#e85560" strokeWidth="2" opacity=".55" />
          <path d="M5670 880 L1670 880 C 1520 896 1340 920 1235 941 L5670 941 Z" fill="url(#lsRedR)" />
          <path d="M5670 868 L1670 868 C 1525 886 1350 912 1250 941" fill="none" stroke="#e85560" strokeWidth="2" opacity=".55" />
        </svg>

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

        <LoginForm />
      </div>
    </div>
  );
}
