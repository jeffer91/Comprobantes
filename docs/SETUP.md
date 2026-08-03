# Configuración de Supabase y Cloudflare

## 1. Crear el proyecto de Supabase

1. Crea un proyecto nuevo en Supabase.
2. Abre **SQL Editor**.
3. Ejecuta el archivo `supabase/migrations/20260803160000_initial_schema.sql`.
4. Verifica que existan las tablas y el bucket privado `receipts`.
5. Copia la URL del proyecto y la clave privada del servidor.

La clave privada no debe colocarse en React, en GitHub ni en variables públicas de Vite.

## 2. Configurar secretos de Cloudflare

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_ACCESS_TOKEN
npx wrangler secret put COLLECTIONS_ACCESS_TOKEN
```

Usa tokens largos y aleatorios para los dos paneles:

```text
https://TU-DOMINIO/administracion?access=TOKEN_ADMIN
https://TU-DOMINIO/recaudaciones?access=TOKEN_RECAUDACIONES
```

El navegador guarda el token durante la sesión y lo elimina de la barra de direcciones.

## 3. Instalar y desplegar

```bash
npm install
npm run build
npm run deploy
```

## 4. Importar estudiantes

El panel acepta `.xlsx` o `.xls` con estos encabezados:

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

Las cédulas y celulares que Excel convierta en números se completan automáticamente con el cero inicial cuando corresponde.

## 5. Seguridad recomendada

- No publiques el Excel real de estudiantes en GitHub.
- No compartas los enlaces internos fuera del personal autorizado.
- Cambia los tokens si un enlace se filtra.
- Configura Rate Limiting de Cloudflare para `/api/student/lookup` y `/api/student/submit`.
