// Cuenta de Google (cuenta común de Taller, Firebase tiempos-921ec) y la lista en Firestore.
// Ruta: users/{uid}/pendientes/lista = { tareas: [{id, texto, hecha, fecha}], actualizado: ms }
// Solo se carga si firebase-config.js trae una configuración.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, doc, setDoc, getDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let auth, db, uid = null, unsub = null;
// Sesión única de taller.ink (Worker en cuenta.taller.ink). Si no carga, la app sigue con su propia sesión.
let sesion = null;
const ref = () => doc(db, 'users', uid, 'pendientes', 'lista');
const limpia = (t) => ({ id: String(t.id).slice(0, 40), texto: String(t.texto).slice(0, 200), hecha: !!t.hecha, fecha: t.fecha || '' });

export function iniciar(config, { alUsuario, alLista, alError }) {
  const app = initializeApp(config);
  auth = getAuth(app);
  auth.languageCode = 'es';
  import('https://taller.ink/cuenta/sesion.js')
    .then((m) => { sesion = m; m.conectarSesion(auth); })
    .catch(() => {});
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
  onAuthStateChanged(auth, async (u) => {
    if (unsub) { unsub(); unsub = null; }
    uid = u ? u.uid : null;
    // primero se avisa el usuario (para mezclar lo local), después llegan los datos
    await alUsuario(u ? { uid: u.uid, email: u.email, nombre: u.displayName, foto: u.photoURL } : null);
    if (u) {
      unsub = onSnapshot(ref(), { includeMetadataChanges: true }, (s) => {
        const d = s.data();
        alLista({
          tareas: d && Array.isArray(d.tareas) ? d.tareas : null,
          pendiente: s.metadata.hasPendingWrites,
          deCache: s.metadata.fromCache,
        });
      }, (e) => alError(e));
    }
  });
}

export async function entrar() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, p);
    } else throw e;
  }
}

export const salir = () => (sesion ? sesion.salir(auth) : signOut(auth));

export async function leer() {
  if (!uid) return null;
  const s = await getDoc(ref());
  const d = s.data();
  return d && Array.isArray(d.tareas) ? d.tareas : [];
}

export async function guardar(tareas) {
  if (!uid) return;
  await setDoc(ref(), { tareas: tareas.map(limpia), actualizado: Date.now() });
}
