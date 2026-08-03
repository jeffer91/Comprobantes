# Configuración de Supabase y Cloudflare

## 1. Requisitos locales

Instala Node.js `22.12.0` o superior y comprueba la versión:

```bash
node --version
npm --version
```

## 2. Crear el proyecto de Supabase

1. Crea un proyecto nuevo en Supabase.
2. Abre **SQL Editor**.
3. Ejecuta el archivo `supabase/migrations/20260803160000_initial_schema.sql`.
4. Verifica que existan las tablas:
   - `student_imports`
   - `students`
   - `payment_records`
   - `receipt_versions`
   - `audit_logs`
   - `app_settings`
5. Verifica que exista el bucket privado `receipts`.
6. Copia la URL del proyecto y la clave `service_role` o secret key para uso exclusivo del servidor.

La clave privada no debe colocarse en React, en GitHub ni en variables públicas de Vite.

## 3. Configurar secretos de Cloudflare

Desde el directorio del proyecto ejecuta:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_ACCESS_TOKEN
npx wrangler secret put COLLECTIONS_ACCESS_TOKEN
```

Usa tokens diferentes, largos y aleatorios para los dos paneles. Ejemplos de acceso:

```text
https://TU-DOMINIO/administracion?access=TOKEN_ADMIN
https://TU-DOMINIO/recaudaciones?access=TOKEN_RECAUDACIONES
```

El navegador guarda el token únicamente durante la sesión y lo elimina de la barra de direcciones. Cualquier persona que obtenga el enlace podrá usar el panel, por lo que no debe compartirse fuera del personal autorizado.

## 4. Instalar y verificar

```bash
npm install
npm run check
```

El comando `npm run check` compila la aplicación y permite detectar errores antes del despliegue.

Para desarrollo local, copia el archivo de ejemplo:

```bash
cp .env.example .dev.vars
npm run dev
```

Luego reemplaza los valores de `.dev.vars` por las credenciales reales. Este archivo está excluido de Git.

## 5. Desplegar en Cloudflare

```bash
npm run deploy
```

Después del despliegue prueba:

```text
https://TU-DOMINIO/api/health
```

La respuesta debe indicar `ok: true` y `configured: true`.

## 6. Importar estudiantes

El panel de administración acepta archivos `.xlsx` de hasta 10 MB y 5000 filas. Las columnas mínimas son cédula y nombres. El formato recomendado utiliza estos encabezados:

```text
numeroIdentificacion
Nombres
CodigoCarrera
NombreCarrera
HorarioComplexivo
CorreoPersonal
CorreoInstitucional
Celular
Sede
```

También se reconocen variantes comunes como `Cédula`, `Identificación`, `Nombre`, `Carrera`, `Teléfono` y `Campus`.

Durante la vista previa se mostrarán:

- filas válidas;
- estudiantes nuevos;
- estudiantes existentes que serán actualizados;
- estudiantes anteriores que no aparecen en el archivo nuevo;
- filas inválidas o cédulas duplicadas.

Las cédulas de nueve dígitos que Excel haya convertido a número recuperan automáticamente el cero inicial. Otros tamaños se rechazan para evitar registrar identificaciones incorrectas.

## 7. Archivos de comprobantes

Se admiten:

```text
JPG
JPEG
PNG
PDF
```

El límite técnico configurado es de 20 MB por archivo. El Worker comprueba tanto el tipo declarado como la firma interna del archivo antes de guardarlo.

## 8. Prueba funcional recomendada

1. Importa un Excel de prueba con uno o dos estudiantes.
2. Ingresa desde la página pública con una cédula importada.
3. Sube un comprobante válido.
4. Comprueba que el estudiante vea el estado `Pendiente`.
5. Abre el panel de recaudaciones y visualiza el archivo.
6. Solicita una corrección y comprueba que el estudiante pueda subir una nueva versión.
7. Aprueba el nuevo comprobante.
8. Descarga el reporte desde administración.
9. Verifica que el estudiante aprobado ya no pueda realizar otro envío.

## 9. Seguridad antes de producción

- No publiques el Excel real de estudiantes en GitHub.
- No compartas los enlaces internos fuera del personal autorizado.
- Cambia inmediatamente los tokens si un enlace se filtra.
- Mantén el repositorio sin claves, archivos `.env` ni `.dev.vars`.
- Configura Rate Limiting de Cloudflare para `/api/student/lookup` y `/api/student/submit`.
- Revisa periódicamente los registros del Worker y de Supabase.
- Mantén el bucket `receipts` como privado.
