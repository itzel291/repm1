"""
Servicio de Email - Recuperación de Contraseña
Usando Gmail SMTP
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# CONFIGURACIÓN DEL SERVIDOR SMTP
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587

# ⚠️ CONFIGURACIÓN DE EMAIL
EMAIL_SENDER = 'carolinaserranotoom@gmail.com'
EMAIL_PASSWORD = 'zdfbsmeajfcgxsli'

def enviar_email_recuperacion(email_destino, nombre_usuario, token_recuperacion):
    """Envía un email con el link de recuperación de contraseña"""
    
    try:
        # Crear el mensaje
        mensaje = MIMEMultipart('alternative')
        mensaje['From'] = EMAIL_SENDER
        mensaje['To'] = email_destino
        mensaje['Subject'] = '🔐 Recuperación de Contraseña - Centinela'
        
        # ✅ URL CON /frontend/ incluido
        url_recuperacion = f'http://localhost:3000/cambiar-password.html?token={token_recuperacion}'
        
        # Contenido HTML del email
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                    padding: 20px;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }}
                .header {{
                    background: linear-gradient(135deg, #FDB913 0%, #F89C0E 100%);
                    padding: 30px;
                    text-align: center;
                }}
                .header h1 {{
                    color: white;
                    margin: 0;
                    font-size: 28px;
                }}
                .content {{
                    padding: 40px 30px;
                }}
                .content h2 {{
                    color: #333;
                    margin-bottom: 20px;
                }}
                .content p {{
                    color: #666;
                    line-height: 1.6;
                    margin-bottom: 20px;
                }}
                .button {{
                    display: inline-block;
                    background: #FDB913;
                    color: white;
                    padding: 15px 40px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    margin: 20px 0;
                }}
                .button:hover {{
                    background: #F89C0E;
                }}
                .info-box {{
                    background: #FFF8E1;
                    border-left: 4px solid #FDB913;
                    padding: 15px;
                    margin: 20px 0;
                }}
                .footer {{
                    background: #f9f9f9;
                    padding: 20px;
                    text-align: center;
                    color: #999;
                    font-size: 12px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏘️ Centinela</h1>
                    <p style="color: white; margin: 10px 0 0 0;">Privada la Condesa</p>
                </div>
                
                <div class="content">
                    <h2>Hola, {nombre_usuario} 👋</h2>
                    
                    <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Centinela.</p>
                    
                    <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
                    
                    <center>
                        <a href="{url_recuperacion}" class="button">
                            🔓 Restablecer Contraseña
                        </a>
                    </center>
                    
                    <div class="info-box">
                        <strong>⏰ Este enlace expirará en 1 hora.</strong><br>
                        Si no solicitaste este cambio, puedes ignorar este mensaje.
                    </div>
                    
                    <p style="font-size: 12px; color: #999;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="{url_recuperacion}" style="color: #FDB913;">{url_recuperacion}</a>
                    </p>
                </div>
                
                <div class="footer">
                    <p>© 2026 Centinela - Privada la Condesa<br>
                    Este es un correo automático, por favor no respondas.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Adjuntar contenido HTML
        parte_html = MIMEText(html_content, 'html')
        mensaje.attach(parte_html)
        
        # Conectar y enviar
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.send_message(mensaje)
        server.quit()
        
        print(f"✅ Email enviado a: {email_destino}")
        return True
        
    except Exception as e:
        print(f"❌ Error al enviar email: {str(e)}")
        return False


def enviar_email_recuperacion_dev(email_destino, nombre_usuario, token_recuperacion):
    """Versión de desarrollo que solo imprime el link en consola"""
    url_recuperacion = f'http://localhost:3000/cambiar-password.html?token={token_recuperacion}'
    
    print("\n" + "="*70)
    print("📧 MODO DESARROLLO - EMAIL NO ENVIADO")
    print("="*70)
    print(f"Para: {email_destino}")
    print(f"Usuario: {nombre_usuario}")
    print(f"\n🔗 Link de recuperación:")
    print(f"{url_recuperacion}")
    print("="*70 + "\n")
    
    return True


def enviar_email(email_destino, nombre_usuario, token_recuperacion, modo_produccion=False):
    """Wrapper que decide si enviar email real o solo mostrarlo en consola"""
    if modo_produccion:
        return enviar_email_recuperacion(email_destino, nombre_usuario, token_recuperacion)
    else:
        return enviar_email_recuperacion_dev(email_destino, nombre_usuario, token_recuperacion)

