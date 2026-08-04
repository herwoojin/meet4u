// Celestial Loom — 우주 베틀 효과
//
// 원본 스니펫(celestial-loom.tsx, Tailwind 4 + TS) 을 meet4u 스택(JS + Tailwind 3)
// 으로 이식. 세로 그리드(warp)와 셔틀(shuttle) 이 좌→우로 이동하며 가로 실
// (weft-thread) 을 그리는 프로시져럴 애니메이션.
//
// 실제 클래스 base 스타일(.hero-section / .warp-grid / .shuttle / .weft-thread) 은
// 원문에 없어 index.css 에 별도로 정의했다.

import React, { useMemo } from 'react';

const random = (min, max) => Math.random() * (max - min) + min;

const COLORS = [
    '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf',
    '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff',
];

// MainLayout 은 mobile menu, sidebar collapse, notif permission 등 여러
// 상태로 자주 리렌더된다. useMemo 없이 두면 매 렌더마다 random() 이 다시
// 실행되어 duration/delay/position 이 바뀌고 애니메이션이 리셋되므로
// 마운트 시 한 번만 계산해 고정한다.
const CelestialLoom = () => {
    const runs = useMemo(() => {
        return Array.from({ length: 25 }, () => ({
            duration: random(5, 12),
            delay: random(0, 10),
            shuttlePos: random(5, 95),
            weftPos: random(5, 95),
            shuttleColor: COLORS[Math.floor(random(0, COLORS.length))],
            weftColor: COLORS[Math.floor(random(0, COLORS.length))],
        }));
    }, []);

    return (
        <div className="celestial-loom" aria-hidden="true">
            <div className="warp-grid"></div>

            {runs.map((r, i) => (
                <div
                    key={i}
                    className="shuttle-run"
                    style={{
                        animationDuration: `${r.duration}s`,
                        animationDelay: `${r.delay}s`,
                    }}
                >
                    <div
                        className="shuttle"
                        style={{
                            '--position': `${r.shuttlePos}%`,
                            '--color': r.shuttleColor,
                            animationDuration: `${r.duration}s`,
                            animationDelay: `${r.delay}s`,
                        }}
                    ></div>
                    <div
                        className="weft-thread"
                        style={{
                            '--position': `${r.weftPos}%`,
                            '--color': r.weftColor,
                            animationDuration: `${r.duration}s`,
                            animationDelay: `${r.delay}s`,
                        }}
                    ></div>
                </div>
            ))}
        </div>
    );
};

export default CelestialLoom;
