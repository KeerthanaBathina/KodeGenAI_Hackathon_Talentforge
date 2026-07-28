# Email Delivery System

Comprehensive guide for operating, monitoring, and troubleshooting the email delivery system with Resend API integration and BullMQ queue management.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Retry Policy](#retry-policy)
3. [Monitoring](#monitoring)
4. [Troubleshooting](#troubleshooting)
5. [Runbooks](#runbooks)
6. [Alert Response](#alert-response)
7. [Performance Benchmarks](#performance-benchmarks)

---

## Architecture Overview

### Components

```
┌─────────────────┐
│   Application   │
│   (API Route)   │
└────────┬────────┘
         │ enqueueEmailDelivery()
         ▼
┌─────────────────┐
│  BullMQ Queue   │
│ email-delivery  │
└────────┬────────┘
         │ Job with retry config
         ▼
┌─────────────────┐
│ Email Worker    │
│  (Concurrency:  │
│       5)        │
└────────┬────────┘
         │
         ├──► 1. resolveTemplate (locale fallback)
         ├──► 2. renderTemplate (token replacement)
         ├──► 3. sendEmailViaResend (API call)
         └──► 4. updateCommunication (status tracking)
                │
                ├──► Success → status: 'sent'
                │
                └──► Failure
                     ├──► Transient → Retry (exponential backoff)
                     └──► Permanent → status: 'failed', DLQ alert
```

### Data Flow

1. **Job Enqueue**: Application calls `enqueueEmailDelivery()` with email data
2. **Queue Storage**: Job stored in Redis with unique ID (`email-<communicationId>`)
3. **Worker Processing**: One of 5 concurrent workers picks up the job
4. **Template Resolution**: Worker resolves template with 3-tier locale fallback
5. **Template Rendering**: Token replacement in subject and body
6. **Email Sending**: Resend API call with idempotency key header
7. **Status Update**: Communication record updated with status and message ID

### Database Schema

**Communication Model:**
```prisma
model Communication {
  id            String               @id @default(uuid())
  applicationId String
  templateId    String
  channel       CommunicationChannel // email, sms
  providerName  String               // "resend"
  messageId     String?              // Resend message ID
  status        CommunicationStatus  // queued, sent, delivered, bounced, failed
  retryCount    Int                  @default(0)
  sentAt        DateTime?
  deliveredAt   DateTime?
  createdAt     DateTime             @default(now())
}
```

---

## Retry Policy

### Exponential Backoff Schedule

| Attempt | Delay from Previous | Total Elapsed Time |
|---------|---------------------|-------------------|
| 1       | Immediate           | 0s                |
| 2       | 30 seconds          | 30s               |
| 3       | 2 minutes           | 2m 30s            |
| 4       | 8 minutes           | 10m 30s           |
| 5       | 32 minutes          | 42m 30s           |
| 6 (final) | 128 minutes       | 170m 30s (~2.8h)  |

**Total Attempts**: 5 (configured in queue)  
**Max Retry Duration**: ~2.8 hours from first attempt

### Error Classification

**Transient Errors** (Will Retry):
- HTTP 500 Internal Server Error
- HTTP 502 Bad Gateway
- HTTP 503 Service Unavailable
- HTTP 504 Gateway Timeout
- Network timeouts (ETIMEDOUT, ECONNABORTED)
- Unknown errors (default to retry for safety)

**Permanent Errors** (No Retry):
- HTTP 400 Bad Request
- HTTP 401 Unauthorized (invalid API key)
- HTTP 403 Forbidden
- HTTP 404 Not Found (template missing)
- HTTP 422 Unprocessable Entity (invalid email format)

### Dead Letter Queue (DLQ)

Jobs that exhaust all 5 retry attempts move to DLQ:
1. Communication status updated to `'failed'`
2. Webhook alert sent to ops team (if configured)
3. Job remains in failed queue (not removed)
4. Manual intervention required via admin endpoint

---

## Monitoring

### Key Metrics

#### Queue Metrics (via BullMQ)

```typescript
// Get queue statistics
const stats = await getQueueStats();
// Returns: { waiting, active, completed, failed }
```

**Normal Thresholds:**
- `waiting`: <100 (healthy backlog)
- `active`: ~5 (matches concurrency)
- `failed`: <10 (acceptable failure rate)

**Alert Thresholds:**
- `waiting`: >1000 (queue backup - investigate)
- `failed`: >50 (high failure rate - investigate)

#### Database Queries

**Failed emails in last 24 hours:**
```sql
SELECT COUNT(*) as failed_count
FROM communications
WHERE status = 'failed' 
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Average retry count:**
```sql
SELECT AVG(retry_count) as avg_retries
FROM communications
WHERE status = 'sent';
```
*Normal: 0-1 retries, Alert if >2*

**Failure rate by template:**
```sql
SELECT 
  t.name as template_name,
  t.type as template_type,
  COUNT(*) FILTER (WHERE c.status = 'failed') as failed,
  COUNT(*) as total,
  ROUND((COUNT(*) FILTER (WHERE c.status = 'failed')::numeric / COUNT(*)) * 100, 2) as failure_rate
FROM communications c
JOIN templates t ON c.template_id = t.id
WHERE c.created_at > NOW() - INTERVAL '7 days'
GROUP BY t.id, t.name, t.type
ORDER BY failure_rate DESC;
```

**Recent failures for investigation:**
```sql
SELECT 
  c.id,
  c.retry_count,
  c.created_at,
  t.name as template_name,
  t.type as template_type,
  cand.email as recipient_email
FROM communications c
JOIN templates t ON c.template_id = t.id
JOIN applications a ON c.application_id = a.id
JOIN candidates cand ON a.candidate_id = cand.id
WHERE c.status = 'failed'
ORDER BY c.created_at DESC
LIMIT 20;
```

### Resend Dashboard

Monitor delivery status via Resend dashboard:
- URL: https://resend.com/emails
- View sent emails, opens, clicks, bounces
- Search by message ID (stored in `Communication.messageId`)
- Track deliverability metrics

### Logs

**Key Log Events:**
- `Processing email delivery job` - Job started
- `Email sent successfully` - Resend API success
- `Transient email delivery failure - will retry` - Retry triggered
- `Permanent email delivery failure - not retrying` - Failed without retry
- `Email delivery job exhausted - moving to DLQ` - DLQ alert triggered

**Log Search Queries (CloudWatch/Splunk):**
```
# Find all DLQ alerts
"Email delivery job exhausted"

# Find high retry jobs
"Transient email delivery failure" retry_count:>3

# Find permanent failures
"Permanent email delivery failure"
```

---

## Troubleshooting

### Common Issues

#### 1. High Failure Rate

**Symptoms:**
- DLQ alerts increasing
- Failure rate >5%
- Multiple permanent errors

**Investigation:**
1. Check Resend dashboard for delivery status
2. Query recent failures by template:
   ```sql
   SELECT template_id, COUNT(*) as failures
   FROM communications
   WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY template_id
   ORDER BY failures DESC;
   ```
3. Check Resend API status: https://status.resend.com

**Common Causes:**
- **Invalid API key**: Check `RESEND_API_KEY` environment variable
- **Template errors**: Missing or invalid templates
- **Rate limiting**: Resend API rate limit exceeded
- **Invalid email addresses**: Malformed recipient emails

**Resolution:**
- Verify API key is valid and not revoked
- Check template exists for all types
- Review Resend rate limits (adjust concurrency if needed)
- Validate email addresses at application submission

#### 2. Queue Backup (High Waiting Count)

**Symptoms:**
- `waiting` count >1000
- Slow email delivery
- Jobs processing slowly

**Investigation:**
1. Check queue stats: `GET /api/admin/queue-stats`
2. Check worker logs for errors or slowdowns
3. Check Redis connection

**Common Causes:**
- Worker not running
- Redis connection issues
- Resend API slow response times
- High concurrency overwhelming API

**Resolution:**
- Restart worker: `npm run workers`
- Check Redis connectivity: `redis-cli ping`
- Check Resend API response times in logs
- Adjust worker concurrency if needed

#### 3. Duplicate Emails Sent

**Symptoms:**
- Users report receiving multiple copies of same email
- Same `communicationId` appears multiple times in logs

**Investigation:**
1. Query duplicate communications:
   ```sql
   SELECT application_id, template_id, COUNT(*) as count
   FROM communications
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY application_id, template_id
   HAVING COUNT(*) > 1;
   ```
2. Check idempotency key generation
3. Check Resend idempotency header

**Common Causes:**
- Job enqueued multiple times
- Idempotency key not unique
- Resend idempotency header missing

**Resolution:**
- Ensure `enqueueEmailDelivery` called once per event
- Verify idempotency key generation uses unique inputs
- Confirm `X-Idempotency-Key` header sent to Resend

#### 4. Slow Email Delivery

**Symptoms:**
- Emails taking >5 minutes to send
- `sentAt` timestamp far from `createdAt`

**Investigation:**
1. Check queue `waiting` count
2. Check worker concurrency
3. Check Resend API response times in logs

**Common Causes:**
- Queue backup (too many jobs)
- Low worker concurrency
- Resend API latency
- Template resolution slow (database query)

**Resolution:**
- Increase worker concurrency (currently 5)
- Optimize template queries (add database indexes)
- Check Resend API status

---

## Runbooks

### Manual Retry of Failed Email

**Use Case**: A legitimate email failed due to temporary issue and needs to be resent.

**Steps:**
1. **Identify Failed Communication:**
   ```bash
   curl -X GET https://api.talentforge.com/api/admin/email-dlq \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

2. **Review Failure Reason:**
   - Check `retryCount` (should be 5 for DLQ)
   - Check error logs for failure cause
   - Verify issue is resolved (e.g., API key fixed)

3. **Retry via Admin Endpoint:**
   ```bash
   curl -X POST https://api.talentforge.com/api/admin/email-dlq/{communicationId}/retry \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

4. **Verify Success:**
   - Check queue stats for new job
   - Monitor logs for success: `Email sent successfully`
   - Query communication status:
     ```sql
     SELECT id, status, message_id, retry_count, sent_at
     FROM communications
     WHERE id = '{communicationId}';
     ```

**Notes:**
- Manual retry resets `retryCount` to 0
- New idempotency key generated (`manual_retry:...`)
- Only communications with `status = 'failed'` can be retried

### Investigate DLQ Alert

**Use Case**: Webhook alert received for email delivery exhaustion.

**Alert Payload Example:**
```json
{
  "alertType": "email_delivery_dlq",
  "communicationId": "comm-123",
  "jobId": "job-456",
  "attempts": 5,
  "errorMessage": "Service unavailable",
  "timestamp": "2026-07-29T10:00:00.000Z",
  "metadata": {
    "to": "candidate@example.com",
    "templateType": "offer",
    "eventType": "offer_extended"
  }
}
```

**Investigation Steps:**

1. **Check Resend API Status:**
   - Visit https://status.resend.com
   - Look for ongoing incidents

2. **Review Error Logs:**
   ```bash
   # Search logs for communication ID
   grep "comm-123" /var/log/email-worker.log
   ```

3. **Check Failure Pattern:**
   - Is this a single failure or multiple?
   - Are failures limited to one template type?
   - Query recent failures:
     ```sql
     SELECT COUNT(*), template_id
     FROM communications
     WHERE status = 'failed' 
       AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY template_id;
     ```

4. **Determine Action:**
   - **Single failure**: Manual retry if issue resolved
   - **Multiple failures (same template)**: Check template validity
   - **Multiple failures (all templates)**: Check API key, Resend status
   - **Transient issue resolved**: Manual retry batch

5. **Take Action:**
   - Fix root cause (e.g., update API key, fix template)
   - Manual retry failed communications
   - Document incident in ops log

### Drain Queue for Maintenance

**Use Case**: Need to stop email delivery for system maintenance.

**Steps:**

1. **Stop Worker:**
   ```bash
   # Graceful shutdown (waits for active jobs)
   pkill -SIGTERM -f emailDeliveryWorker
   ```

2. **Verify Worker Stopped:**
   ```bash
   ps aux | grep emailDeliveryWorker
   # Should return no results
   ```

3. **Check Active Jobs:**
   ```typescript
   const stats = await getQueueStats();
   console.log(`Active jobs: ${stats.active}`);
   // Wait until active = 0
   ```

4. **Perform Maintenance:**
   - Update code, environment variables, etc.

5. **Restart Worker:**
   ```bash
   npm run workers
   ```

6. **Verify Queue Resuming:**
   ```bash
   # Check queue stats
   curl -X GET https://api.talentforge.com/api/admin/queue-stats
   ```

**Emergency Stop (Immediate):**
```bash
# Force kill (may lose active jobs)
pkill -SIGKILL -f emailDeliveryWorker
```
*Note: Use only in emergencies. Active jobs will fail and move to DLQ.*

### Bulk Retry from DLQ

**Use Case**: Multiple emails failed due to temporary outage, need to retry all.

**Steps:**

1. **List Failed Communications:**
   ```sql
   SELECT id, template_id, created_at
   FROM communications
   WHERE status = 'failed'
     AND created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```

2. **Create Bulk Retry Script:**
   ```bash
   #!/bin/bash
   # bulk-retry-dlq.sh
   
   ADMIN_TOKEN="your-admin-token"
   API_URL="https://api.talentforge.com"
   
   # Get failed communication IDs
   FAILED_IDS=$(psql -t -c "SELECT id FROM communications WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';")
   
   for ID in $FAILED_IDS; do
     echo "Retrying $ID..."
     curl -X POST "$API_URL/api/admin/email-dlq/$ID/retry" \
       -H "Authorization: Bearer $ADMIN_TOKEN"
     sleep 1  # Rate limit requests
   done
   ```

3. **Execute Script:**
   ```bash
   chmod +x bulk-retry-dlq.sh
   ./bulk-retry-dlq.sh
   ```

4. **Monitor Progress:**
   ```bash
   # Watch queue stats
   watch -n 5 'curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.talentforge.com/api/admin/queue-stats | jq .'
   ```

---

## Alert Response

### DLQ Alert Received

**Severity**: Medium  
**Response Time**: 30 minutes

**Initial Response:**
1. Acknowledge alert
2. Check Resend API status: https://status.resend.com
3. Review alert payload for error message

**Investigation:**
1. Query failure rate:
   ```sql
   SELECT COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) as total,
          ROUND((COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*)) * 100, 2) as failure_rate
   FROM communications
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

2. Check for pattern (specific template, time range)

**Resolution Paths:**

- **Resend API Outage**: 
  - Wait for resolution
  - Bulk retry after recovery

- **Configuration Issue** (API key, template):
  - Fix configuration immediately
  - Bulk retry failed communications

- **Single Failure** (rare):
  - Manual retry via admin endpoint
  - Document cause if recurring

**Post-Resolution:**
- Update incident log
- Monitor failure rate for 1 hour
- Close alert

### High Queue Backlog

**Severity**: High  
**Response Time**: 15 minutes

**Threshold**: `waiting` count >1000

**Investigation:**
1. Check worker status: `ps aux | grep emailDeliveryWorker`
2. Check Redis connectivity: `redis-cli ping`
3. Check Resend API response times in logs

**Resolution:**
- **Worker Down**: Restart immediately
- **Redis Issues**: Restart Redis, check connectivity
- **API Slow**: Temporarily reduce concurrency

---

## Performance Benchmarks

### Service Level Objectives (SLOs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| First-attempt delivery time | <60s | Time from `enqueueEmailDelivery` to Resend API success |
| Throughput | >100 emails/minute | With concurrency=5 |
| Queue stats query | <100ms | GET /api/admin/queue-stats response time |
| Status update | <50ms | Communication record update time |
| Failure rate | <5% | Failed / (Failed + Sent) percentage |

### Capacity Planning

**Current Configuration:**
- Worker concurrency: 5
- Expected throughput: ~100 emails/minute
- Peak capacity: ~6000 emails/hour

**Scaling Recommendations:**
- For >10,000 emails/hour: Increase concurrency to 10-15
- For >50,000 emails/hour: Deploy multiple worker instances
- Redis: Current single instance supports up to 100,000 jobs

### Load Testing

**Test Scenario:**
1. Enqueue 1000 email jobs
2. Measure time to completion
3. Check failure rate
4. Monitor memory usage

**Expected Results:**
- Completion time: ~10 minutes (100 emails/min)
- Failure rate: <1%
- Memory usage: <500MB increase

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | No | - | Resend API key for email sending |
| `RESEND_FROM_EMAIL` | No | - | From email address |
| `ALERT_WEBHOOK_URL` | No | - | Webhook URL for DLQ alerts |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL |

### Queue Configuration

```typescript
{
  concurrency: 5,              // Concurrent job processing
  lockDuration: 30000,         // Job lock timeout (30s)
  attempts: 5,                 // Max retry attempts
  backoff: {
    type: 'exponential',       // Exponential backoff
    delay: 30000               // Initial delay (30s)
  },
  removeOnComplete: {
    age: 86400                 // Remove completed jobs after 24h
  },
  removeOnFail: false          // Keep failed jobs for DLQ
}
```

---

## Support Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Production outage | On-call engineer | 15 minutes |
| DLQ alerts | Platform team | 30 minutes |
| Resend API issues | Resend support | 1 hour |
| Configuration changes | DevOps team | 4 hours |

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-07-29 | 1.0 | Initial documentation |
