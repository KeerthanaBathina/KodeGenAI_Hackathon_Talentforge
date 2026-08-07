'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';
import styles from './page.module.css';

type AlertTone = 'danger' | 'warning';

interface DashboardAlert {
  id: string;
  icon: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  tone: AlertTone;
}

interface ActivityItem {
  id: string;
  initials: string;
  text: string;
  time: string;
}

interface QueueItem {
  id: string;
  candidateName: string;
  requisitionTitle: string;
  slaSeverity: 'normal' | 'amber' | 'red';
  slaRemainingSeconds: number;
}

interface QueueResponse {
  items?: QueueItem[];
  total?: number;
}

interface QueueStatsResponse {
  totalCount?: number;
}

interface RequisitionsResponse {
  data?: Array<{ id: string }>;
}

interface NotificationPayload {
  title?: string;
  message?: string;
}

interface NotificationItem {
  id: string;
  eventType: string;
  createdAt: string;
  payload?: NotificationPayload;
}

interface NotificationsResponse {
  notifications?: NotificationItem[];
  unreadCount?: number;
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'NA';
  }

  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || 'NA';
}

function formatTimeAgo(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return 'just now';
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
}

function formatSlaBreachDuration(slaRemainingSeconds: number): string {
  const breachedSeconds = Math.max(0, -slaRemainingSeconds);
  const breachedHours = Math.max(1, Math.floor(breachedSeconds / 3600));
  return `${breachedHours} hour${breachedHours === 1 ? '' : 's'} ago`;
}

export default function HrDashboardPage() {
  const [pendingReviews, setPendingReviews] = useState(0);
  const [slaBreaches, setSlaBreaches] = useState(0);
  const [openRequisitions, setOpenRequisitions] = useState(0);
  const [activeInterviews, setActiveInterviews] = useState(0);
  const [offersPendingResponse, setOffersPendingResponse] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [criticalAlerts, setCriticalAlerts] = useState<DashboardAlert[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const [queueResponse, statsResponse, requisitionsResponse, notificationsResponse] = await Promise.all([
          fetch(buildApiUrl('/api/manual-review-queue?status=pending_review&page=1&limit=200'), {
            credentials: 'include',
          }),
          fetch(buildApiUrl('/api/manual-review-queue/stats'), {
            credentials: 'include',
          }),
          fetch(buildApiUrl('/api/requisitions?page=1&pageSize=100&status=open'), {
            credentials: 'include',
          }),
          fetch(buildApiUrl('/api/notifications'), {
            credentials: 'include',
          }),
        ]);

        const queuePayload: QueueResponse = queueResponse.ok ? await queueResponse.json() : {};
        const statsPayload: QueueStatsResponse = statsResponse.ok ? await statsResponse.json() : {};
        const requisitionsPayload: RequisitionsResponse = requisitionsResponse.ok
          ? await requisitionsResponse.json()
          : {};
        const notificationsPayload: NotificationsResponse = notificationsResponse.ok
          ? await notificationsResponse.json()
          : {};

        if (!mounted) {
          return;
        }

        const queueItems = Array.isArray(queuePayload.items) ? queuePayload.items : [];
        const redSlaItems = queueItems.filter((item) => item.slaSeverity === 'red');
        const rankedUrgentItems = [...redSlaItems].sort(
          (left, right) => left.slaRemainingSeconds - right.slaRemainingSeconds
        );

        const generatedAlerts: DashboardAlert[] = rankedUrgentItems.slice(0, 2).map((item) => ({
          id: item.id,
          icon: 'AL',
          title: `${item.candidateName} . SLA breached ${formatSlaBreachDuration(item.slaRemainingSeconds)}`,
          detail: `${item.requisitionTitle} . Pending HR Review`,
          actionLabel: 'Review now',
          href: '/hr/manual-review',
          tone: 'danger',
        }));

        if (rankedUrgentItems.length > 2) {
          generatedAlerts.push({
            id: 'more-urgent',
            icon: 'AL',
            title: `${rankedUrgentItems.length - 2} more candidates . SLA breached`,
            detail: 'Multiple requisitions . Pending HR Review',
            actionLabel: 'View all',
            href: '/hr/manual-review',
            tone: 'danger',
          });
        }

        if (generatedAlerts.length === 0) {
          generatedAlerts.push({
            id: 'queue-healthy',
            icon: 'IN',
            title: 'Review queue healthy',
            detail: 'No SLA breaches currently detected',
            actionLabel: 'Open queue',
            href: '/hr/manual-review',
            tone: 'warning',
          });
        }

        const notifications = Array.isArray(notificationsPayload.notifications)
          ? notificationsPayload.notifications
          : [];

        const generatedActivity: ActivityItem[] = notifications.slice(0, 4).map((notification) => {
          const title = notification.payload?.title?.trim() || 'Notification update';
          const message = notification.payload?.message?.trim() || notification.eventType;

          return {
            id: notification.id,
            initials: getInitials(title),
            text: `${title}. ${message}`,
            time: formatTimeAgo(notification.createdAt),
          };
        });

        const interviewsInFlight = notifications.filter(
          (notification) => notification.eventType === 'interview_scheduled'
        ).length;

        const offersInFlight = notifications.filter(
          (notification) => notification.eventType === 'offer_extended'
        ).length;

        setPendingReviews(statsPayload.totalCount ?? queuePayload.total ?? 0);
        setSlaBreaches(redSlaItems.length);
        setOpenRequisitions(Array.isArray(requisitionsPayload.data) ? requisitionsPayload.data.length : 0);
        setActiveInterviews(interviewsInFlight);
        setOffersPendingResponse(offersInFlight);
        setUnreadNotifications(notificationsPayload.unreadCount ?? 0);
        setCriticalAlerts(generatedAlerts);
        setRecentActivity(generatedActivity);
      } catch (error) {
        console.error('Failed to load HR dashboard data', error);

        if (!mounted) {
          return;
        }

        setCriticalAlerts([
          {
            id: 'fallback-alert',
            icon: 'IN',
            title: 'Dashboard data unavailable',
            detail: 'Please refresh to load latest review queue insights',
            actionLabel: 'Open queue',
            href: '/hr/manual-review',
            tone: 'warning',
          },
        ]);
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const bannerText = useMemo(() => {
    if (slaBreaches > 0) {
      return `${slaBreaches} candidate${slaBreaches === 1 ? ' has' : 's have'} breached review SLA.`;
    }

    if (pendingReviews > 0) {
      return `${pendingReviews} candidate${pendingReviews === 1 ? ' is' : 's are'} pending HR review.`;
    }

    return 'Manual review queue is currently clear.';
  }, [pendingReviews, slaBreaches]);

  return (
    <main className={styles.page}>

      <div className={styles.alertBanner} role="status" aria-live="polite">
        <span className={styles.alertIcon}>!</span>
        <p>
          <strong>{bannerText}</strong> Immediate action required.
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
              <span className={styles.navBadge}>{pendingReviews}</span>
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
              <button
                className={styles.notificationButton}
                type="button"
                aria-label={`Notifications ${unreadNotifications > 0 ? `(${unreadNotifications} unread)` : ''}`}
              >
                {unreadNotifications > 0 ? unreadNotifications : 'N'}
              </button>
              <div className={styles.avatar}>HR</div>
            </div>
          </header>

          <div className={styles.contentScroll}>
            <div className={styles.metricsGrid}>
              <Link className={`${styles.metricCard} ${styles.metricDanger}`} href="/hr/manual-review">
                <p className={styles.metricNumber}>{pendingReviews}</p>
                <p className={styles.metricLabel}>Pending Reviews</p>
                <p className={styles.metricSub}>{slaBreaches} SLA breached</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>{slaBreaches}</p>
                <p className={styles.metricLabel}>SLA Breaches</p>
                <p className={styles.metricSub}>Overdue candidates</p>
              </Link>

              <Link className={styles.metricCard} href="/requisitions/bulk-import">
                <p className={styles.metricNumber}>{openRequisitions}</p>
                <p className={styles.metricLabel}>Open Requisitions</p>
                <p className={styles.metricSub}>Available for applications</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>{activeInterviews}</p>
                <p className={styles.metricLabel}>Active Interviews</p>
                <p className={styles.metricSub}>Based on latest interview notifications</p>
              </Link>

              <Link className={styles.metricCard} href="/hr/manual-review">
                <p className={styles.metricNumber}>{offersPendingResponse}</p>
                <p className={styles.metricLabel}>Offers Pending Response</p>
                <p className={styles.metricSub}>Based on latest offer notifications</p>
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
                {recentActivity.length > 0 ? (
                  recentActivity.map((item) => (
                    <article className={styles.activityItem} key={item.id}>
                      <span className={styles.activityAvatar}>{item.initials}</span>
                      <p className={styles.activityText}>{item.text}</p>
                      <span className={styles.activityTime}>{item.time}</span>
                    </article>
                  ))
                ) : (
                  <article className={styles.activityItem}>
                    <span className={styles.activityAvatar}>NA</span>
                    <p className={styles.activityText}>No recent activity available.</p>
                    <span className={styles.activityTime}>just now</span>
                  </article>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
