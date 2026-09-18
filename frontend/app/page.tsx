import { LoginForm } from "@/components/auth/login-form";
import { CompanyLogo } from "@/components/common/company-logo";

export default function LoginPage() {
  return <main className="login-page"><section className="login-intro"><a className="brand" href="#top"><CompanyLogo /></a><div><p className="eyebrow">PEOPLE / PROJECTS / PROGRESS</p><h1>Work moves better when everyone is in sync.</h1><p className="intro-copy">One focused workspace for your people, projects, sprints, and the work that connects them.</p></div><p className="intro-footer">Copyright 2026 Infograins / Built for focused teams</p></section><section className="login-panel" id="top"><LoginForm /></section></main>;
}
