import { Sidebar } from './Sidebar';
import { MobileToolbar } from './MobileToolbar';

type Props = {
  children: React.ReactNode;
};

export function AppShell({ children }: Props) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-shell__main">{children}</main>
      <MobileToolbar />
    </div>
  );
}
