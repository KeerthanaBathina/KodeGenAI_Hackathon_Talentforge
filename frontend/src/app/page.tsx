import Link from 'next/link';
import { Manrope, Plus_Jakarta_Sans } from 'next/font/google';
import styles from './page.module.css';

const headingFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const features = [
  {
    icon: 'AI',
    title: 'AI Resume Screening',
    description:
      'Automated parsing and confidence scoring surfaces top candidates in under 3 minutes without manual filtering.',
  },
  {
    icon: 'SCH',
    title: 'Smart Interview Scheduling',
    description:
      'Conflict-aware planning with panel coordination and candidate notifications keeps interviews moving.',
  },
  {
    icon: 'SC',
    title: 'Structured Scorecards',
    description:
      'Rubric-driven feedback creates consistent, bias-reduced interview evaluations across every stage.',
  },
];

export default function HomePage() {
  return (
    <main className={`${styles.page} ${bodyFont.className}`}>

      <nav className={styles.nav} aria-label="Public navigation">
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            TF
          </div>
          <span className={headingFont.className}>TalentForge</span>
        </div>
        <div className={styles.navActions}>
          <Link className={styles.buttonSecondary} href="/login">
            Login
          </Link>
          <Link className={styles.buttonPrimary} href="/register">
            Apply as Candidate
          </Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroGlowOne} aria-hidden="true" />
        <div className={styles.heroGlowTwo} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} aria-hidden="true" />
            AI-Powered Hiring Platform
          </div>
          <h1 className={`${styles.heroTitle} ${headingFont.className}`}>
            Hire Smarter,
            <br />
            <span>Decide Faster</span>
          </h1>
          <p className={styles.heroSubtitle}>
            TalentForge uses AI screening to surface the best candidates instantly, giving recruiters speed and signal
            without sacrificing fairness.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.heroPrimary} href="/register">
              Apply as Candidate
            </Link>
            <Link className={styles.heroSecondary} href="/login">
              Recruiter Login
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="capabilities-title">
        <p className={styles.sectionLabel}>Platform Capabilities</p>
        <h2 id="capabilities-title" className={`${styles.sectionTitle} ${headingFont.className}`}>
          Everything the hiring team needs
        </h2>
        <p className={styles.sectionSubtitle}>From first application to final offer, all in one place.</p>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article className={styles.featureCard} key={feature.title}>
              <div className={styles.featureIcon} aria-hidden="true">
                {feature.icon}
              </div>
              <h3 className={`${styles.featureTitle} ${headingFont.className}`}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <h2 id="cta-title" className={`${styles.ctaTitle} ${headingFont.className}`}>
          Ready to transform your hiring?
        </h2>
        <p className={styles.ctaSubtitle}>Join teams already using TalentForge.</p>
        <div className={styles.ctaActions}>
          <Link className={styles.ctaWhite} href="/register">
            Get started for free
          </Link>
          <Link className={styles.ctaOutline} href="/login">
            Schedule a demo
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            TF
          </div>
          <span className={headingFont.className}>TalentForge</span>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/login">Privacy Policy</Link>
          <Link href="/login">Terms of Service</Link>
          <Link href="/login">Support</Link>
          <Link href="/login">Contact</Link>
        </div>
        <p className={styles.footerCopy}>2026 TalentForge. All rights reserved.</p>
      </footer>
    </main>
  );
}
