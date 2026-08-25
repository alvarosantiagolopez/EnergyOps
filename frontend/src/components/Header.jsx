import { NavLink } from 'react-router-dom';

const CUSTOMER_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/upload', label: 'Upload' },
  { to: '/history', label: 'History' },
];

const INTERNAL_NAV_ITEMS = [
  { to: '/priority-queue', label: 'Priority Queue' },
];

function Header() {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <img src="/icon.png" alt="EnergyOps Logo" className="app-header__logo" />
        <span className="app-header__title">EnergyOps</span>
      </div>
      <nav className="app-nav">
        <div className="app-nav__group">
          <span className="app-nav__group-label">Customer View</span>
          <div className="app-tabs">
            {CUSTOMER_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `app-tab ${isActive ? 'app-tab--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="app-nav__divider" aria-hidden="true" />
        <div className="app-nav__group">
          <span className="app-nav__group-label">Internal Ops</span>
          <div className="app-tabs">
            {INTERNAL_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `app-tab app-tab--internal ${isActive ? 'app-tab--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Header;
