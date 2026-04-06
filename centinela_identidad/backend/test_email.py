"""
Script de prueba para diagnosticar envío de emails
Ejecuta este archivo para probar la configuración de Gmail
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# TUS CREDENCIALES (copia exactamente como están en email_service.py)
EMAIL_SENDER = 'carolinaserranotoom@gmail.com'
EMAIL_PASSWORD = 'zdfbsmeajfcgxsli'  # SIN espacios

SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587

print("="*70)
print("🔍 DIAGNÓSTICO DE EMAIL - CENTINELA")
print("="*70)

print(f"\n📧 Email configurado: {EMAIL_SENDER}")
print(f"🔑 Contraseña (primeros 4 caracteres): {EMAIL_PASSWORD[:4]}****")
print(f"🌐 Servidor SMTP: {SMTP_SERVER}:{SMTP_PORT}")

# PRUEBA 1: Conexión al servidor SMTP
print("\n[1/4] Probando conexión al servidor SMTP...")
try:
    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    print("✅ Conexión establecida")
except Exception as e:
    print(f"❌ Error de conexión: {e}")
    exit()

# PRUEBA 2: Iniciar TLS
print("\n[2/4] Iniciando conexión segura (TLS)...")
try:
    server.starttls()
    print("✅ TLS iniciado correctamente")
except Exception as e:
    print(f"❌ Error en TLS: {e}")
    server.quit()
    exit()

# PRUEBA 3: Login con las credenciales
print("\n[3/4] Intentando login con las credenciales...")
try:
    server.login(EMAIL_SENDER, EMAIL_PASSWORD)
    print("✅ ¡Login exitoso! Las credenciales son correctas")
except smtplib.SMTPAuthenticationError as e:
    print(f"❌ Error de autenticación: {e}")
    print("\n⚠️ POSIBLES SOLUCIONES:")
    print("1. Verifica que la contraseña de aplicación esté correcta")
    print("2. Genera una NUEVA contraseña de aplicación en:")
    print("   https://myaccount.google.com/apppasswords")
    print("3. Copia la nueva contraseña SIN espacios")
    server.quit()
    exit()
except Exception as e:
    print(f"❌ Error inesperado: {e}")
    server.quit()
    exit()

# PRUEBA 4: Enviar email de prueba
print("\n[4/4] Enviando email de prueba...")
try:
    mensaje = MIMEMultipart()
    mensaje['From'] = EMAIL_SENDER
    mensaje['To'] = EMAIL_SENDER  # Te envías a ti mismo
    mensaje['Subject'] = '✅ Prueba de Centinela - Email funcionando'
    
    cuerpo = """
    <h1>¡Email configurado correctamente! 🎉</h1>
    <p>Si recibes este mensaje, significa que tu configuración de Gmail SMTP está funcionando perfectamente.</p>
    <p><strong>Proyecto:</strong> Centinela</p>
    <p><strong>Servicio:</strong> Recuperación de contraseña</p>
    """
    
    mensaje.attach(MIMEText(cuerpo, 'html'))
    
    server.send_message(mensaje)
    print("✅ ¡Email enviado exitosamente!")
    print(f"\n📧 Revisa tu bandeja de entrada: {EMAIL_SENDER}")
    print("   (También revisa la carpeta de SPAM)")
    
except Exception as e:
    print(f"❌ Error al enviar email: {e}")

finally:
    server.quit()
    print("\n" + "="*70)
    print("🔚 Diagnóstico completado")
    print("="*70)

