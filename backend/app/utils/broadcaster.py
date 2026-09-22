"""
POWERPATH Realtime Broadcaster & WebSocket Manager
Broadcasts live tournament events to connected Admin Live Monitors.
"""

import logging
import asyncio
from typing import Set, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger("powerpath.broadcaster")


class Broadcaster:
    def __init__(self):
        self._active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._active_connections.add(websocket)
        logger.info(f"Admin monitor connected. Active connections: {len(self._active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self._active_connections.discard(websocket)
        logger.info(f"Admin monitor disconnected. Active connections: {len(self._active_connections)}")

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Broadcast an event payload to all active admin monitors."""
        if not self._active_connections:
            return

        message = {
            "type": event_type,
            "data": data
        }

        stale_connections = []
        for ws in self._active_connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug(f"Failed sending to websocket: {e}")
                stale_connections.append(ws)

        for ws in stale_connections:
            self.disconnect(ws)

    def broadcast_sync(self, event_type: str, data: Dict[str, Any]):
        """Non-blocking sync helper to broadcast events from sync endpoints."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.broadcast(event_type, data))
            else:
                loop.run_until_complete(self.broadcast(event_type, data))
        except Exception:
            pass


broadcaster = Broadcaster()
