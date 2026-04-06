# Documentación Técnica — Centinela Identidad
## Sistema de Autenticación con Django

---

## 1. ¿Qué es este sistema?

Centinela Identidad es un sistema de autenticación para una privada residencial (Privada la Condesa). Permite a los residentes registrarse, iniciar sesión y recuperar su contraseña por correo electrónico.

El sistema está dividido en dos partes:

```
centinela_identidad/
├── frontend/          → Páginas HTML/CSS/JS que ve el usuario
└── backend_django/    → API REST hecha en Django (este documento)
```

El frontend y el backend se comunican enviándose mensajes en formato **XML**.

---

## 2. Estructura del Proyecto Django

```
backend_django/
├── manage.py                          → Herramienta de comandos de Django
├── requirements.txt                   → Dependencias Python
├── centinela.db                       → Base de datos SQLite
│
├── centinela/                         → Configuración del proyecto
│   ├── settings.py                    → Ajustes globales (DB, email, CORS)
│   ├── urls.py                        → Enrutador principal
│   └── wsgi.py                        → Punto de entrada del servidor
│
└── auth_app/                          → Aplicación de autenticación
    ├── models.py                      → Modelos (tablas de la base de datos)
    ├── views.py                       → Lógica de los endpoints
    ├── urls.py                        → Rutas de los endpoints
    ├── email_service.py               → Envío de correos Gmail
    ├── migrations/
    │   └── 0001_initial.py            → Creación de tablas en la DB
    └── management/commands/
        └── seed_db.py                 → Comando para poblar la DB inicial
```

---

## 3. La Base de Datos

El sistema usa **SQLite** — una base de datos que se guarda en un solo archivo (`centinela.db`). No necesita instalar un servidor de base de datos.

Django se comunica con la base de datos a través de **modelos** (clases Python). Cada modelo es una tabla.

### Tabla 1: `padron_casas`
Registro oficial de las 50 casas de la privada.

| Campo        | Tipo    | Descripción                    |
|-------------|---------|--------------------------------|
| id           | Integer | Clave primaria automática      |
| numero_casa  | Text    | "Casa 1", "Casa 2" ... "Casa 50" (único) |
| ocupada      | Boolean | True si ya hay un residente registrado |

### Tabla 2: `usuarios`
Los residentes registrados en el sistema.

| Campo           | Tipo     | Descripción                         |
|----------------|----------|-------------------------------------|
| id              | Integer  | Clave primaria automática           |
| nombre_completo | Text     | Nombre del residente                |
| numero_casa     | Text     | Referencia a `padron_casas` (única) |
| edad            | Integer  | Edad del residente                  |
| email           | Text     | Correo electrónico (único)          |
| password        | Text     | Contraseña encriptada con SHA-256   |
| activo          | Boolean  | Si la cuenta está activa            |
| fecha_registro  | DateTime | Fecha y hora del registro           |

### Tabla 3: `sesiones`
Registro de sesiones activas (tokens de acceso).

| Campo            | Tipo     | Descripción                        |
|-----------------|----------|------------------------------------|
| id               | Integer  | Clave primaria automática          |
| user_id          | Integer  | Referencia al usuario              |
| token            | Text     | Cadena única y segura (único)      |
| fecha_creacion   | DateTime | Cuándo se inició sesión            |
| fecha_expiracion | DateTime | Cuándo expira (24 horas después)   |
| activa           | Boolean  | Si la sesión sigue activa          |

### Tabla 4: `tokens_recuperacion`
Tokens temporales para restablecer contraseñas.

| Campo            | Tipo     | Descripción                        |
|-----------------|----------|------------------------------------|
| id               | Integer  | Clave primaria automática          |
| user_id          | Integer  | Referencia al usuario              |
| token            | Text     | Cadena única y segura (único)      |
| fecha_creacion   | DateTime | Cuándo se generó                   |
| fecha_expiracion | DateTime | Cuándo expira (1 hora después)     |
| usado            | Boolean  | Si ya fue utilizado                |

### Relaciones entre tablas

```
padron_casas ←──(OneToOne)── usuarios ←──(ForeignKey)── sesiones
                                      └──(ForeignKey)── tokens_recuperacion
```

- Una casa puede tener como máximo un usuario (`OneToOneField`)
- Un usuario puede tener muchas sesiones (`ForeignKey`)
- Un usuario puede tener muchos tokens de recuperación (`ForeignKey`)

---

## 4. Cómo Django Maneja las Rutas (URLs)

En Flask se usaban decoradores directamente sobre las funciones:
```python
# Flask
@app.route('/auth/login', methods=['POST'])
def login():
    ...
```

En Django, las rutas se definen **separadas** de las funciones, en archivos `urls.py`:

```python
# centinela/urls.py  →  enrutador principal
urlpatterns = [
    path('', include('auth_app.urls')),  # delega todo a auth_app
]

# auth_app/urls.py  →  rutas específicas
urlpatterns = [
    path('',                                    views.index,                    name='index'),
    path('auth/registro',                       views.registro,                 name='registro'),
    path('auth/login',                          views.login,                    name='login'),
    path('auth/logout',                         views.logout,                   name='logout'),
    path('auth/solicitar-recuperacion',         views.solicitar_recuperacion,   name='solicitar_recuperacion'),
    path('auth/validar-token-recuperacion',     views.validar_token_recuperacion, name='validar_token_recuperacion'),
    path('auth/cambiar-password',               views.cambiar_password,         name='cambiar_password'),
]
```

Cuando llega una petición a `POST /auth/login`, Django:
1. Busca en `centinela/urls.py` → encuentra `include('auth_app.urls')`
2. Busca en `auth_app/urls.py` → encuentra `path('auth/login', views.login)`
3. Ejecuta la función `login()` en `views.py`

---

## 5. Cómo Funcionan las Vistas (Views)

En Flask una vista era simplemente una función con un decorador. En Django es lo mismo, pero con diferencias en cómo se recibe la petición y cómo se responde.

### Diferencias clave Flask → Django

| Concepto           | Flask                            | Django                              |
|-------------------|----------------------------------|-------------------------------------|
| Datos de la petición | `request.data`               | `request.body`                      |
| Verificar método   | Automático con `methods=['POST']` | Manual: `if request.method != 'POST'` |
| Respuesta          | `Response(data, mimetype=...)`   | `HttpResponse(data, content_type=...)` |
| Protección CSRF    | No tiene por defecto             | Tiene por defecto, se desactiva con `@csrf_exempt` en APIs |
| Conexión a DB      | Conexión manual con `sqlite3`    | ORM automático con `Model.objects`  |

### Estructura de una vista en Django

```python
@csrf_exempt                          # Permite peticiones sin token CSRF (necesario para APIs externas)
def login(request):
    if request.method != 'POST':      # Verificar que sea POST
        return HttpResponse(status=405)

    # 1. Leer y parsear el XML de la petición
    root = ET.fromstring(request.body)
    email = root.find('email').text.lower()
    password = root.find('password').text

    # 2. Lógica de negocio con el ORM de Django
    try:
        usuario = Usuario.objects.get(email=email, password=hash)
    except Usuario.DoesNotExist:
        return crear_respuesta_xml('loginResponse', {'estado': 'ERROR', ...}, 401)

    # 3. Devolver respuesta XML
    return crear_respuesta_xml('loginResponse', {'estado': 'OK', 'token': token}, 200)
```

### El ORM de Django vs SQL directo

En Flask se escribía SQL manualmente:
```python
# Flask — SQL directo
cursor.execute('SELECT * FROM usuarios WHERE email = ? AND password = ?', (email, hash))
usuario = cursor.fetchone()
```

En Django se usa el ORM (Object-Relational Mapper) — Python puro, sin SQL:
```python
# Django — ORM
usuario = Usuario.objects.get(email=email, password=hash)
```

Más ejemplos del ORM usados en el proyecto:

```python
# Buscar uno (lanza excepción si no existe)
casa = PadronCasas.objects.get(numero_casa='Casa 25')

# Buscar uno (devuelve None si no existe)
sesion = Sesion.objects.filter(token=token, activa=True).first()

# Verificar si existe
if Usuario.objects.filter(email=email).exists():
    ...

# Crear un registro
usuario = Usuario.objects.create(nombre_completo='Juan', casa=casa, edad=25, ...)

# Actualizar un campo
casa.ocupada = True
casa.save()

# Actualizar múltiples registros a la vez
Sesion.objects.filter(usuario=usuario, activa=True).update(activa=False)

# Consulta con JOIN automático
token_obj = TokenRecuperacion.objects.select_related('usuario').get(
    token=token,
    usado=False,
    fecha_expiracion__gt=timezone.now()   # __gt = "greater than" = mayor que
)
# Acceder al usuario relacionado sin consulta extra:
nombre = token_obj.usuario.nombre_completo
```

---

## 6. Los 6 Endpoints de la API

Todos los endpoints reciben y devuelven **XML**. El frontend envía una petición con datos en XML y recibe una respuesta en XML.

---

### Endpoint 1: Registro de Usuario
**`POST /auth/registro`**

**Petición:**
```xml
<registroRequest>
    <nombre_completo>Juan Pérez</nombre_completo>
    <numero_casa>Casa 25</numero_casa>
    <edad>25</edad>
    <email>juan@email.com</email>
    <password>micontrasena123</password>
</registroRequest>
```

**Validaciones que hace el servidor:**
1. La casa debe existir en el padrón (1-50)
2. La casa no debe estar ocupada ya
3. El residente debe tener 18 años o más
4. El email no debe estar registrado ya

**Respuesta exitosa (HTTP 201):**
```xml
<registroResponse>
    <estado>OK</estado>
    <mensaje>Usuario registrado exitosamente</mensaje>
    <userId>4</userId>
</registroResponse>
```

**Respuesta con error (HTTP 400):**
```xml
<registroResponse>
    <estado>ERROR</estado>
    <mensaje>La casa "Casa 25" ya tiene un usuario registrado</mensaje>
</registroResponse>
```

---

### Endpoint 2: Login
**`POST /auth/login`**

**Petición:**
```xml
<loginRequest>
    <email>juan@email.com</email>
    <password>micontrasena123</password>
</loginRequest>
```

**Lo que hace el servidor:**
1. Convierte el email a minúsculas
2. Encripta la contraseña con SHA-256
3. Busca un usuario con ese email y esa contraseña encriptada
4. Si existe y está activo, crea un token de sesión (válido 24 horas)
5. Guarda la sesión en la tabla `sesiones`

**Respuesta exitosa (HTTP 200):**
```xml
<loginResponse>
    <estado>OK</estado>
    <mensaje>Autenticación exitosa</mensaje>
    <token>jgJMpC2M3ZBIEhByHjp2h2zElVq4...</token>
    <userId>4</userId>
    <nombre>Juan Pérez</nombre>
    <numeroCasa>Casa 25</numeroCasa>
</loginResponse>
```
El frontend guarda el `token`, `userId`, `nombre` y `numeroCasa` en `localStorage` del navegador.

---

### Endpoint 3: Logout
**`POST /auth/logout`**

**Petición:**
```xml
<logoutRequest>
    <token>jgJMpC2M3ZBIEhByHjp2h2zElVq4...</token>
</logoutRequest>
```

**Lo que hace:** Marca la sesión como `activa=False` en la base de datos.

**Respuesta:**
```xml
<logoutResponse>
    <estado>OK</estado>
    <mensaje>Sesión cerrada exitosamente</mensaje>
</logoutResponse>
```

---

### Endpoint 4: Solicitar Recuperación de Contraseña
**`POST /auth/solicitar-recuperacion`**

**Petición:**
```xml
<recuperacionRequest>
    <email>juan@email.com</email>
</recuperacionRequest>
```

**Lo que hace el servidor:**
1. Busca al usuario con ese email
2. Si existe, genera un token único y seguro (`secrets.token_urlsafe(32)`)
3. Lo guarda en `tokens_recuperacion` con expiración de 1 hora
4. Envía un correo HTML al usuario con un link que contiene el token
5. **Por seguridad**, siempre responde igual sin importar si el email existe o no

**Respuesta (siempre HTTP 200, para no revelar si el email existe):**
```xml
<recuperacionResponse>
    <estado>OK</estado>
    <mensaje>Correo de recuperación enviado exitosamente</mensaje>
</recuperacionResponse>
```

---

### Endpoint 5: Validar Token de Recuperación
**`POST /auth/validar-token-recuperacion`**

Este endpoint se llama automáticamente cuando el usuario abre el link del correo. Verifica que el token sea válido antes de mostrar el formulario de nueva contraseña.

**Petición:**
```xml
<validarTokenRequest>
    <token>el-token-del-link-del-correo</token>
</validarTokenRequest>
```

**Lo que verifica el servidor:**
- El token existe en la base de datos
- El token no ha sido usado (`usado=False`)
- El token no ha expirado (`fecha_expiracion > ahora`)

**Respuesta válida:**
```xml
<validarTokenResponse>
    <estado>OK</estado>
    <valido>true</valido>
    <nombre>Juan Pérez</nombre>
</validarTokenResponse>
```

**Respuesta inválida:**
```xml
<validarTokenResponse>
    <estado>ERROR</estado>
    <valido>false</valido>
    <mensaje>Token inválido o expirado</mensaje>
</validarTokenResponse>
```

---

### Endpoint 6: Cambiar Contraseña
**`POST /auth/cambiar-password`**

**Petición:**
```xml
<cambiarPasswordRequest>
    <token>el-token-del-link-del-correo</token>
    <nueva_password>miNuevaContrasena456</nueva_password>
</cambiarPasswordRequest>
```

**Lo que hace el servidor:**
1. Valida el token (no expirado, no usado)
2. Encripta la nueva contraseña con SHA-256
3. Actualiza la contraseña del usuario
4. Marca el token como `usado=True` (no se puede reusar)
5. Cierra **todas** las sesiones activas del usuario (seguridad)

**Respuesta:**
```xml
<cambiarPasswordResponse>
    <estado>OK</estado>
    <mensaje>Contraseña cambiada exitosamente</mensaje>
</cambiarPasswordResponse>
```

---

## 7. El Servicio de Email

El archivo `email_service.py` maneja el envío de correos usando **Gmail SMTP**.

```
Usuario solicita recuperación
          ↓
Django genera token único
          ↓
Django llama a email_service.enviar_email()
          ↓
    ¿modo_produccion?
    /             \
  Sí              No
   ↓               ↓
Envía correo    Imprime link
real por SMTP   en la consola
via Gmail
```

**Configuración SMTP en `settings.py`:**
```python
EMAIL_HOST          = 'smtp.gmail.com'
EMAIL_PORT          = 587          # Puerto TLS de Gmail
EMAIL_USE_TLS       = True         # Conexión cifrada
EMAIL_HOST_USER     = 'tu@gmail.com'
EMAIL_HOST_PASSWORD = 'xxxx xxxx xxxx xxxx'  # Contraseña de aplicación (no la normal)
```

**Nota importante:** Se usa una **contraseña de aplicación** de Google (no la contraseña normal de Gmail). Se genera en: Cuenta de Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones.

---

## 8. El CORS — Por qué es Necesario

El frontend corre en `localhost:5500` y la API en `localhost:5000`. Son **orígenes distintos** (distinto puerto). Por seguridad, el navegador bloquea peticiones entre orígenes diferentes, a menos que el servidor lo permita explícitamente.

En Flask se usaba `flask-cors`:
```python
CORS(app)  # Permite todo
```

En Django se usa `django-cors-headers`. Se configura en `settings.py`:
```python
INSTALLED_APPS = [
    'corsheaders',   # Registrar la librería
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Debe ir PRIMERO
    'django.middleware.common.CommonMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True  # Equivalente a CORS(app) de Flask
```

Cuando el navegador hace una petición a la API, el middleware de CORS agrega automáticamente el encabezado:
```
Access-Control-Allow-Origin: *
```
Esto le dice al navegador: "está bien, cualquier origen puede acceder".

---

## 9. Seguridad del Sistema

### Contraseñas
Las contraseñas nunca se guardan en texto plano. Se encriptan con **SHA-256**:
```python
def crear_hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()
```
Ejemplo: `"admin123"` → `"240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a"`

### Tokens de sesión
Se generan con `secrets.token_urlsafe(32)` — función criptográficamente segura de Python. Produce una cadena aleatoria de 43 caracteres como: `jgJMpC2M3ZBIEhByHjp2h2zElVq4ZEiIvinPHm2AXkA`

### Tokens de recuperación
- Duran solo **1 hora**
- Son de **un solo uso** (`usado=True` después de usarse)
- Al cambiar contraseña, se **cierran todas las sesiones** activas

### CSRF
Las vistas usan `@csrf_exempt` porque la API recibe peticiones del frontend JavaScript, no de formularios HTML tradicionales. En una API REST esto es el enfoque estándar.

---

## 10. Cómo Iniciar el Sistema

### Primera vez (configurar todo)
```bash
cd backend_django

# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Crear las tablas en la base de datos
python manage.py migrate

# 3. Poblar con 50 casas y usuarios de prueba
python manage.py seed_db
```

### Uso diario
```bash
cd backend_django
python manage.py runserver 0.0.0.0:5000
```

Luego abrir el frontend con **Live Server** en VS Code.

### Usuarios de prueba
| Email                    | Contraseña | Casa    |
|--------------------------|------------|---------|
| admin@centinela.com      | admin123   | Casa 1  |
| maria@email.com          | maria123   | Casa 5  |
| carlos@email.com         | carlos123  | Casa 10 |

---

## 11. Flujo Completo de Recuperación de Contraseña

```
[1] Usuario en el frontend escribe su email
          ↓
[2] JS envía POST /auth/solicitar-recuperacion con XML
          ↓
[3] Django busca el usuario en la DB
          ↓
[4] Django genera token: secrets.token_urlsafe(32)
          ↓
[5] Django guarda token en tokens_recuperacion (expira en 1h)
          ↓
[6] Django envía correo HTML via Gmail SMTP con link:
    http://localhost:5500/frontend/cambiar-password.html?token=XXX
          ↓
[7] Usuario recibe el correo y hace click en el link
          ↓
[8] El navegador abre cambiar-password.html
          ↓
[9] JS lee el token de la URL (?token=XXX)
          ↓
[10] JS envía POST /auth/validar-token-recuperacion
          ↓
[11] Django verifica: ¿existe? ¿no expiró? ¿no fue usado?
          ↓
[12] Si es válido → habilita el botón "Restablecer contraseña"
          ↓
[13] Usuario escribe nueva contraseña (dos veces)
          ↓
[14] JS envía POST /auth/cambiar-password
          ↓
[15] Django actualiza contraseña (SHA-256), marca token como usado,
     cierra todas las sesiones activas del usuario
          ↓
[16] JS redirige automáticamente a login.html después de 3 segundos
```

---

## 12. Comparación Directa Flask vs Django

| Aspecto               | Flask (original)             | Django (actual)                    |
|----------------------|------------------------------|------------------------------------|
| Tamaño del proyecto  | 1 archivo (`app.py`)         | Estructura organizada en carpetas  |
| Base de datos        | `sqlite3` manual con cursores | ORM automático con modelos Python  |
| SQL necesario        | Sí, escrito a mano           | No, el ORM lo genera               |
| Rutas                | `@app.route()` en la función | `urls.py` separado                 |
| CORS                 | `flask-cors`                 | `django-cors-headers`              |
| Inicializar DB       | `python database.py`         | `python manage.py migrate`         |
| Poblar datos         | `python database.py`         | `python manage.py seed_db`         |
| Servidor             | `python app.py`              | `python manage.py runserver`       |
| Email                | Igual (SMTP Gmail)           | Igual (SMTP Gmail)                 |
| Formato de datos     | XML (igual)                  | XML (igual)                        |
| Puerto               | 5000                         | 5000                               |
