import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Trophy, Plus, Trash2, Save, ChevronDown, ChevronUp, X } from 'lucide-react';

const ScoreBoard = ({ meetingId, attendeeNames, isEditable }) => {
    const [games, setGames] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [extraPlayers, setExtraPlayers] = useState([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [showAddPlayer, setShowAddPlayer] = useState(false);
    const initialLoaded = useRef(false);

    // All available players = attendees + extra players
    const allPlayers = [...attendeeNames, ...extraPlayers];

    // Load scoreboard from Firestore
    useEffect(() => {
        if (!meetingId) return;

        const unsubscribe = onSnapshot(doc(db, 'meetings', meetingId), (docSnap) => {
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

        return () => unsubscribe();
    }, [meetingId]);

    const createEmptyGame = () => ({
        id: Date.now(),
        team1: [allPlayers[0] || '', allPlayers[1] || ''],
        team2: [allPlayers[2] || '', allPlayers[3] || ''],
        score1: '',
        score2: '',
    });

    const addGame = () => {
        setGames(prev => [...prev, createEmptyGame()]);
        setIsOpen(true);
    };

    const removeGame = (idx) => {
        setGames(prev => prev.filter((_, i) => i !== idx));
    };

    const updateGame = (idx, field, value) => {
        setGames(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
    };

    const updateTeamPlayer = (gameIdx, team, playerIdx, value) => {
        setGames(prev => prev.map((g, i) => {
            if (i !== gameIdx) return g;
            const newTeam = [...g[team]];
            newTeam[playerIdx] = value;
            return { ...g, [team]: newTeam };
        }));
    };

    const addExtraPlayer = () => {
        const name = newPlayerName.trim();
        if (!name || allPlayers.includes(name)) return;
        setExtraPlayers(prev => [...prev, name]);
        setNewPlayerName('');
        setShowAddPlayer(false);
    };

    const removeExtraPlayer = (name) => {
        setExtraPlayers(prev => prev.filter(p => p !== name));
    };

    const saveScoreboard = async () => {
        if (!meetingId) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'meetings', meetingId), {
                scoreboard: {
                    games,
                    extraPlayers,
                    updatedAt: new Date().toISOString(),
                },
            });
        } catch (err) {
            console.error('Scoreboard save failed:', err);
            alert('스코어보드 저장 실패');
        }
        setSaving(false);
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
                {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
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

                    {/* Action buttons */}
                    {isEditable && (
                        <div className="flex gap-2">
                            <button
                                onClick={addGame}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <Plus size={16} /> 경기 추가
                            </button>
                            <button
                                onClick={saveScoreboard}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                <Save size={16} /> {saving ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ScoreBoard;
