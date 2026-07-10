/** Tela "em breve" — usada nas seções ainda não construídas (dentro do AppShell). */
export function PlaceholderPage({
  icon,
  title,
  message,
}: {
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <div className="shell-placeholder">
      <span className="shell-placeholder__icon" aria-hidden="true">
        {icon}
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
    </div>
  );
}
