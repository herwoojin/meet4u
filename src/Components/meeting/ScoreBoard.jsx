import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Trophy, Plus, Trash2, ChevronDown, ChevronUp, X, Check } from 'lucide-react';

const ScoreBoard = ({ meetingId, attendeeNames, isEditable }) => {
    const [games, setGames] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [extraPlayers, setExtraPlayers] = useState([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [showAddPlayer, setShowAddPlayer] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved'
    const initialLoaded = useRef(false);
    const skipNextSync = useRef(false);
    const saveTimer = useRef(null);

    // All available players = attendees + extra players
    const allPlayers = [...attendeeNames, ...extraPlayers];

    // Auto-save to Firestore
    const saveToFirestore = useCallback(async (gamesToSave, extraPlayeresToSave) => {
        if (!meetingId) return;
        setAutoSaveStatus('saving');
        skipNextSync.current = true;
        try {
            await updateDoc(doc(db, 'meetings', meetingId), {
                scoreboard: {
                    games: gamesToSave,
                    extraPlayers: extraPlayeresToSave,
                    updatedAt: new Date().toISOString(),
                },
            });
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus(null), 1500);
        } catch (err) {
            console.error('Scoreboard auto-save failed:', err);
            setAutoSaveStatus(null);
        }
    }, [meetingId]);

    // Debounced auto-save: triggers 500ms after last change
    const scheduleAutoSave = useCallback((newGames, newExtraPlayers) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveToFirestore(newGames, newExtraPlayers);
        }, 500);
    }, [saveToFirestore]);

    // Load scoreboard from Firestore
    useEffect(() => {
        if (!meetingId) return;

        const unsubscribe = onSnapshot(doc(db, 'meetings', meetingId), (docSnap) => {
            if (skipNextSync.current) {
                skipNextSync.current = false;
                return;
            }
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.scoreboard) {
                    setGames(data.scoreboard.games || []);
                    setExtraPlayers(data.scoreboard.extraPlayers || []);
                    if (!initialLoaded.current && (data.scoreboard.games?.length > 0)) {
                        setIsOpen(true);
                    }
                }
                initialLoaded.current = true;
            }
        });

        return () => {
            unsubscribe();
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [meetingId]);

    const createEmptyGame = () => ({
        id: Date.now(),
        team1: ['', ''],
        team2: ['', ''],
        score1: '',
        score2: '',
    });

    const addGame = () => {
        const newGame = createEmptyGame();
        const newGames = [...games, newGame];
        setGames(newGames);
        setIsOpen(true);
        scheduleAutoSave(newGames, extraPlayers);
    };

    const removeGame = (idx) => {
        const newGames = games.filter((_, i) => i !== idx);
        setGames(newGames);
        scheduleAutoSave(newGames, extraPlayers);
    };

    const updateGame = (idx, field, value) => {
        const newGames = games.map((g, i) => i === idx ? { ...g, [field]: value } : g);
        setGames(newGames);
        scheduleAutoSave(newGames, extraPlayers);
    };

    const updateTeamPlayer = (gameIdx, team, playerIdx, value) => {
        const newGames = games.map((g, i) => {
            if (i !== gameIdx) return g;
            const newTeam = [...g[team]];
            newTeam[playerIdx] = value;
            return { ...g, [team]: newTeam };
        });
        setGames(newGames);
        scheduleAutoSave(newGames, extraPlayers);
    };

    const addExtraPlayer = () => {
        const name = newPlayerName.trim();
        if (!name || allPlayers.includes(name)) return;
        const newExtra = [...extraPlayers, name];
        setExtraPlayers(newExtra);
        setNewPlayerName('');
        setShowAddPlayer(false);
        scheduleAutoSave(games, newExtra);
    };

    const removeExtraPlayer = (name) => {
        const newExtra = extraPlayers.filter(p => p !== name);
        setExtraPlayers(newExtra);
        scheduleAutoSave(games, newExtra);
    };

    const PlayerDropdown = ({ value, onChange }) => (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={!isEditable}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500 appearance-none"
        >
            <option value="">선택</option>
            {allPlayers.map((name, i) => (
                <option key={i} value={name}>{name}</option>
            ))}
        </select>
    );

    return (
        <div className="bg-gray-50 rounded-xl border border-gray-100">
            {/* Header - always visible */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-2 text-gray-900 font-bold">
                    <Trophy size={18} className="text-yellow-500" />
                    스코어보드 ({games.length})
                </div>
                <div className="flex items-center gap-2">
                    {autoSaveStatus === 'saving' && (
                        <span className="text-xs text-gray-400">저장 중...</span>
                    )}
                    {autoSaveStatus === 'saved' && (
                        <span className="text-xs text-green-500 flex items-center gap-0.5">
                            <Check size={12} /> 저장됨
                        </span>
                    )}
                    {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
            </button>

            {/* Collapsible content */}
            {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                    {/* Extra players management */}
                    {isEditable && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {extraPlayers.map((name, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">
                                    {name}
                                    <button onClick={() => removeExtraPlayer(name)} className="hover:text-red-500">
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                            {showAddPlayer ? (
                                <div className="inline-flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={newPlayerName}
                                        onChange={(e) => setNewPlayerName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addExtraPlayer()}
                                        placeholder="이름"
                                        className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        autoFocus
                                    />
                                    <button onClick={addExtraPlayer} className="text-xs text-blue-600 font-bold px-1">추가</button>
                                    <button onClick={() => { setShowAddPlayer(false); setNewPlayerName(''); }} className="text-xs text-gray-400 px-1">취소</button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowAddPlayer(true)}
                                    className="inline-flex items-center gap-0.5 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded-full border border-dashed border-gray-300 hover:border-blue-400"
                                >
                                    <Plus size={12} /> 참석자 추가
                                </button>
                            )}
                        </div>
                    )}

                    {/* Game cards */}
                    {games.length === 0 && (
                        <p className="text-center text-gray-400 text-sm py-4">경기 결과를 추가해보세요!</p>
                    )}

                    {games.map((game, idx) => (
                        <div key={game.id || idx} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500">경기 {idx + 1}</span>
                                {isEditable && (
                                    <button onClick={() => removeGame(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Team 1 */}
                                <div className="flex-1 space-y-1">
                                    <PlayerDropdown value={game.team1[0]} onChange={(v) => updateTeamPlayer(idx, 'team1', 0, v)} />
                                    <PlayerDropdown value={game.team1[1]} onChange={(v) => updateTeamPlayer(idx, 'team1', 1, v)} />
                                </div>

                                {/* Score */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <input
                                        type="number"
                                        value={game.score1}
                                        onChange={(e) => updateGame(idx, 'score1', e.target.value)}
                                        disabled={!isEditable}
                                        className="w-10 h-10 text-center text-lg font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                                        min="0"
                                    />
                                    <span className="text-gray-400 font-bold text-lg">:</span>
                                    <input
                                        type="number"
                                        value={game.score2}
                                        onChange={(e) => updateGame(idx, 'score2', e.target.value)}
                                        disabled={!isEditable}
                                        className="w-10 h-10 text-center text-lg font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                                        min="0"
                                    />
                                </div>

                                {/* Team 2 */}
                                <div className="flex-1 space-y-1">
                                    <PlayerDropdown value={game.team2[0]} onChange={(v) => updateTeamPlayer(idx, 'team2', 0, v)} />
                                    <PlayerDropdown value={game.team2[1]} onChange={(v) => updateTeamPlayer(idx, 'team2', 1, v)} />
                                </div>
                            </div>

                            {/* Win indicator */}
                            {game.score1 !== '' && game.score2 !== '' && (
                                <div className="text-center">
                                    {Number(game.score1) > Number(game.score2) && (
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">팀1 승리</span>
                                    )}
                                    {Number(game.score1) < Number(game.score2) && (
                                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">팀2 승리</span>
                                    )}
                                    {Number(game.score1) === Number(game.score2) && (
                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">무승부</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add game button */}
                    {isEditable && (
                        <button
                            onClick={addGame}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <Plus size={16} /> 경기 추가
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default ScoreBoard;
