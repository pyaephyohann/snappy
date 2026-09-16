export default function FriendsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="user-app-shell min-h-full">{children}</div>;
}
