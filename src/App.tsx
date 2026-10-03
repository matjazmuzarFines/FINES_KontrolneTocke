import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Database, Info, LogOut, RefreshCw, Settings2, ShieldCheck, UserRound, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { configurationError, demoUser, loadStore, supabase, updateProfile } from './data';
import { Badge, Empty, Field, Modal, PageTitle } from './components';
import { changelog, currentVersion } from './changelog';
import Procedures from './Procedures';
import Products from './Products';
import Quality from './Quality';
import type { Profile, Store } from './types';

const roleLabel = { tester: 'Izvajalec kontrole', developer: 'Razvojnik', admin: 'Administrator' };
const route = () => (location.hash.slice(1) || 'kakovost').split('/');
export default function App() {
  const [session,setSession] = useState<Session | null>(null), [authReady,setAuthReady] = useState(!supabase), [closed,setClosed] = useState(false);
  const [store,setStore] = useState<Store | null>(null), [loading,setLoading] = useState(false), [error,setError] = useState(''), [toast,setToast] = useState(''), [menu,setMenu] = useState(false), [testing,setTesting] = useState(false), [page,setPage] = useState(route), [info,setInfo] = useState(false);
  const routeGuard = useRef({ testing, page }); routeGuard.current = { testing, page };
  const demo = !supabase;
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({data,error}) => { if (alive) { if (error) setError(error.message); setSession(data.session); setAuthReady(true); } });
    const {data} = supabase.auth.onAuthStateChange((_event,session) => { if (alive) { setSession(session); setAuthReady(true); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const change = () => {
      if (routeGuard.current.testing) {
        history.replaceState(null, '', `#${routeGuard.current.page.join('/')}`);
        setToast('Najprej zaključite ali prekinite odprti test.'); return;
      }
      setPage(route()); setMenu(false);
    };
    window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change);
  }, []);
  const refresh = useCallback(async () => {
    const next = await loadStore(); setStore(next); setError('');
  }, []);
  useEffect(() => {
    if ((!demo && !session) || closed) { setStore(null); return; }
    let alive = true; setLoading(true); setError('');
    loadStore().then(s => { if (alive) setStore(s); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session?.user.id,closed,demo]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''),5000); return () => clearTimeout(timer); }, [toast]);
  const user = demo ? demoUser : store?.profiles.find(p => p.id === session?.user.id);
  function navigate(to: string) { if (testing) { setToast('Najprej zaključite ali prekinite odprti test.'); return; } location.hash = to; setMenu(false); }
  async function exit() {
    if (testing) { setToast('Najprej zaključite ali prekinite odprti test.'); return; }
    try { if (supabase) { const {error} = await supabase.auth.signOut(); if (error) throw error; } setClosed(true); setStore(null); } catch (e) { setError((e as Error).message); }
  }
  async function reload() { if (testing) return; setLoading(true); try { await refresh(); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  const canEdit = user?.role === 'developer' || user?.role === 'admin';
  const section = page[0] === 'kakovost' ? 'Kontrola kakovosti' : page[0] === 'admin' ? 'Administracija' : 'Nastavitve programov';
  const subpage = page[0] === 'postopki' ? 'Definicija kontrolnih postopkov' : page[0] === 'izdelki' ? 'Povezave postopkov in izdelkov' : '';
  return <div className="app-shell"><header className="app-header"><div className="brand"><img src="/fines-logo.png" alt="FINES d.o.o." /><span className="brand-divider" /><div><strong>Kontrolne točke</strong><span>Kontrola kakovosti izdelkov</span></div></div><div className="header-actions">{page[0] !== 'kakovost' || page[1] ? <button className="button small back-button" title="Nazaj na začetno stran" disabled={testing} onClick={() => navigate('kakovost')}><ArrowLeft size={16} /> Nazaj</button> : null}{user && !closed && <div className="user-info"><UserRound size={19} /><div><strong>{user.display_name || session?.user.email}</strong><span>{roleLabel[user.role]}</span></div></div>}<button className="icon-button info-button" aria-label="Informacije in verzije" title="Prikaži spremembe in verzije aplikacije" onClick={() => setInfo(true)}><Info size={20} /></button><button className="button small exit-button" aria-label="Izhod" title="Izhod iz aplikacije" onClick={exit}><LogOut size={17} /><span>Izhod</span></button></div></header>
    <div className="nav-wrap"><nav className="main-nav" aria-label="Glavna navigacija"><button className={page[0] === 'kakovost' ? 'active' : ''} title="Odpri seznam delovnih nalogov" onClick={() => navigate('kakovost')}><ClipboardCheck size={19} />Kontrola kakovosti</button><div className="nav-menu"><button title="Odpri meni nastavitev programov" aria-expanded={menu} aria-controls="settings-menu" className={['postopki','izdelki'].includes(page[0]) ? 'active' : ''} onClick={() => setMenu(!menu)}><Settings2 size={19} />Nastavitve programov<ChevronDown size={15} /></button>{menu && <><button className="menu-dismiss" aria-label="Zapri meni" title="Zapri meni" onClick={() => setMenu(false)} /><div id="settings-menu" className="dropdown"><button title="Odpri definicijo kontrolnih postopkov" onClick={() => navigate('postopki')}><strong>Definicija kontrolnih postopkov</strong><span>Kontrolne točke in navodila za testiranje</span></button><button title="Odpri povezave postopkov in izdelkov" onClick={() => navigate('izdelki')}><strong>Povezave postopkov in izdelkov</strong><span>Postopki in meje za posamezen artikel</span></button></div></>}</div><button className={page[0] === 'admin' ? 'active' : ''} title="Odpri administracijo in uporabnike" onClick={() => navigate('admin')}><ShieldCheck size={19} />Admin</button></nav><div className="connection"><span className={`status-dot ${demo ? 'demo' : ''}`} />{demo ? 'Demo način' : 'Supabase'}</div></div>
    <main className="main-content">{configurationError ? <div className="alert danger" role="alert">{configurationError}</div> : !authReady ? <Empty title="Preverjam prijavo ..." /> : closed ? <div className="welcome panel"><LogOut size={36} /><h1>Aplikacija je zaprta</h1><p>{demo ? 'Demo podatki ostajajo shranjeni v tem brskalniku.' : 'Uspešno ste se odjavili. Zavihek lahko zaprete.'}</p><button className="button primary" title="Ponovno odpri aplikacijo" onClick={() => setClosed(false)}>Ponovno odpri aplikacijo</button></div> : !demo && !session ? <Login /> : <>
      {error && <div className="alert danger" role="alert">{error}<button className="button small info" title="Ponovno naloži podatke iz baze" onClick={reload}>Poskusi ponovno</button></div>}
      {loading && !store ? <Empty title="Nalaganje podatkov ..." /> : store && (!user || !user.visible) ? <Empty title="Dostop še ni omogočen">Administrator mora aktivirati vaš uporabniški profil.</Empty> : store && user ? <>
        <div className="breadcrumb"><nav className="crumbs" aria-label="Pot do strani"><button className="crumb" title="Pojdi na začetno stran" disabled={testing} onClick={() => navigate('kakovost')}>FINES</button><span className={`crumb ${subpage ? '' : 'current'}`}>{section}</span>{subpage && <span className="crumb current">{subpage}</span>}</nav><button className="button small info refresh" title="Ponovno naloži podatke iz baze" disabled={loading || testing} onClick={reload}><RefreshCw size={14} className={loading ? 'spin' : ''} />{loading ? 'Osvežujem ...' : 'Osveži podatke'}</button></div>
        {['postopki','izdelki'].includes(page[0]) && <div className="subnav"><button className={page[0] === 'postopki' ? 'active' : ''} title="Odpri definicijo kontrolnih postopkov" onClick={() => navigate('postopki')}>Definicija kontrolnih postopkov</button><button className={page[0] === 'izdelki' ? 'active' : ''} title="Odpri povezave postopkov in izdelkov" onClick={() => navigate('izdelki')}>Povezave postopkov in izdelkov</button></div>}
        {page[0] === 'kakovost' ? <Quality key={page.join('/')} store={store} user={user} orderId={page[1]} navigate={navigate} refresh={refresh} notify={setToast} demo={demo} setTesting={setTesting} /> : page[0] === 'postopki' ? <Procedures store={store} canEdit={Boolean(canEdit)} refresh={refresh} notify={setToast} /> : page[0] === 'izdelki' ? <Products store={store} canEdit={Boolean(canEdit)} refresh={refresh} notify={setToast} /> : page[0] === 'admin' ? <Admin store={store} user={user} demo={demo} refresh={refresh} /> : <Empty title="Stran ne obstaja"><button className="button" title="Pojdi na začetno stran" onClick={() => navigate('kakovost')}>Na začetno stran</button></Empty>}
      </> : !loading && !error ? <Empty title="Podatki niso na voljo" /> : null}
    </>}</main><footer className="app-footer"><span>FINES d.o.o. <span className="footer-dot">·</span> Kontrolne točke</span><span>v{currentVersion} <span className="footer-dot">·</span> {demo ? 'Lokalni demonstracijski način' : 'Supabase'}</span></footer>{info && <Modal title="Spremembe in verzije" subtitle={`Trenutna verzija ${currentVersion}`} onClose={() => setInfo(false)}><div className="modal-body changelog">{changelog.map(r => <section key={r.version}><header><Badge tone="orange">{r.version}</Badge><strong>{r.title}</strong><span className="release-date">{r.date.split('-').reverse().join('. ')}</span></header><ul>{r.changes.map(c => <li key={c}>{c}</li>)}</ul></section>)}</div><footer className="modal-footer"><button className="button" title="Zapri seznam sprememb" onClick={() => setInfo(false)}>Zapri</button></footer></Modal>}{toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><button aria-label="Zapri obvestilo" title="Zapri obvestilo" onClick={() => setToast('')}><X size={16} /></button></div>}</div>;
}
function Login() {
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function login(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const {error} = await supabase!.auth.signInWithPassword({email,password}); if (error) throw error; } catch { setError('Prijava ni uspela. Preverite e-pošto, geslo in povezavo.'); } finally { setBusy(false); } }
  return <section className="login panel"><div className="login-icon"><ShieldCheck size={30} /></div><span className="eyebrow">FINES · Kontrolne točke</span><h1>Prijava v aplikacijo</h1><p>Prijavite se s svojim uporabniškim računom.</p><form onSubmit={login}><Field label="E-pošta"><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Geslo"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>{error && <div className="alert danger" role="alert">{error}</div>}<button className="button success" title="Prijava v aplikacijo" disabled={busy}>{busy ? 'Prijavljam ...' : 'Prijava'}</button></form><small>Račun vam pripravi administrator podjetja.</small></section>;
}
function Admin({ store, user, demo, refresh }: { store: Store; user: Profile; demo: boolean; refresh: () => Promise<void> }) {
  const [busy,setBusy] = useState(''), [error,setError] = useState('');
  async function update(p: Profile, role = p.role, visible = p.visible) { setBusy(p.id); setError(''); try { await updateProfile(p.id,role,visible); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } }
  return <><PageTitle eyebrow="Administracija" title="Nastavitve in dostop" description="Pregled povezave, uporabniških vlog in priprave na povezavo z administrativno bazo." /><div className="admin-grid"><section className="panel admin-card"><Database size={26} className="orange-text" /><h2>Podatkovna povezava</h2><Badge tone={demo ? 'warning' : 'success'}>{demo ? 'Lokalni demonstracijski način' : 'Supabase je nastavljen'}</Badge><p>{demo ? 'Artikli in postopki iz CSV. Spremembe in rezultati se hranijo v lokalni shrambi tega brskalnika.' : 'Prijava in podatki uporabljajo Supabase. Dostop do tabel je omejen z uporabniško vlogo.'}</p><div className="info-row"><span>Administrativna baza</span><Badge>Še ni povezana</Badge></div><div className="info-row"><span>Brisanje podatkov</span><strong>Skrivanje z visible</strong></div></section><section className="panel admin-card"><ShieldCheck size={26} className="orange-text" /><h2>Uporabniške vloge</h2><div className="role-description"><strong>Izvajalec kontrole</strong><p>Izvaja teste, zapisuje rezultate in pregleduje kontrolne postopke.</p><strong>Razvojnik</strong><p>Ureja postopke, artikle in povezave za testiranje.</p><strong>Administrator</strong><p>Upravlja razvojne nastavitve in dostop uporabnikov.</p></div></section></div>{user.role === 'admin' && <section className="panel"><div className="panel-heading"><h2>Uporabniki</h2><Badge>{store.profiles.length}</Badge></div>{error && <div role="alert" className="alert danger">{error}</div>}<div className="table-scroll"><table><thead><tr><th>Uporabnik</th><th>Vloga</th><th>Dostop</th></tr></thead><tbody>{store.profiles.map(p => <tr key={p.id}><td><strong>{p.display_name || p.id}</strong><span className="cell-sub">{p.id === user.id ? 'Vaš račun' : p.id}</span></td><td><select aria-label={`Vloga ${p.display_name}`} disabled={demo || Boolean(busy) || p.id === user.id} value={p.role} onChange={e => update(p,e.target.value as Profile['role'])}>{Object.entries(roleLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></td><td><label className="check"><input type="checkbox" disabled={demo || Boolean(busy) || p.id === user.id} checked={p.visible} onChange={e => update(p,p.role,e.target.checked)} />{p.visible ? 'Omogočen' : 'Onemogočen'}</label></td></tr>)}</tbody></table></div><div className="panel-note">Nove račune ustvarite v Supabase Authentication. Začetna vloga je izvajalec kontrole.</div></section>}</>;
}
