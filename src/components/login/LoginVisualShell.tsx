import type { ReactNode } from 'react';
import './login-visual-shell.css';
import LoginOrbitAnimation from './LoginOrbitAnimation';

/** Visual-only wrapper. Pass your EXISTING login form as children.
 * Do not replace your authentication handlers, redirects or session logic.
 */
export default function LoginVisualShell({ children }: { children: ReactNode }) {
  return (
    <main className="bata-login-stage">
      <div className="bata-login-composition">
        <LoginOrbitAnimation />
        <div className="bata-login-form-slot">{children}</div>
      </div>
    </main>
  );
}
