from typing import Dict, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.active_sockets: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.active_sockets.add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        self.active_sockets.discard(websocket)

    async def broadcast(self, message: str):
        for websocket in self.active_sockets:
            await websocket.send_text(message)

    async def broadcast_except(self, message: str, excluded: WebSocket):
        for websocket in self.active_sockets:
            if websocket is excluded:
                continue
            await websocket.send_text(message)

    async def send_personal(self, user_id: str, message: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

# Instancia global para que main.py pueda importarla
manager = ConnectionManager()

