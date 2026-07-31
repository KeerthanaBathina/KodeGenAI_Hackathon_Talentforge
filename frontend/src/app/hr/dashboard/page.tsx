'use client';

import Link from 'next/link';
import styles from './page.module.css';

const criticalAlerts = [
  {
    id: 'alert-1',
    icon: 'AL',
    title: 'Rahul Kumar . SLA breached 6 hours ago',
    detail: 'Senior Frontend Engineer . Pending HR Review',
    actionLabel: 'Review now',
    href: '/hr/manual-review',
    tone: 'danger' as const,
  },
  {
    id: 'alert-2',
    icon: 'AL',
    title: '4 more candidates . SLA breached',
    detail: 'Multiple requisitions . Pending HR Review',
    actionLabel: 'View all',
    href: '/hr/manual-review',
    tone: 'danger' as const,
  },
  {
    id: 'alert-3',
    icon: 'IN',
    title: 'AI Screening degraded',
    detail: 'Fallback mode active . Resume screening queued for batch processing',
    actionLabel: 'View health',
    href: '/admin/health',
    tone: 'warning' as const,
  },
];

const recentActivity = [
  {
    id: 'act-1',
    initials: 'PV',
    text: 'Priya Verma was shortlisted for Data Analyst by HR Reviewer Ananya.',
    time: '2 min ago',
  },
  {
    id: 'act-2',
    initials: 'SM',
    text: 'Sanjay Mehta completed Technical Interview for DevOps Engineer. Scorecard submitted.',
    time: '25 min ago',
  },
  {
    id: 'act-3',
    initials: 'JD',
    text: 'Jane Doe accepted offer for Senior Frontend Engineer. Start date: Aug 15, 2026.',
    time: '1 hour ago',
  },
  {
    id: 'act-4',
    initials: 'AK',
    text: 'Arjun Kumar was rejected at HR Review stage for Product Manager role.',
    time: '2 hours ago',
  },
];

export default function HrDashboardPage() {
  return (
    <main className={styles.page}>

      <div className={styles.alertBanner} role="status" aria-live="polite">
        <span className={styles.alertIcon}>!</span>
        <p>
          <strong>5 candidates have breached review SLA.</strong> Immediate action required.
        </p>
        <Link href="/hr/manual-review" className={styles.bannerButton}>
          View overdue queue
        </Link>
      </div>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBox}>
            <div className={styles.brandMark}>TF</div>
            <span className={styles.brandText}>TalentForge</span>
          </div>

          <nav className={styles.navList} aria-label="HR navigation">
            <p className={styles.navLabel}>Main</p>
            <Link className={`${styles.navItem} ${styles.navItemActive}`} href="/hr/dashboard">
              Dashboard
            </Link>
            <Link className={styles.navItem} href="/hr/manual-review">
              Review Queue
              <span className={styles.navBadge}>24</span>
            </Link>
            <Link className={styles.navItem} href="/requisitions/bulk-import">
              Requisitions
            </Link>
            <Link className={styles.navItem} href="/hr/manual-review">
              Interviews
            </Link>
            <Link className={styles.navItem} href="/analytics/pipeline">
              Analytics
            </Link>
          </nav>
        </aside>

        <section className={styles.contentArea}>
          <header className={styles.headerBar}>
            <h1>HR Dashboard</h1>
            <div className={styles.headerRight}>
              <button className={styles.notificationButton} type="button" aria-label="Notifications">
                N
              </button>
              <div className={styles.avatar}>HR</div>
            </div>
          </header>

          <div className={styles.contentScroll}>
            <div className={styles.metricsGrid}>
              <Link className={`${styles.metricCard} ${styles.metricDanger}`} href="/hr/manual-review">
                <p className={styles.metricNumber}>24</p>
                <p className={styles.metricLabel}>Pending Reviews</p>
                <p className={styles.metricSub}>5 SLA breached</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>5</p>
                <p className={styles.metricLabel}>SLA Breaches</p>
                <p className={styles.metricSub}>Overdue candidates</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>12</p>
                <p className={styles.metricLabel}>Active Interviews</p>
                <p className={styles.metricSub}>Scheduled this week</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>3</p>
                <p className={styles.metricLabel}>Offers Pending Response</p>
                <p className={styles.metricSub}>Awaiting candidate reply</p>
              </Link>
            </div>

            <section className={styles.alertsSection} aria-labelledby="critical-alerts-title">
              <h2 id="critical-alerts-title">Critical Alerts</h2>
              <div className={styles.alertList}>
                {criticalAlerts.map((alert) => (
                  <article
                    className={`${styles.alertCard} ${alert.tone === 'danger' ? styles.alertCardDanger : styles.alertCardWarning}`}
                    key={alert.id}
                  >
                    <span className={styles.alertPill}>{alert.icon}</span>
                    <div className={styles.alertText}>
                      <strong>{alert.title}</strong>
                      <span>{alert.detail}</span>
                    </div>
                    <Link className={styles.alertAction} href={alert.href}>
                      {alert.actionLabel}
                    </Link>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.activitySection} aria-labelledby="recent-activity-title">
              <h2 id="recent-activity-title">Recent Activity</h2>
              <div className={styles.activityFeed}>
                {recentActivity.map((item) => (
                  <article className={styles.activityItem} key={item.id}>
                    <span className={styles.activityAvatar}>{item.initials}</span>
                    <p className={styles.activityText}>{item.text}</p>
                    <span className={styles.activityTime}>{item.time}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
