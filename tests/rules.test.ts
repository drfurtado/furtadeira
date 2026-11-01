import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-furtadeira",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

afterAll(() => env.cleanup());

const person = (extra: object) => ({ firstName: "X", parentIds: [], spouseIds: [], branchId: null, uid: null, ...extra });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/admin"), { email: "admin@gmail.com", role: "admin", branchId: null, personId: "pAdmin", status: "active" });
    await setDoc(doc(db, "users/repA"), { email: "repa@gmail.com", role: "rep", branchId: "A", personId: "pRepA", status: "active" });
    await setDoc(doc(db, "users/memA"), { email: "mema@gmail.com", role: "member", branchId: "A", personId: "pMemA", status: "active" });
    await setDoc(doc(db, "users/blocked"), { email: "b@gmail.com", role: "member", branchId: "A", personId: null, status: "blocked" });
    await setDoc(doc(db, "branches/A"), { name: "A", color: "#000", order: 0, personId: "pRepA" });
    await setDoc(doc(db, "people/pRepA"), person({ branchId: "A", uid: "repA" }));
    await setDoc(doc(db, "people/pMemA"), person({ branchId: "A", uid: "memA" }));
    await setDoc(doc(db, "people/pKidA"), person({ branchId: "A" }));
    await setDoc(doc(db, "people/pKidB"), person({ branchId: "B" }));
    await setDoc(doc(db, "invites/x@gmail.com"), { email: "x@gmail.com", branchId: "A", role: "member", status: "pending", sendCount: 1, invitedBy: "repA" });
    await setDoc(doc(db, "invites/y@gmail.com"), { email: "y@gmail.com", branchId: "B", role: "member", status: "pending", sendCount: 1, invitedBy: "admin" });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

describe("sem convite, sem dados", () => {
  it("visitante não lê nada", async () => {
    await assertFails(getDoc(doc(as(null), "people/pKidA")));
  });
  it("conta Google sem registro em users não lê nada", async () => {
    await assertFails(getDoc(doc(as("stranger"), "people/pKidA")));
    await assertFails(getDocs(collection(as("stranger"), "users")));
  });
  it("conta bloqueada não lê nada", async () => {
    await assertFails(getDoc(doc(as("blocked"), "people/pKidA")));
  });
  it("ninguém cria o próprio registro em users", async () => {
    await assertFails(setDoc(doc(as("stranger"), "users/stranger"), { role: "admin", status: "active" }));
  });
});

describe("membro", () => {
  it("lê a família toda", async () => {
    await assertSucceeds(getDocs(collection(as("memA"), "people")));
    await assertSucceeds(getDocs(collection(as("memA"), "branches")));
  });
  it("edita o próprio perfil, mas não muda de ramo", async () => {
    await assertSucceeds(updateDoc(doc(as("memA"), "people/pMemA"), { city: "Recife" }));
    await assertFails(updateDoc(doc(as("memA"), "people/pMemA"), { branchId: "B" }));
  });
  it("não edita outras pessoas nem cria pessoas", async () => {
    await assertFails(updateDoc(doc(as("memA"), "people/pKidA"), { city: "Recife" }));
    await assertFails(setDoc(doc(as("memA"), "people/new"), person({ branchId: "A" })));
  });
  it("não convida ninguém", async () => {
    await assertFails(setDoc(doc(as("memA"), "invites/z@gmail.com"), {
      email: "z@gmail.com", branchId: "A", role: "member", status: "pending", sendCount: 1, invitedBy: "memA",
    }));
  });
  it("não muda o próprio papel", async () => {
    await assertFails(updateDoc(doc(as("memA"), "users/memA"), { role: "admin" }));
  });
  it("não lê convites", async () => {
    await assertFails(getDoc(doc(as("memA"), "invites/x@gmail.com")));
  });
});

describe("representante", () => {
  it("cadastra e edita pessoas do próprio ramo", async () => {
    await assertSucceeds(setDoc(doc(as("repA"), "people/new"), person({ branchId: "A" })));
    await assertSucceeds(updateDoc(doc(as("repA"), "people/pKidA"), { city: "Natal" }));
  });
  it("não mexe em outro ramo", async () => {
    await assertFails(setDoc(doc(as("repA"), "people/new"), person({ branchId: "B" })));
    await assertFails(updateDoc(doc(as("repA"), "people/pKidB"), { city: "Natal" }));
    await assertFails(deleteDoc(doc(as("repA"), "people/pKidB")));
  });
  it("não cria ancestrais sem ramo", async () => {
    await assertFails(setDoc(doc(as("repA"), "people/new"), person({ branchId: null })));
  });
  it("não remove quem já tem login", async () => {
    await assertFails(deleteDoc(doc(as("repA"), "people/pMemA")));
    await assertSucceeds(deleteDoc(doc(as("repA"), "people/pKidA")));
  });
  it("convida membros do próprio ramo", async () => {
    await assertSucceeds(setDoc(doc(as("repA"), "invites/z@gmail.com"), {
      email: "z@gmail.com", name: "Z", branchId: "A", role: "member", personId: "pKidA", status: "pending", sendCount: 1, invitedBy: "repA",
    }));
  });
  it("não convida representantes, nem para outro ramo, nem em nome de outro", async () => {
    const base = { email: "z@gmail.com", branchId: "A", role: "member", status: "pending", sendCount: 1, invitedBy: "repA" };
    await assertFails(setDoc(doc(as("repA"), "invites/z@gmail.com"), { ...base, role: "rep" }));
    await assertFails(setDoc(doc(as("repA"), "invites/z@gmail.com"), { ...base, branchId: "B" }));
    await assertFails(setDoc(doc(as("repA"), "invites/z@gmail.com"), { ...base, invitedBy: "admin" }));
    await assertFails(setDoc(doc(as("repA"), "invites/other@gmail.com"), base));
  });
  it("reenvia e cancela convites do ramo, sem trocar o ramo", async () => {
    await assertSucceeds(updateDoc(doc(as("repA"), "invites/x@gmail.com"), { sendCount: 2 }));
    await assertSucceeds(updateDoc(doc(as("repA"), "invites/x@gmail.com"), { status: "cancelled" }));
    await assertFails(updateDoc(doc(as("repA"), "invites/x@gmail.com"), { branchId: "B" }));
    await assertFails(updateDoc(doc(as("repA"), "invites/x@gmail.com"), { status: "accepted" }));
    await assertFails(updateDoc(doc(as("repA"), "invites/y@gmail.com"), { sendCount: 2 }));
  });
  it("lista só convites do próprio ramo", async () => {
    await assertSucceeds(getDocs(query(collection(as("repA"), "invites"), where("branchId", "==", "A"))));
    await assertFails(getDocs(collection(as("repA"), "invites")));
    await assertFails(getDoc(doc(as("repA"), "invites/y@gmail.com")));
  });
  it("pode conferir se um Gmail ainda não foi convidado", async () => {
    await assertSucceeds(getDoc(doc(as("repA"), "invites/nobody@gmail.com")));
  });
  it("não cria ramos", async () => {
    await assertFails(setDoc(doc(as("repA"), "branches/C"), { name: "C" }));
  });
});

describe("admin", () => {
  it("faz tudo o que precisa", async () => {
    await assertSucceeds(setDoc(doc(as("admin"), "branches/C"), { name: "C", color: "#fff", order: 2, personId: null }));
    await assertSucceeds(setDoc(doc(as("admin"), "people/vo"), person({ branchId: null })));
    await assertSucceeds(updateDoc(doc(as("admin"), "users/memA"), { role: "rep" }));
    await assertSucceeds(setDoc(doc(as("admin"), "invites/rep@gmail.com"), {
      email: "rep@gmail.com", branchId: "B", role: "rep", status: "pending", sendCount: 1, invitedBy: "admin",
    }));
    await assertSucceeds(getDocs(collection(as("admin"), "invites")));
  });
  it("nem o admin lê a fila de e-mails", async () => {
    await assertFails(getDocs(collection(as("admin"), "mail")));
  });
});

describe("fotos", () => {
  const img = new Uint8Array([1, 2, 3]);
  const meta = { contentType: "image/jpeg" };
  const st = (uid: string | null) => (uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage());

  it("cada um envia a própria foto; representante envia as do ramo", async () => {
    await assertSucceeds(uploadBytes(ref(st("memA"), "people/pMemA/p.jpg"), img, meta));
    await assertSucceeds(uploadBytes(ref(st("repA"), "people/pKidA/p.jpg"), img, meta));
  });
  it("não envia foto de outros nem arquivos que não são imagem", async () => {
    await assertFails(uploadBytes(ref(st("memA"), "people/pKidA/p.jpg"), img, meta));
    await assertFails(uploadBytes(ref(st("repA"), "people/pKidB/p.jpg"), img, meta));
    await assertFails(uploadBytes(ref(st("memA"), "people/pMemA/x.pdf"), img, { contentType: "application/pdf" }));
  });
  it("quem não foi convidado não vê fotos", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "people/pMemA/p.jpg"), img, meta);
    });
    await assertFails(getBytes(ref(st("stranger"), "people/pMemA/p.jpg")));
    await assertSucceeds(getBytes(ref(st("memA"), "people/pMemA/p.jpg")));
  });
});
