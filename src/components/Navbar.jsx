import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar" id="main-nav">
      <div className="navbar__inner container">
        <NavLink to="/" className="navbar__logo" id="nav-logo">
          <span className="navbar__logo-dot"></span>
          <span className="navbar__logo-text">collected</span>
        </NavLink>
        <ul className="navbar__links">
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-home"
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/blog"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-blog"
            >
              Blog
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/music"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-music"
            >
              Music
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/books"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-books"
            >
              Books
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
