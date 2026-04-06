"""
Servicio de Email - Recuperación de Contraseña
Usando Gmail SMTP - misma lógica que email_service.py de Flask
"""

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from django.conf import settings

FRONTEND_URL = os.getenv('CENTINELA_FRONTEND_URL', 'http://localhost:3000').rstrip('/')


def enviar_email_recuperacion(email_destino, nombre_usuario, token_recuperacion):
    """Envía un email real con el link de recuperación de contraseña via Gmail SMTP"""

    try:
        mensaje = MIMEMultipart('alternative')
        mensaje['From'] = settings.EMAIL_HOST_USER
        mensaje['To'] = email_destino
        mensaje['Subject'] = Header('Recuperacion de Contrasena - Centinela', 'utf-8')

        # ✅ URL CON /frontend/ incluido (igual que en Flask)
        url_recuperacion = f'{FRONTEND_URL}/cambiar-password.html?token={token_recuperacion}'

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

        parte_html = MIMEText(html_content, 'html', 'utf-8')
        mensaje.attach(parte_html)

        server = smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT)
        server.starttls()
        server.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
        server.send_message(mensaje)
        server.quit()

        print(f"[OK] Email enviado a: {email_destino}")
        return True

    except Exception as e:
        print(f"[ERROR] Al enviar email: {str(e)}")
        return False


def enviar_email_recuperacion_dev(email_destino, nombre_usuario, token_recuperacion):
    """Versión de desarrollo que solo imprime el link en consola"""
    url_recuperacion = f'{FRONTEND_URL}/cambiar-password.html?token={token_recuperacion}'

    print("\n" + "="*70)
    print("[DEV] MODO DESARROLLO - EMAIL NO ENVIADO")
    print("="*70)
    print(f"Para: {email_destino}")
    print(f"Usuario: {nombre_usuario}")
    print(f"\nLink de recuperacion:")
    print(f"{url_recuperacion}")
    print("="*70 + "\n")

    return True


def enviar_email(email_destino, nombre_usuario, token_recuperacion, modo_produccion=False):
    """Wrapper que decide si enviar email real o solo mostrarlo en consola"""
    if modo_produccion:
        return enviar_email_recuperacion(email_destino, nombre_usuario, token_recuperacion)
    else:
        return enviar_email_recuperacion_dev(email_destino, nombre_usuario, token_recuperacion)

