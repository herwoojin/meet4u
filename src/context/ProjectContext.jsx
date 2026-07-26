import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { DEFAULT_PROJECT_ID, runProjectsMigration } from '../lib/projects';

// ProjectContext keeps the user's list of accessible projects + the
// currently active project id (persisted in localStorage). All calendar /
// meeting components read currentProjectId so the views are project-scoped.

const ProjectContext = createContext(null);
const STORAGE_KEY = 'meet4u_current_project_id';

const lower = (s) => String(s || '').toLowerCase().trim();

export const ProjectProvider = ({ children }) => {
    const { currentUser, isAdmin } = useAuth();
    const myEmail = lower(currentUser?.email);

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentProjectId, setCurrentProjectIdRaw] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_PROJECT_ID; }
        catch { return DEFAULT_PROJECT_ID; }
    });

    const setCurrentProjectId = useCallback((id) => {
        setCurrentProjectIdRaw(id);
        try { id ? localStorage.setItem(STORAGE_KEY, id) : localStorage.removeItem(STORAGE_KEY); }
        catch { /* ignore */ }
    }, []);

    // Subscribe to projects where the current user is a member.
    useEffect(() => {
        if (!myEmail) { setProjects([]); setLoading(false); return; }
        setLoading(true);
        const q = query(
            collection(db, 'projects'),
            where('memberEmails', 'array-contains', myEmail),
        );
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted);
            list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
            setProjects(list);
            setLoading(false);
        }, (err) => {
            console.error('Projects subscription error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [myEmail]);

    // Auto-migrate when an admin logs in (one-shot, guarded by a flag doc).
    useEffect(() => {
        if (!isAdmin || !myEmail) return;
        runProjectsMigration({ adminEmail: myEmail }).then((res) => {
            if (res.ran) console.log('Projects migration completed:', res);
        });
    }, [isAdmin, myEmail]);

    // If the saved current project is not in the user's list, fall back to the
    // first accessible one (or null). 신규 가입자는 projects.length === 0
    // 인 경우에도 반드시 null 로 떨어져야 다른 프로젝트 일정이 새어 나가지 않는다.
    useEffect(() => {
        if (loading) return;
        const found = projects.find(p => p.id === currentProjectId);
        if (!found) setCurrentProjectId(projects[0]?.id || null);
    }, [projects, currentProjectId, loading, setCurrentProjectId]);

    const currentProject = useMemo(
        () => projects.find(p => p.id === currentProjectId) || null,
        [projects, currentProjectId]
    );

    const isCreator = currentProject ? lower(currentProject.createdBy) === myEmail : false;

    const value = useMemo(() => ({
        projects,
        loading,
        currentProjectId,
        currentProject,
        setCurrentProjectId,
        isCreator,
    }), [projects, loading, currentProjectId, currentProject, setCurrentProjectId, isCreator]);

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProjects = () => {
    const ctx = useContext(ProjectContext);
    if (!ctx) throw new Error('useProjects must be used within ProjectProvider');
    return ctx;
};
