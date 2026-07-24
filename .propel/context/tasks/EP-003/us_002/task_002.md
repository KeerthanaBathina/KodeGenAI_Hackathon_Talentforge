---
id: task_002
us_id: us_002
epic: EP-003
title: "Set Up Python Worker Service with BullMQ Consumer"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Set Up Python Worker Service with BullMQ Consumer

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (worker picks up job), Scenario 3 (error handling), Scenario 4 (concurrency)

Create Python worker service that consumes jobs from the `resume-parse` BullMQ queue, processes them using spaCy, and reports results back to the Node.js backend.

---

## Objective

Implement Python worker that:
1. Connects to BullMQ via Redis
2. Consumes jobs from `resume-parse` queue
3. Downloads resume file from Supabase Storage
4. Processes file with spaCy (delegated to TASK-003)
5. POSTs parsed results to Node.js callback endpoint

---

## Implementation Steps

### Step 1 — Create Python Worker Project Structure

```
backend/
  workers/
    python/
      requirements.txt
      worker.py
      config.py
      parsers/
        __init__.py
        resume_parser.py
      utils/
        __init__.py
        storage.py
```

### Step 2 — Define Dependencies

Create `backend/workers/python/requirements.txt`:

```
bullmq==1.1.0
redis==5.0.0
spacy==3.7.0
pdfplumber==0.10.0
python-docx==1.1.0
requests==2.31.0
python-dotenv==1.0.0
```

### Step 3 — Create Worker Configuration

Create `backend/workers/python/config.py`:

```python
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
    REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
    
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    BACKEND_API_URL = os.getenv('BACKEND_API_URL', 'http://localhost:3001')
    WORKER_CONCURRENCY = int(os.getenv('WORKER_CONCURRENCY', '5'))
    
    SPACY_MODEL = os.getenv('SPACY_MODEL', 'en_core_web_sm')

config = Config()
```

### Step 4 — Implement BullMQ Consumer

Create `backend/workers/python/worker.py`:

```python
import asyncio
import logging
from bullmq import Worker, Job
import redis
from config import config
from parsers.resume_parser import ResumeParser
from utils.storage import download_from_supabase
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Redis connection
redis_client = redis.Redis(
    host=config.REDIS_HOST,
    port=config.REDIS_PORT,
    password=config.REDIS_PASSWORD,
    decode_responses=True
)

# Initialize parser
parser = ResumeParser()

async def process_resume_job(job: Job):
    """Process a single resume parsing job"""
    data = job.data
    resume_id = data['resumeId']
    storage_key = data['storageKey']
    
    logger.info(f"Processing resume {resume_id}")
    
    try:
        # Download file from Supabase
        file_path = await download_from_supabase(
            storage_key, 
            data['fileName']
        )
        
        # Parse resume with spaCy
        parsed_data = parser.parse(file_path, data['mimeType'])
        
        # Send result to Node.js backend
        response = requests.post(
            f"{config.BACKEND_API_URL}/api/webhooks/parse-result",
            json={
                'resumeId': resume_id,
                'parsedData': parsed_data,
                'status': 'success'
            },
            headers={'X-Worker-Token': config.WORKER_TOKEN},
            timeout=10
        )
        response.raise_for_status()
        
        logger.info(f"Resume {resume_id} parsed successfully")
        return {'success': True, 'resumeId': resume_id}
        
    except Exception as e:
        logger.error(f"Failed to parse resume {resume_id}: {str(e)}")
        
        # Send failure to backend
        try:
            requests.post(
                f"{config.BACKEND_API_URL}/api/webhooks/parse-result",
                json={
                    'resumeId': resume_id,
                    'status': 'failed',
                    'error': str(e)
                },
                headers={'X-Worker-Token': config.WORKER_TOKEN},
                timeout=10
            )
        except:
            pass
        
        raise  # Re-raise for BullMQ retry

async def main():
    """Start the worker"""
    worker = Worker(
        'resume-parse',
        process_resume_job,
        {
            'connection': {
                'host': config.REDIS_HOST,
                'port': config.REDIS_PORT,
                'password': config.REDIS_PASSWORD
            },
            'concurrency': config.WORKER_CONCURRENCY
        }
    )
    
    logger.info(f"Worker started with concurrency {config.WORKER_CONCURRENCY}")
    
    # Keep worker running
    while True:
        await asyncio.sleep(1)

if __name__ == '__main__':
    asyncio.run(main())
```

### Step 5 — Create Supabase Storage Utility

Create `backend/workers/python/utils/storage.py`:

```python
import os
import requests
from config import config

async def download_from_supabase(storage_key: str, filename: str) -> str:
    """Download file from Supabase Storage"""
    
    # Generate download URL
    url = f"{config.SUPABASE_URL}/storage/v1/object/resumes/{storage_key}"
    headers = {
        'Authorization': f'Bearer {config.SUPABASE_SERVICE_KEY}'
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    # Save to temp directory
    temp_dir = '/tmp/resumes'
    os.makedirs(temp_dir, exist_ok=True)
    
    file_path = os.path.join(temp_dir, filename)
    with open(file_path, 'wb') as f:
        f.write(response.content)
    
    return file_path
```

### Step 6 — Add Environment Variables

Update `backend/.env`:

```bash
# Python Worker Configuration
WORKER_CONCURRENCY=5
SPACY_MODEL=en_core_web_sm
WORKER_TOKEN=<generate-32-char-token>
```

---

## Acceptance Criteria

- [ ] Python worker connects to Redis successfully
- [ ] Worker consumes jobs from `resume-parse` queue
- [ ] Concurrency configurable via environment variable
- [ ] Worker downloads files from Supabase Storage
- [ ] Worker POSTs results to Node.js callback endpoint
- [ ] Worker handles errors and allows BullMQ retries

---

## Testing Checklist

- [ ] Unit test: Config loads from environment
- [ ] Unit test: Storage download handles errors
- [ ] Integration test: Worker processes test job end-to-end
- [ ] Integration test: Worker retries on parse failure
- [ ] Load test: Worker handles 5 concurrent jobs

---

## Dependencies

- Python 3.10+ installed
- Redis connection from TASK-001
- Supabase service role key
- spaCy model downloaded (`python -m spacy download en_core_web_sm`)

---

## Definition of Done

- [ ] Worker code created and tested locally
- [ ] Dependencies installed and documented
- [ ] Worker successfully processes test job
- [ ] Error handling verified with failing job
- [ ] Concurrency verified with multiple jobs
- [ ] All tests passing
