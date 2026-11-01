import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "rep" | "member";

export interface FamilyUser {
  id: string; // uid
  email: string;
  displayName: string;
  role: Role;
  branchId: string | null;
  personId: string | null;
  status: "active" | "blocked";
}

export interface Branch {
  id: string;
  name: string;
  color: string;
  order: number;
  personId: string | null; // o irmão ou irmã que dá nome ao ramo
}

export interface Person {
  id: string;
  firstName: string;
  lastName?: string;
  nickname?: string;
  gender?: "F" | "M" | "";
  birthDate?: string; // AAAA-MM-DD
  deathDate?: string;
  deceased?: boolean;
  city?: string;
  phone?: string;
  email?: string;
  bio?: string;
  photoURL?: string | null;
  parentIds: string[];
  spouseIds: string[];
  branchId: string | null;
  uid?: string | null;
  createdBy?: string;
  updatedAt?: Timestamp;
}

export interface Invite {
  id: string; // e-mail
  email: string;
  name: string;
  branchId: string | null;
  role: Role;
  personId: string | null;
  status: "pending" | "accepted" | "cancelled";
  sendCount: number;
  invitedBy: string;
}
