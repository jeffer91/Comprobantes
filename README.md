# ITSQMET · Comprobantes de incorporación

Aplicación web para registrar, revisar y administrar comprobantes del pago de incorporación.

## Implementaciones

### Estudiante (`/`)

- Consulta mediante cédula de 10 dígitos.
- Solo permite el envío a estudiantes importados previamente desde Excel.
- Muestra nombres, carrera y sede antes del primer envío.
- Registra banco, fecha del pago, referencia e imagen o PDF.
- Permite un solo envío, excepto cuando recaudaciones solicita una corrección.
- Estados: `Sin enviar`, `Pendiente`, `Corrección solicitada` y `Aprobado`.
- Soporte por WhatsApp: `0984082332`.

### Recaudaciones (`/recaudaciones?access=...`)

- Bandeja de comprobantes.
- Búsqueda y filtros.
- Vista del archivo mediante enlace privado temporal.
- Aprobación de comprobantes pendientes.
- Solicitud de corrección con motivo.
- Bloqueo de acciones incompatibles con el estado actual.

### Administración (`/administracion?access=...`)

- Resumen de estudiantes y estados.
- Importación y actualización desde archivos `.xlsx`.
- Vista previa de estudiantes nuevos, existentes y ausentes.
- Opción para desactivar estudiantes que ya no constan en una nueva lista.
- Consulta de los comprobantes enviados.
- Exportación del reporte completo a Excel.

## Tecnología

- React y Vite.
- Cloudflare Worker con Static Assets.
- Supabase PostgreSQL y Storage privado.
- Las claves privadas permanecen en secretos de Cloudflare.
- RLS habilitado y sin acceso directo para `anon` o `authenticated`.
- Dependencias de producción fijadas a versiones exactas.

## Requisitos

- Node.js `22.12.0` o superior.
- Una cuenta de Cloudflare.
- Un proyecto de Supabase.

## Inicio rápido

```bash
npm install
cp .env.example .dev.vars
npm run check
npm run dev
```

Para la configuración completa consulta [`docs/SETUP.md`](docs/SETUP.md).

## Archivos admitidos

- Comprobantes: JPG, JPEG, PNG o PDF.
- Límite técnico por comprobante: 20 MB.
- Lista de estudiantes: Excel `.xlsx` de hasta 10 MB y 5000 filas.

## Seguridad

- El archivo real de estudiantes no se incluye en este repositorio público.
- La clave `SUPABASE_SERVICE_ROLE_KEY` nunca debe colocarse en React ni publicarse en GitHub.
- Los paneles internos se abren con enlaces directos que contienen tokens secretos.
- Los comprobantes permanecen en un bucket privado y se visualizan mediante enlaces firmados temporales.
- Antes de producción se recomienda configurar Rate Limiting de Cloudflare en las rutas públicas de consulta y envío.
