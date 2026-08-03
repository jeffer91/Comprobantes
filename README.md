# ITSQMET · Comprobantes de incorporación

Aplicación web para registrar, revisar y administrar comprobantes del pago de incorporación.

## Implementaciones

### Estudiante (`/`)

- Consulta mediante cédula.
- Solo permite el envío a estudiantes importados desde Excel.
- Muestra nombres, carrera y sede antes del primer envío.
- Registra banco, fecha, referencia e imagen o PDF.
- Permite un solo envío, excepto cuando recaudaciones solicita una corrección.
- Estados: `Sin enviar`, `Pendiente`, `Corrección solicitada` y `Aprobado`.
- Soporte por WhatsApp: `0984082332`.

### Recaudaciones (`/recaudaciones?access=...`)

- Bandeja de comprobantes.
- Búsqueda y filtros.
- Vista del archivo mediante enlace privado temporal.
- Aprobación con un clic.
- Solicitud de corrección con motivo.

### Administración (`/administracion?access=...`)

- Resumen de estudiantes y estados.
- Importación y actualización desde Excel.
- Vista previa de nuevos, existentes y ausentes.
- Opción para desactivar estudiantes que ya no constan.
- Exportación del reporte completo a Excel.

## Tecnología

- React + Vite.
- Cloudflare Worker con Static Assets.
- Supabase PostgreSQL y Storage privado.
- Las claves privadas permanecen en secretos de Cloudflare.
- RLS habilitado sin acceso directo para `anon` o `authenticated`.

## Inicio rápido

```bash
npm install
cp .env.example .dev.vars
npm run dev
```

Para la configuración completa consulta [`docs/SETUP.md`](docs/SETUP.md).

## Datos personales

El archivo real de estudiantes no se incluye en este repositorio. Debe cargarse desde el panel de administración después de configurar Supabase y Cloudflare.
