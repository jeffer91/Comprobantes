export default function Header({ title = 'Comprobantes de incorporación', subtitle }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <img
  src="/assets/logo-itsqmet.png"
  alt="Logo institucional ITSQMET"
  className="brand-logo"
/>
        <div className="header-copy">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
    </header>
  )
}
