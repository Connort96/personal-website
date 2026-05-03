import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" id="site-footer">
      <div className="footer__inner container">
        <div className="footer__top">
          <div className="footer__brand">
            <span className="footer__logo-dot"></span>
            <span className="footer__logo-text">collected</span>
          </div>
          <p className="footer__tagline">
            Words, sounds, and stories — gathered in one place.
          </p>
        </div>
        <div className="footer__divider"></div>
        <div className="footer__bottom">
          <p className="footer__copyright">
            &copy; {year} collected. Crafted with care.
          </p>
          <div className="footer__links">
            <a href="#" className="footer__link" id="footer-rss">RSS</a>
            <a href="#" className="footer__link" id="footer-github">GitHub</a>
            <a href="#" className="footer__link" id="footer-twitter">Twitter</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
