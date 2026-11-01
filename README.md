# Furtadeira

Private, invitation-only website for the Furtado family. The site's text is in Portuguese.

- **Sign in with Google.** Only Gmail accounts that were invited can get in.
- **Invitations.** The admin invites one representative per brother or sister. Each representative adds their family to the tree and invites them by Gmail. The site emails the invitation.
- **Roles.** Admin (everything), representative (their own branch), member (sees everything, edits their own profile).
- **Profiles and family tree.** The tree starts at the grandparents. There's also a list view by branch, plus birthdays in the next 30 days on the home page.
- **Works like a phone app.** Open the site on a phone and choose "Add to Home Screen".

Built with Vite + React + TypeScript on Firebase (Auth, Firestore, Storage, Functions, Hosting).

## One-time setup in the Firebase console

1. **Blaze plan** (needed for Cloud Functions; family-sized use should stay at or near $0).
2. **Authentication → Sign-in method:** enable **Google**.
3. **Authentication → Settings:** click **Upgrade to Firebase Authentication with Identity Platform**. This is needed for the sign-in gate that blocks uninvited accounts. It's free up to 50,000 users a month.
4. **Firestore Database:** create it in production mode (any location).
5. **Storage:** click **Get started** to create the default bucket (for profile photos).
6. **Extensions → Trigger Email from Firestore:** install it so the site can send invitation emails.
   - Email documents collection: `mail`
   - SMTP connection URI, using a Gmail account and an [app password](https://myaccount.google.com/apppasswords):
     `smtps://YOUR_GMAIL%40gmail.com@smtp.gmail.com:465`, with the app password in the SMTP password field
   - Default FROM address: `Família Furtadeira <YOUR_GMAIL@gmail.com>`

## Deploy (from your computer)

Requires Node.js 22.

```bash
npm install
npm --prefix functions install
npx firebase login
                            # .firebaserc already points to the "furtadeira" project
npm run deploy
```

The first deploy asks for two values and saves them in `functions/.env.<project-id>`:

- `ADMIN_EMAILS`: your Gmail address (more than one can be separated by commas)
- `SITE_URL`: `https://furtadeira.web.app`

Then open the site, sign in with the admin Gmail address, and follow the steps on the **Admin** page:

1. Add the grandparents, your parents and the 10 siblings to the tree.
2. Under "Você na árvore", link your account to your own profile.
3. Create one branch per sibling.
4. Invite one representative per branch.

## Local development with emulators

```bash
npm run emulators                 # in one terminal (Java required)
node scripts/seed-emulator.mjs    # sample family, optional
npm run dev:emulators             # http://localhost:5173
```

The login page has a test form when running on the emulators. `admin@gmail.com` is admin if `functions/.env.local` contains `ADMIN_EMAILS=admin@gmail.com`.

## Tests

```bash
npm run test:rules   # 25 security rule tests (Firestore + Storage)
npm run test:smoke   # end to end: sign-in gate, invite email, joining as rep and member
```

## How access is enforced

- `gateCreate` / `gateSignIn` (Auth blocking functions): refuse Google sign-in for any Gmail address that isn't an admin and has no pending or accepted invite.
- `joinFamily` (callable): after sign-in, checks the invite, creates `users/{uid}` with the role and branch, and links the account to the person in the tree.
- `firestore.rules` / `storage.rules`: no `users/{uid}` with `status: active` means no data at all. Representatives can only write to their own branch. Only the admin can create branches, change roles or block accounts.
- `sendInvite` (Firestore trigger): queues the invitation email in `mail` when an invite is created or resent.
