import os
import json
import anthropic
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods


@csrf_exempt
@require_http_methods(["POST"])
def chat_ia(request):
    api_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not api_key or api_key in ("", "tu_api_key_aqui", "your_api_key_here"):
        return JsonResponse(
            {
                "error": "API key de Anthropic no configurada",
                "instrucciones": "Copia .env.example a .env y agrega tu API key",
            },
            status=503,
        )

    try:
        body = json.loads(request.body)
        mensaje = body.get("mensaje", "").strip()
        contexto = body.get("contexto", "")

        if not mensaje:
            return JsonResponse({"error": "El campo 'mensaje' es requerido"}, status=400)

        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = (
            "Eres el asistente inteligente de Centinela, sistema de seguridad vecinal "
            "de Privada La Condesa. Ayuda a vecinos con incidencias, uso del sistema y "
            "preguntas sobre la privada. Si detectas emergencia real responde con "
            "ACTIVAR_SOS al inicio. Responde siempre en español, claro y empático."
        )

        messages = []
        if contexto:
            messages.append({"role": "user", "content": contexto})
            messages.append({"role": "assistant", "content": "Entendido, tengo el contexto."})
        messages.append({"role": "user", "content": mensaje})

        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )

        texto = response.content[0].text
        activar_sos = texto.startswith("ACTIVAR_SOS")

        return JsonResponse({"respuesta": texto, "activar_sos": activar_sos})

    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido en el cuerpo de la solicitud"}, status=400)
    except Exception as e:
        return JsonResponse({"error": f"Error interno: {str(e)}"}, status=500)
