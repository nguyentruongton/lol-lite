import { useCallback, useEffect, useState } from 'react'
import { GameSurface } from './components/GameSurface'
import { ClockIcon, CrossSwordsIcon, PauseIcon, SwordIcon, VolumeIcon } from './components/Icons'
import { GameEngine } from './game/engine'
import type { GameSnapshot } from './game/types'

function formatTime(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function formatClearTime(seconds: number | null) {
  if (seconds === null) return '—'
  return `${seconds.toFixed(1)}s`
}

function Hud({ snapshot, engine }: { snapshot: GameSnapshot; engine: GameEngine }) {
  const cooldownRatio = snapshot.attackCooldown / snapshot.attackCooldownMax
  return (
    <div className="hud" aria-live="polite">
      <button className="hud-button pause-button" aria-label="Tạm dừng" onClick={() => engine.pause()}>
        <PauseIcon />
      </button>

      <div className="score-panel">
        <div className="score-row"><ClockIcon /><strong>{formatTime(snapshot.remainingTime)}</strong></div>
        <div className="score-row"><CrossSwordsIcon /><strong>{snapshot.lastHits} / {snapshot.goal}</strong></div>
      </div>

      <div className="gold-panel" aria-label={`${snapshot.gold} vàng`}>
        <span className="gold-coin">S</span>
        <strong>{snapshot.gold}</strong>
      </div>

      <div className="hero-panel">
        <div className="hero-portrait"><img src={`${import.meta.env.BASE_URL}assets/game/hero.webp`} alt="Kiếm sĩ gió" /></div>
        <div className="hero-level">6</div>
        <div className="health-wrap">
          <span className="health-value">620 / 620</span>
          <span className="health-fill" />
        </div>
      </div>

      <div className="combo-panel" data-visible={snapshot.combo > 1}>
        <small>COMBO</small><strong>x{snapshot.combo}</strong>
      </div>

      <button
        className="attack-button"
        style={{ '--cooldown': `${cooldownRatio * 360}deg` } as React.CSSProperties}
        aria-label="Đánh thường"
        disabled={snapshot.phase !== 'playing'}
        onPointerDown={(event) => {
          event.stopPropagation()
          engine.dispatchInput({ type: 'basicAttack' })
        }}
      >
        <span className="attack-inner"><SwordIcon /></span>
      </button>
    </div>
  )
}

function Tutorial({ onStart }: { onStart: () => void }) {
  return (
    <div className="modal-layer">
      <section className="modal tutorial-modal">
        <div className="crest"><SwordIcon /></div>
        <p className="eyeline">HƯỚNG DẪN TÂN BINH</p>
        <h1>Đòn đánh quyết định</h1>
        <p className="modal-copy">Canh đúng khoảnh khắc để tung đòn cuối cùng lên lính địch. Mỗi lần kết liễu mang về vàng và nối dài combo.</p>
        <div className="tutorial-steps">
          <div><span className="tap-glyph"><i /><i /><i /><i /></span><p><strong>Chạm mặt đất</strong><small>Di chuyển đến vị trí đã chọn</small></p></div>
          <div><span className="target-glyph">◎</span><p><strong>Chạm vào lính</strong><small>Chọn mục tiêu và tiếp cận</small></p></div>
          <div><span className="mini-sword"><SwordIcon /></span><p><strong>Ra đòn đúng lúc</strong><small>Đạt 20 last-hit trong 3 phút</small></p></div>
        </div>
        <button className="primary-button" onClick={onStart}>BƯỚC VÀO ĐẤU TRƯỜNG</button>
      </section>
    </div>
  )
}

function ReadyScreen({ bestLastHits, onStart }: { bestLastHits: number; onStart: () => void }) {
  return (
    <div className="modal-layer">
      <section className="modal ready-modal">
        <div className="crest"><SwordIcon /></div>
        <p className="eyeline">THỬ THÁCH LUYỆN TẬP</p>
        <h1>Last-Hit Challenge</h1>
        <p className="modal-copy">20 mục tiêu. 180 giây. Chỉ có nhịp độ của bạn và một đường kiếm chính xác.</p>
        <div className="record-strip"><span>KỶ LỤC</span><strong>{bestLastHits} last-hit</strong></div>
        <button className="primary-button" onClick={onStart}>BẮT ĐẦU</button>
      </section>
    </div>
  )
}

function PauseMenu({ snapshot, engine }: { snapshot: GameSnapshot; engine: GameEngine }) {
  return (
    <div className="modal-layer">
      <section className="modal compact-modal">
        <p className="eyeline">TRẬN ĐẤU ĐÃ DỪNG</p>
        <h2>Tạm dừng</h2>
        <button className="primary-button" onClick={() => engine.resume()}>TIẾP TỤC</button>
        <button className="secondary-button" onClick={() => engine.setMuted(!snapshot.muted)}>
          <VolumeIcon muted={snapshot.muted} /> {snapshot.muted ? 'BẬT ÂM THANH' : 'TẮT ÂM THANH'}
        </button>
        <button className="text-button" onClick={() => engine.restart()}>CHƠI LẠI TỪ ĐẦU</button>
      </section>
    </div>
  )
}

function Results({ snapshot, engine }: { snapshot: GameSnapshot; engine: GameEngine }) {
  const success = snapshot.lastHits >= snapshot.goal
  return (
    <div className="modal-layer result-layer">
      <section className="modal result-modal">
        <div className={`result-emblem ${success ? 'success' : ''}`}><SwordIcon /></div>
        <p className="eyeline">{success ? 'THỬ THÁCH HOÀN THÀNH' : 'HẾT THỜI GIAN'}</p>
        <h2>{success ? 'Nhát kiếm hoàn hảo' : 'Chỉ còn một nhịp nữa'}</h2>
        <div className="result-grid">
          <div><small>LAST-HIT</small><strong>{snapshot.lastHits}<span>/{snapshot.goal}</span></strong></div>
          <div><small>VÀNG</small><strong>{snapshot.gold}</strong></div>
          <div><small>CHÍNH XÁC</small><strong>{snapshot.accuracy}%</strong></div>
          <div><small>COMBO CAO NHẤT</small><strong>x{snapshot.bestCombo}</strong></div>
        </div>
        <div className="best-row"><span>Tốc độ tốt nhất</span><strong>{formatClearTime(snapshot.bestClearTime)}</strong></div>
        <button className="primary-button" onClick={() => engine.restart()}>THỬ LẠI</button>
      </section>
    </div>
  )
}

export default function App() {
  const [engine] = useState(() => new GameEngine())
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot())
  const handleReady = useCallback(() => engine.markReady(), [engine])

  useEffect(() => engine.subscribe(setSnapshot), [engine])
  useEffect(() => () => engine.destroy(), [engine])

  const showHud = ['countdown', 'playing', 'paused', 'result'].includes(snapshot.phase)
  return (
    <main className="app-shell">
      <GameSurface engine={engine} onReady={handleReady} />
      <div className="vignette" />
      {showHud ? <Hud snapshot={snapshot} engine={engine} /> : null}
      {snapshot.phase === 'loading' ? (
        <div className="loading-screen"><div className="loading-mark"><SwordIcon /></div><p>ĐANG TRIỆU HỒI ĐẤU TRƯỜNG</p><span /></div>
      ) : null}
      {snapshot.phase === 'tutorial' ? <Tutorial onStart={() => engine.completeTutorial()} /> : null}
      {snapshot.phase === 'ready' ? <ReadyScreen bestLastHits={snapshot.bestLastHits} onStart={() => engine.start()} /> : null}
      {snapshot.phase === 'countdown' ? <div className="countdown" key={Math.ceil(snapshot.countdown)}>{Math.max(1, Math.ceil(snapshot.countdown))}</div> : null}
      {snapshot.phase === 'paused' ? <PauseMenu snapshot={snapshot} engine={engine} /> : null}
      {snapshot.phase === 'result' ? <Results snapshot={snapshot} engine={engine} /> : null}
    </main>
  )
}
