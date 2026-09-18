type DashboardWelcomeProps = { name: string };

export function DashboardWelcome({ name }: DashboardWelcomeProps) {
  return (
    <div className="welcome" id="overview">
      <p className="eyebrow">SYSTEM ADMINISTRATION</p>
      <h1>Welcome back, {name.split(" ")[0]}.</h1>
      <p>Create administrator accounts and prepare the workspace for your team.</p>
    </div>
  );
}
