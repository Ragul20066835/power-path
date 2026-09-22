# POWERPATH — Event-Day Operator & Judge Checklist

Use this checklist on tournament day to ensure flawless operation during live college competitions (~50 concurrent players).

---

## 1. Pre-Event System Verification (T-60 Minutes)

- [ ] **Backend Health**: Verify `GET /api/v1/health` returns `HTTP 200` and `"database": "connected"`.
- [ ] **Admin Authentication**: Login to `/admin/login` using judge/admin credentials.
- [ ] **Tournament Status**: Navigate to **Settings** and ensure tournament gate is set to `OPEN`.
- [ ] **Active Championship Event**:
  - Open **Events** dashboard.
  - Ensure the intended event is toggled `ACTIVE` (only 1 event can be active at a time).
  - Verify all circuit questions and component sockets are present.
- [ ] **Live Monitor Check**:
  - Open **Live Monitor**.
  - Verify WebSocket status badge displays **REALTIME SYNC** (or **LIVE POLLING** fallback).
  - Verify initial counters display `0 Active / 0 Completed`.

---

## 2. Contestant Registration & Launch (T-0 Minutes)

- [ ] Contestants navigate to root URL (`/`).
- [ ] Contestants enter **Player Name** and **Register Number** (e.g. `REG-2026-001`).
- [ ] Contestants click **Start Challenge**.
- [ ] Admin monitors Live Monitor as active players populate the real-time telemetry grid.

---

## 3. During the Competition

- [ ] **Live Telemetry Observation**:
  - Observe stage progression, placed socket counts, and penalty seconds in real-time.
  - Completed contestants automatically appear on the live **Leaderboard**.
- [ ] **Handling Refresh / Disconnections**:
  - If a contestant accidentally refreshes or closes their browser:
    1. Reopen the tournament page.
    2. The frontend automatically recovers the active session ID from local storage.
    3. The contestant resumes at their current stage with completed sockets and penalties preserved.
- [ ] **Handling Campus Network Fluctuations**:
  - If campus Wi-Fi briefly interrupts the WebSocket connection:
    - The admin UI immediately shifts to **LIVE POLLING** (fetching fresh telemetry every 4s).
    - When network stabilizes, it automatically switches back to **REALTIME SYNC**.

---

## 4. Post-Event & Results Verification

- [ ] Toggled tournament gate to `PAUSED` or `CLOSED` in Settings to prevent late submissions.
- [ ] Open **Results & Leaderboard** tab.
- [ ] Verify official server-authoritative rankings:
  - Ranked by `final_time_ms = raw_time_ms + (penalty_seconds * 1000)`.
- [ ] Export final standings or screenshot podium for awards ceremony.
