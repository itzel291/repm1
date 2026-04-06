"""
Base de Datos - Servicio de Autenticación Centinela
Sistema completo con recuperación de contraseña
"""

import sqlite3
import hashlib
from datetime import datetime

def crear_hash_password(password):
    """Encripta la contraseña usando SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def inicializar_base_datos():
    """Crea las tablas necesarias"""
    
    conn = sqlite3.connect('centinela.db')
    cursor = conn.cursor()
    
    # Eliminar tablas si existen
    cursor.execute('DROP TABLE IF EXISTS tokens_recuperacion')
    cursor.execute('DROP TABLE IF EXISTS sesiones')
    cursor.execute('DROP TABLE IF EXISTS usuarios')
    cursor.execute('DROP TABLE IF EXISTS padron_casas')
    
    # TABLA 1: Padrón de casas (1-50)
    cursor.execute('''
        CREATE TABLE padron_casas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_casa TEXT UNIQUE NOT NULL,
            ocupada BOOLEAN DEFAULT 0
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_completo TEXT NOT NULL,
            numero_casa TEXT UNIQUE NOT NULL,
            edad INTEGER NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            activo BOOLEAN DEFAULT 1,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (numero_casa) REFERENCES padron_casas(numero_casa)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_expiracion DATETIME,
            activa BOOLEAN DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE tokens_recuperacion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_expiracion DATETIME,
            usado BOOLEAN DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES usuarios(id)
        )
    ''')
    
    print("✅ Tablas creadas exitosamente")
    

    for i in range(1, 51):
        cursor.execute(
            'INSERT INTO padron_casas (numero_casa, ocupada) VALUES (?, ?)',
            (f"Casa {i}", 0)
        )
    
    print(f"✅ 50 casas insertadas en el padrón")
    
    # Usuarios de prueba
    usuarios_prueba = [
        ('Administrador Sistema', 'Casa 1', 30, 'admin@centinela.com', 'admin123'),
        ('María González López', 'Casa 5', 72, 'maria@email.com', 'maria123'),
        ('Carlos Ramírez Pérez', 'Casa 10', 45, 'carlos@email.com', 'carlos123'),
    ]
    
    for nombre, casa, edad, email, password in usuarios_prueba:
        password_hash = crear_hash_password(password)
        
        cursor.execute('''
            INSERT INTO usuarios (nombre_completo, numero_casa, edad, email, password)
            VALUES (?, ?, ?, ?, ?)
        ''', (nombre, casa, edad, email, password_hash))
        
        cursor.execute(
            'UPDATE padron_casas SET ocupada = 1 WHERE numero_casa = ?',
            (casa,)
        )
    
    conn.commit()
    print(f"✅ {len(usuarios_prueba)} usuarios de prueba creados")
    
    # Mostrar usuarios
    print("\n📋 USUARIOS DE PRUEBA:")
    print("-" * 70)
    cursor.execute('SELECT nombre_completo, numero_casa, email FROM usuarios')
    
    for usuario in cursor.fetchall():
        print(f"👤 {usuario[0]} | {usuario[1]} | {usuario[2]}")
    
    print("-" * 70)
    print("\n🔑 CREDENCIALES:")
    print("Email: admin@centinela.com | Password: admin123")
    print("Email: maria@email.com | Password: maria123")
    
    conn.close()
    print("\n✅ Base de datos inicializada correctamente\n")

if __name__ == '__main__':
    inicializar_base_datos()

