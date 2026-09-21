import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { fetchMe } from "./lib/api";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Matters } from "./pages/Matters";
import { MatterDetail } from "./pages/MatterDetail";
import { Deadlines } from "./pages/Deadlines";
import { Radar } from "./pages/Radar";
import { RadarDetail } from "./pages/RadarDetail";
import { TimeQuick } from "./pages/TimeQuick";
import { Team } from "./pages/Team";
import { Stranke } from "./pages/Stranke";
import { Cenik } from "./pages/Cenik";
import { Obracun } from "./pages/Obracun";
import { Import } from "./pages/Import";
import { Admin } from "./pages/Admin";

export default function App() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });
  const refreshAuth = () => qc.invalidateQueries({ queryKey: ["me"] });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D332B] text-[#C9A34A]">…</div>
    );
  }

  if (!me?.authenticated) return <Login onLoggedIn={refreshAuth} />;

  return (
    <Layout me={me} onLogout={refreshAuth}>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/zadeve" component={Matters} />
        <Route path="/zadeve/:id">{(p) => <MatterDetail id={p.id} me={me} />}</Route>
        <Route path="/roki" component={Deadlines} />
        <Route path="/radar" component={Radar} />
        <Route path="/radar/:id">{(p) => <RadarDetail id={p.id} />}</Route>
        <Route path="/ure" component={TimeQuick} />
        <Route path="/stranke">{me.role === "admin" ? <Stranke /> : <NotAllowed />}</Route>
        <Route path="/cenik">{me.role === "admin" ? <Cenik /> : <NotAllowed />}</Route>
        <Route path="/ekipa">{me.role === "admin" ? <Team /> : <NotAllowed />}</Route>
        <Route path="/obracun">{me.role === "admin" ? <Obracun /> : <NotAllowed />}</Route>
        <Route path="/uvoz">{me.role === "admin" ? <Import /> : <NotAllowed />}</Route>
        <Route path="/nastavitve">{me.role === "admin" ? <Admin /> : <NotAllowed />}</Route>
        <Route>{() => <div className="text-neutral-500">Stran ne obstaja.</div>}</Route>
      </Switch>
    </Layout>
  );
}

function NotAllowed() {
  return <div className="text-neutral-500">Ni pravice za to stran.</div>;
}
