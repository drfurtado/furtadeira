import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let storage: FirebaseStorage;
export let functions: Functions;

const useEmulators = Boolean(import.meta.env.VITE_USE_EMULATORS);

/**
 * No Firebase Hosting a configuração vem de /__/firebase/init.json,
 * então não há chaves para copiar. Em desenvolvimento usamos os emuladores.
 */
export async function initFirebase() {
  const config = useEmulators
    ? {
        apiKey: "demo-key",
        authDomain: "demo-furtadeira.firebaseapp.com",
        projectId: "demo-furtadeira",
        storageBucket: "demo-furtadeira.appspot.com",
        appId: "demo-app",
      }
    : await fetch("/__/firebase/init.json").then((r) => {
        if (!r.ok) throw new Error("Configuração do Firebase não encontrada.");
        return r.json();
      });

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app);

  if (useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
}
