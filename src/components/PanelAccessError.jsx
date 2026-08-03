import Header from './Header'

export default function PanelAccessError({ panelName }) {
  return (
    <>
      <Header title={panelName} subtitle="Acceso institucional" />
      <main className="page-shell narrow-shell">
        <section className="card empty-state">
          <h2>Enlace no autorizado</h2>
          <p>Este panel solo puede abrirse desde el enlace directo entregado al personal autorizado.</p>
        </section>
      </main>
    </>
  )
}
