import homeLogo from '../assets/logo-home.png'
import practitionerLogo from '../assets/logo-practitioner.png'
import parentLogo from '../assets/logo-parent.png'
import './BrandLogo.css'

type BrandLogoProps = {
  variant?: 'home' | 'practitioner' | 'audience'
}

// Audience pages already expose their current palette on html[data-kt-theme].
// Follow that same palette so the logo changes with the page, without a second state.
export default function BrandLogo({ variant = 'home' }: BrandLogoProps) {
  return <span className={`brand-logo brand-logo--${variant}`} aria-hidden="true">
    <img className="brand-logo-home" src={homeLogo} alt="" />
    <img className="brand-logo-practitioner" src={practitionerLogo} alt="" />
    <img className="brand-logo-parent" src={parentLogo} alt="" />
  </span>
}
