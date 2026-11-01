// Preenche os emuladores com uma família de exemplo, para testar o site localmente.
// Uso: com "npm run emulators" rodando, execute "node scripts/seed-emulator.mjs".
import { createRequire } from "node:module";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "demo-furtadeira" });
const db = getFirestore();
const batch = db.batch();
const P = (id, data) => batch.set(db.doc(`people/${id}`), { parentIds: [], spouseIds: [], branchId: null, uid: null, ...data });

P("avo", { firstName: "José", lastName: "Furtado", birthDate: "1915-03-02", deathDate: "1990-07-10", deceased: true, gender: "M", spouseIds: ["avoa"] });
P("avoa", { firstName: "Ana", lastName: "Furtado", birthDate: "1920-11-20", deathDate: "2001-01-05", deceased: true, gender: "F", spouseIds: ["avo"] });
P("pai", { firstName: "Ovande", lastName: "Furtado", birthDate: "1945-05-01", parentIds: ["avo", "avoa"], spouseIds: ["mae"], gender: "M" });
P("mae", { firstName: "Helena", lastName: "Furtado", birthDate: "1948-09-15", spouseIds: ["pai"], gender: "F" });
P("tio", { firstName: "Carlos", lastName: "Furtado", birthDate: "1950-02-11", parentIds: ["avo", "avoa"], gender: "M" });

const COLORS = ["#c0392b", "#d35400", "#b7950b", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#c2185b", "#6d4c41", "#546e7a"];
const names = ["Ovande Jr", "Paulo", "Marcos", "Pedro", "Lucas", "Maria", "Rita", "Clara", "Sofia", "Lúcia"];
const today = new Date();
names.forEach((name, i) => {
  const id = `irmao${i}`;
  const bday = `19${70 + i}-${String(((today.getMonth() + i) % 12) + 1).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`;
  batch.set(db.doc(`branches/b${i}`), { name, color: COLORS[i], order: i, personId: id });
  P(id, { firstName: name, lastName: "Furtado", birthDate: bday, parentIds: ["pai", "mae"], branchId: `b${i}`, city: "Recife", spouseIds: i % 3 === 0 ? [] : [`conj${i}`] });
  if (i % 3 !== 0) P(`conj${i}`, { firstName: `Cônjuge ${i}`, lastName: "Silva", branchId: `b${i}`, spouseIds: [id] });
  for (let k = 0; k < (i % 4) + 1; k++) {
    P(`neto${i}_${k}`, { firstName: `Neto ${i}.${k}`, lastName: "Furtado", birthDate: `200${k}-0${k + 1}-1${k}`, parentIds: i % 3 === 0 ? [id] : [id, `conj${i}`], branchId: `b${i}` });
  }
});
await batch.commit();
console.log("Família de exemplo criada.");
