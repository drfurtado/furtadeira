// Teste de ponta a ponta nos emuladores: barreira de login, convite, e-mail e entrada na família.
// Rode com: npm run test:smoke
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import assert from "node:assert/strict";

const config = { apiKey: "demo-key", projectId: "demo-furtadeira", authDomain: "demo-furtadeira.firebaseapp.com" };
let n = 0;

function client() {
  const app = initializeApp(config, `c${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  return { app, auth, db, fns };
}

async function signIn(c, email) {
  const token = JSON.stringify({ sub: email, email, email_verified: true, name: email.split("@")[0] });
  return signInWithCredential(c.auth, GoogleAuthProvider.credential(token));
}

async function mailFor(email) {
  const res = await fetch("http://127.0.0.1:8080/v1/projects/demo-furtadeira/databases/(default)/documents/mail", {
    headers: { Authorization: "Bearer owner" },
  });
  const body = await res.json();
  return (body.documents ?? []).filter((d) => d.fields.to.stringValue === email);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Gmail sem convite é barrado no login.
const stranger = client();
await assert.rejects(signIn(stranger, "estranho@gmail.com"), /não foi convidado|permission|blocking|BLOCKING/i);
console.log("ok  conta sem convite é barrada no login");

// 2. O admin entra e vira admin.
const admin = client();
await signIn(admin, "admin@gmail.com");
const me = (await httpsCallable(admin.fns, "joinFamily")()).data;
assert.equal(me.role, "admin");
console.log("ok  admin entra e recebe papel de admin");

// 3. Admin cria o ramo, a irmã na árvore e convida a representante.
await setDoc(doc(admin.db, "branches/maria"), { name: "Maria", color: "#c0392b", order: 0, personId: "pMaria" });
await setDoc(doc(admin.db, "people/pMaria"), {
  firstName: "Maria", lastName: "Furtado", branchId: "maria", parentIds: [], spouseIds: [], uid: null,
});
await setDoc(doc(admin.db, "invites/maria@gmail.com"), {
  email: "maria@gmail.com", name: "Maria Furtado", branchId: "maria", role: "rep", personId: "pMaria",
  status: "pending", sendCount: 1, invitedBy: admin.auth.currentUser.uid, createdAt: serverTimestamp(),
});
for (let i = 0; i < 20 && (await mailFor("maria@gmail.com")).length === 0; i++) await wait(500);
const mails = await mailFor("maria@gmail.com");
assert.equal(mails.length, 1);
assert.match(mails[0].fields.message.mapValue.fields.subject.stringValue, /convidou você/);
console.log("ok  convite gera e-mail na fila:", mails[0].fields.message.mapValue.fields.subject.stringValue);

// 4. A representante entra, é ligada à pessoa da árvore e ao ramo.
const maria = client();
await signIn(maria, "maria@gmail.com");
const rep = (await httpsCallable(maria.fns, "joinFamily")()).data;
assert.equal(rep.role, "rep");
assert.equal(rep.branchId, "maria");
assert.equal(rep.personId, "pMaria");
const pMaria = (await getDoc(doc(maria.db, "people/pMaria"))).data();
assert.equal(pMaria.uid, maria.auth.currentUser.uid);
const inv = (await getDoc(doc(maria.db, "invites/maria@gmail.com"))).data();
assert.equal(inv.status, "accepted");
console.log("ok  representante entra, ligada ao ramo e ao próprio perfil");

// 5. A representante convida o filho; ele entra como membro.
await setDoc(doc(maria.db, "people/pJoao"), {
  firstName: "João", branchId: "maria", parentIds: ["pMaria"], spouseIds: [], uid: null,
});
await setDoc(doc(maria.db, "invites/joao@gmail.com"), {
  email: "joao@gmail.com", name: "João", branchId: "maria", role: "member", personId: "pJoao",
  status: "pending", sendCount: 1, invitedBy: maria.auth.currentUser.uid,
});
const joao = client();
await signIn(joao, "joao@gmail.com");
const mem = (await httpsCallable(joao.fns, "joinFamily")()).data;
assert.equal(mem.role, "member");
assert.equal(mem.personId, "pJoao");
console.log("ok  membro convidado pela representante entra como membro");

for (const c of [stranger, admin, maria, joao]) await deleteApp(c.app);
console.log("\nTodos os testes de ponta a ponta passaram.");
process.exit(0);
