// Project model and helpers.
//
// Firestore schema:
//   projects/{projectId}:
//     id, name, description?, icon?, color?,
//     createdBy: email (lowercase),
//     memberEmails: string[] (lowercase),
//     createdAt: serverTimestamp,
//     deleted?: boolean
//
// All meetings now carry a `projectId` field so calendars can scope to a
// single project. Legacy meetings without `projectId` are auto-tagged to
// the default "테니스운동예약" project during a one-shot migration.

import { db } from './firebase';
import {
    collection, doc, addDoc, updateDoc, getDocs, getDoc, setDoc,
    query, where, writeBatch, serverTimestamp,
} from 'firebase/firestore';

export const DEFAULT_PROJECT_NAME = '테니스운동예약';
export const DEFAULT_PROJECT_ID = 'tennis-default';
const MIGRATION_DOC = 'meta/projectsMigrationV1';

const lower = (s) => String(s || '').toLowerCase().trim();

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const createProject = async ({ name, description = '', icon = '📁', color = '#3b82f6', createdBy, memberEmails = [] }) => {
    const me = lower(createdBy);
    const members = Array.from(new Set([me, ...memberEmails.map(lower)].filter(Boolean)));
    const ref = await addDoc(collection(db, 'projects'), {
        name: String(name || '').trim(),
        description,
        icon,
        color,
        createdBy: me,
        memberEmails: members,
        createdAt: serverTimestamp(),
    });
    return ref.id;
};

export const updateProject = (projectId, patch) =>
    updateDoc(doc(db, 'projects', projectId), patch);

export const addMember = async (projectId, email) => {
    const e = lower(email);
    if (!e) return;
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const cur = snap.data().memberEmails || [];
    if (cur.includes(e)) return;
    await updateDoc(ref, { memberEmails: [...cur, e] });
};

export const removeMember = async (projectId, email) => {
    const e = lower(email);
    const ref = doc(db, 'projects', projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const cur = snap.data().memberEmails || [];
    if (!cur.includes(e)) return;
    await updateDoc(ref, { memberEmails: cur.filter(x => x !== e) });
};

export const deleteProject = (projectId) =>
    updateDoc(doc(db, 'projects', projectId), { deleted: true });

// ---------------------------------------------------------------------------
// Membership query
// ---------------------------------------------------------------------------

export const fetchProjectsForUser = async (email) => {
    const e = lower(email);
    if (!e) return [];
    const snap = await getDocs(query(
        collection(db, 'projects'),
        where('memberEmails', 'array-contains', e),
    ));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => !p.deleted);
};

// ---------------------------------------------------------------------------
// One-shot migration: create default project + tag legacy meetings.
// Safe to call multiple times — it short-circuits if the migration flag is
// already set, and uses a deterministic doc id so the default project is
// never duplicated.
// ---------------------------------------------------------------------------

export const runProjectsMigration = async ({ adminEmail }) => {
    const me = lower(adminEmail);
    if (!me) return { ran: false, reason: 'no-admin-email' };

    // Check migration flag (a single meta document)
    try {
        const flagRef = doc(db, ...MIGRATION_DOC.split('/'));
        const flagSnap = await getDoc(flagRef);
        if (flagSnap.exists()) return { ran: false, reason: 'already-migrated' };

        // 1) Collect all known users (from users collection) — they become
        //    the initial members of the default project.
        const usersSnap = await getDocs(collection(db, 'users'));
        const memberEmails = new Set([me]);
        usersSnap.forEach(d => {
            const email = lower(d.data()?.email);
            if (email) memberEmails.add(email);
        });

        // 2) Create the default project with a fixed id.
        const defaultRef = doc(db, 'projects', DEFAULT_PROJECT_ID);
        const defaultSnap = await getDoc(defaultRef);
        if (!defaultSnap.exists()) {
            await setDoc(defaultRef, {
                name: DEFAULT_PROJECT_NAME,
                description: '기존 모임의 기본 프로젝트',
                icon: '🎾',
                color: '#10b981',
                createdBy: me,
                memberEmails: Array.from(memberEmails),
                createdAt: serverTimestamp(),
            });
        }

        // 3) Tag every legacy meeting without a projectId.
        const meetingsSnap = await getDocs(collection(db, 'meetings'));
        const batch = writeBatch(db);
        let untagged = 0;
        meetingsSnap.forEach(m => {
            if (!m.data()?.projectId) {
                batch.update(m.ref, { projectId: DEFAULT_PROJECT_ID });
                untagged++;
            }
        });
        if (untagged > 0) await batch.commit();

        // 4) Set migration flag.
        await setDoc(flagRef, { ranAt: serverTimestamp(), ranBy: me, untagged });

        return { ran: true, untagged, memberCount: memberEmails.size };
    } catch (err) {
        console.error('Projects migration failed:', err);
        return { ran: false, reason: 'error', error: err?.message };
    }
};
