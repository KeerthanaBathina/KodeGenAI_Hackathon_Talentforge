# Python Resume Parser Worker

AI-powered resume parsing worker using spaCy NER and BullMQ.

## Prerequisites

- Python 3.10 or higher
- Redis server running
- Node.js backend running

## Installation

### 1. Install Python Dependencies

```bash
cd backend/workers/python
pip install -r requirements.txt
```

### 2. Download spaCy Model

```bash
python -m spacy download en_core_web_sm
```

### 3. Configure Environment Variables

Create `.env` file in `backend/workers/python/`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Backend API Configuration
BACKEND_API_URL=http://localhost:3001
WORKER_TOKEN=your-32-char-worker-token

# Worker Configuration
WORKER_CONCURRENCY=5
SPACY_MODEL=en_core_web_sm
TEMP_DIR=/tmp/resumes
```

## Running the Worker

### Development Mode

```bash
cd backend/workers/python
python worker.py
```

### Production Mode with Systemd

Create `/etc/systemd/system/resume-parser.service`:

```ini
[Unit]
Description=Resume Parser Worker
After=network.target redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend/workers/python
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/python3 /path/to/backend/workers/python/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable resume-parser
sudo systemctl start resume-parser
sudo systemctl status resume-parser
```

## Running Tests

```bash
cd backend/workers/python
pytest tests/test_resume_parser.py -v
```

With coverage:

```bash
pytest tests/ --cov=parsers --cov-report=html
```

## Performance

- **Target SLA**: Parse resumes in <30 seconds
- **Concurrency**: Configurable (default: 5 concurrent jobs)
- **Retry Policy**: 3 attempts with exponential backoff (2s, 4s, 8s)

## Monitoring

View worker logs:

```bash
# Systemd
sudo journalctl -u resume-parser -f

# Direct run
tail -f /var/log/resume-parser.log
```

Check queue health:

```bash
curl http://localhost:3001/api/admin/queue-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Worker not processing jobs

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Verify queue exists:
   ```bash
   redis-cli KEYS "*resume-parse*"
   ```

3. Check worker logs for errors

### spaCy model not found

```bash
python -m spacy download en_core_web_sm
python -m spacy validate
```

### Timeout errors

- Increase job timeout in `resumeParseQueue.ts`
- Check PDF/DOCX file size and complexity
- Monitor system resources (CPU, memory)

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌────────────────┐
│   BullMQ    │────>│  Worker  │────>│  ResumeParser  │
│   Queue     │     │  (Async) │     │   (spaCy NER)  │
└─────────────┘     └──────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  POST Result │
                    │  to Backend  │
                    └──────────────┘
```

## Extracted Fields

- **name**: Candidate full name
- **email**: Email address
- **phone**: Phone number (formatted)
- **skills**: Array of technical skills (languages, frameworks, databases, cloud, tools)
- **experience_years**: Total years of experience
- **employers**: Array of { name, title, duration }
- **education**: Array of { degree, field, institution }
- **raw_text**: First 1000 chars of resume (debugging)
- **extracted_at**: ISO timestamp of extraction

## License

Proprietary - TalentForge AI Interview System
