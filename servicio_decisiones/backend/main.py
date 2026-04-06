from fastapi import FastAPI
from .db import Base, engine
from .routes import admin, consultas, votos

app = FastAPI(title="Servicio de Toma de Decisiones")

Base.metadata.create_all(bind=engine)

app.include_router(admin.router, prefix="/admin")
app.include_router(consultas.router, prefix="/consultas")
app.include_router(votos.router, prefix="/votos")

@app.get("/")
def root():
    return {"mensaje": "API de decisiones funcionando"}
