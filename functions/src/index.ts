import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  beforeUserCreated,
  beforeUserSignedIn,
  HttpsError as AuthHttpsError,
} from "firebase-functions/v2/identity";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineString } from "firebase-functions/params";

initializeApp();
const db = getFirestore();

// E-mails dos administradores, separados por vírgula. Definido no deploy.
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", {
  description: "Gmail do(s) administrador(es), separados por vírgula",
});
// Endereço do site, usado no e-mail de convite.
const SITE_URL = defineString("SITE_URL", {
  description: "Endereço do site, por exemplo https://furtadeira.web.app",
});

type Role = "admin" | "rep" | "member";

function normalize(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.value()
    .split(",")
    .map(normalize)
    .filter(Boolean)
    .includes(email);
}

async function hasValidInvite(email: string): Promise<boolean> {
  const snap = await db.doc(`invites/${email}`).get();
  const status = snap.get("status");
  return snap.exists && (status === "pending" || status === "accepted");
}

const NOT_INVITED =
  "Este Gmail não foi convidado. Peça a alguém da família para enviar um convite.";

async function gate(email: string, verified: boolean | undefined) {
  if (!email || verified === false) {
    throw new AuthHttpsError("permission-denied", NOT_INVITED);
  }
  if (isAdminEmail(email)) return;
  if (!(await hasValidInvite(email))) {
    throw new AuthHttpsError("permission-denied", NOT_INVITED);
  }
}

// Barreira no login: contas sem convite nem chegam a entrar.
// (Exige "Firebase Authentication with Identity Platform", gratuito até 50 mil usuários/mês.)
export const gateCreate = beforeUserCreated(async (event) => {
  const user = event.data;
  await gate(normalize(user?.email), user?.emailVerified);
});

export const gateSignIn = beforeUserSignedIn(async (event) => {
  const user = event.data;
  await gate(normalize(user?.email), user?.emailVerified);
});

/**
 * Chamada pelo site logo após o login.
 * Confere o convite, cria o registro users/{uid} e liga a pessoa da árvore à conta.
 * As regras de segurança só liberam dados para quem tem users/{uid} ativo.
 */
export const joinFamily = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Faça login primeiro.");
  const email = normalize(auth.token.email);
  if (!email || auth.token.email_verified === false) {
    throw new HttpsError("permission-denied", NOT_INVITED);
  }

  const userRef = db.doc(`users/${auth.uid}`);
  const inviteRef = db.doc(`invites/${email}`);
  const admin = isAdminEmail(email);

  return db.runTransaction(async (tx) => {
    const [userSnap, inviteSnap] = await Promise.all([tx.get(userRef), tx.get(inviteRef)]);

    if (userSnap.exists) {
      const existing = userSnap.data()!;
      if (existing.status !== "active") {
        throw new HttpsError("permission-denied", "Seu acesso foi suspenso. Fale com o administrador.");
      }
      if (admin && existing.role !== "admin") {
        tx.update(userRef, { role: "admin" });
        return { ...existing, role: "admin" };
      }
      return existing;
    }

    const invite = inviteSnap.exists ? inviteSnap.data()! : null;
    const inviteOk = invite && (invite.status === "pending" || invite.status === "accepted");
    if (!admin && !inviteOk) {
      throw new HttpsError("permission-denied", NOT_INVITED);
    }

    const role: Role = admin ? "admin" : (invite!.role as Role);
    const branchId: string | null = invite?.branchId ?? null;
    let personId: string | null = invite?.personId ?? null;

    const name = String(auth.token.name ?? invite?.name ?? email.split("@")[0]);
    const photo = (auth.token.picture as string | undefined) ?? null;

    if (personId) {
      const personRef = db.doc(`people/${personId}`);
      const personSnap = await tx.get(personRef);
      if (personSnap.exists) {
        const update: Record<string, unknown> = { uid: auth.uid, email, updatedAt: FieldValue.serverTimestamp() };
        if (!personSnap.get("photoURL") && photo) update.photoURL = photo;
        tx.update(personRef, update);
      } else {
        personId = null;
      }
    }
    // O admin sem convite escolhe depois quem ele é na árvore (página Admin).
    if (!personId && !admin) {
      const [firstName, ...rest] = (invite?.name ?? name).split(" ");
      const personRef = db.collection("people").doc();
      personId = personRef.id;
      tx.set(personRef, {
        firstName,
        lastName: rest.join(" "),
        branchId,
        parentIds: [],
        spouseIds: [],
        uid: auth.uid,
        email,
        photoURL: photo,
        createdBy: auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const userDoc = {
      email,
      displayName: name,
      role,
      branchId,
      personId,
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
    };
    tx.set(userRef, userDoc);
    if (invite) {
      tx.update(inviteRef, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), uid: auth.uid });
    }
    return { ...userDoc, joinedAt: null };
  });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Envia o e-mail de convite quando um convite é criado ou reenviado.
 * Usa a extensão "Trigger Email from Firestore": basta gravar na coleção "mail".
 */
export const sendInvite = onDocumentWritten("invites/{email}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || after.status !== "pending") return;
  if (before && before.sendCount === after.sendCount) return;

  const inviterSnap = after.invitedBy ? await db.doc(`users/${after.invitedBy}`).get() : null;
  const inviter = inviterSnap?.get("displayName") ?? "Alguém da família";
  const site = SITE_URL.value() || `https://${process.env.GCLOUD_PROJECT}.web.app`;
  const name = escapeHtml(String(after.name ?? ""));

  await db.collection("mail").add({
    to: after.email,
    message: {
      subject: `${inviter} convidou você para o site da família Furtadeira`,
      text:
        `Olá ${after.name ?? ""},\n\n${inviter} convidou você para o site privado da família.\n` +
        `Entre com esta conta Google (${after.email}) em: ${site}\n`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:auto;color:#2b2118">
          <h2 style="color:#7a3e1d">Família Furtadeira</h2>
          <p>Olá ${name},</p>
          <p><b>${escapeHtml(inviter)}</b> convidou você para o site privado da família:
          árvore genealógica, perfis e contatos de todos.</p>
          <p style="margin:28px 0">
            <a href="${site}" style="background:#7a3e1d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
              Entrar no site
            </a>
          </p>
          <p style="font-size:14px;color:#6b5d50">Use o botão "Entrar com Google" com esta conta:
          <b>${escapeHtml(after.email)}</b>. Outras contas não terão acesso.</p>
        </div>`,
    },
    inviteEmail: after.email,
    createdAt: FieldValue.serverTimestamp(),
  });
});
