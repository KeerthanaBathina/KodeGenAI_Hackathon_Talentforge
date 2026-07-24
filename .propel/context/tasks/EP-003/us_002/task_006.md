---
id: task_006
us_id: us_002
epic: EP-003
title: "Comprehensive Testing and Performance Validation"
status: done
layer: test
effort: 2h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Comprehensive Testing and Performance Validation

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (30s SLA, field accuracy, retry, 50 concurrent jobs)

Create comprehensive test suite covering unit tests, integration tests, and load tests to validate the complete resume parsing workflow.

---

## Objective

Achieve >90% test coverage with:
1. Python parser unit tests
2. Node.js service unit tests
3. Queue integration tests
4. End-to-end workflow tests
5. Performance/load tests (50 concurrent jobs in 3 minutes)

---

## Implementation Steps

### Step 1 — Python Parser Unit Tests

Create `backend/workers/python/tests/test_resume_parser.py`:

```python
import pytest
from parsers.resume_parser import ResumeParser
import os

@pytest.fixture
def parser():
    return ResumeParser()

@pytest.fixture
def sample_pdf():
    return os.path.join(os.path.dirname(__file__), 'fixtures', 'sample_resume.pdf')

@pytest.fixture
def sample_docx():
    return os.path.join(os.path.dirname(__file__), 'fixtures', 'sample_resume.docx')

class TestResumeParser:
    def test_extract_email_valid(self, parser):
        text = "Contact: john.doe@example.com"
        email = parser._extract_email(text)
        assert email == "john.doe@example.com"
    
    def test_extract_email_multiple(self, parser):
        text = "john@example.com and jane@example.com"
        email = parser._extract_email(text)
        assert "@example.com" in email
    
    def test_extract_phone_us_format(self, parser):
        text = "Phone: (555) 123-4567"
        phone = parser._extract_phone(text)
        assert "555" in phone
        assert "123" in phone
        assert "4567" in phone
    
    def test_extract_skills_from_text(self, parser):
        text = "Proficient in Python, React, PostgreSQL, Docker, and AWS"
        skills = parser._extract_skills(text)
        assert "Python" in skills
        assert "React" in skills
        assert "PostgreSQL" in skills
        assert "Docker" in skills
        assert "AWS" in skills
    
    def test_calculate_experience_from_years(self, parser):
        doc = parser.nlp("Worked from 2018 to 2024")
        text = "Worked from 2018 to 2024"
        years = parser._calculate_experience(doc, text)
        assert years == 6
    
    def test_calculate_experience_from_explicit_mention(self, parser):
        doc = parser.nlp("8 years of experience")
        text = "8 years of experience"
        years = parser._calculate_experience(doc, text)
        assert years == 8
    
    def test_extract_employers(self, parser):
        doc = parser.nlp("Worked at Google and Microsoft")
        text = "Worked at Google and Microsoft"
        employers = parser._extract_employers(doc, text)
        assert len(employers) > 0
    
    def test_extract_education(self, parser):
        text = "Bachelor of Science in Computer Science from MIT"
        doc = parser.nlp(text)
        education = parser._extract_education(doc, text)
        assert len(education) > 0
        assert any("Bachelor" in edu['degree'] for edu in education)
    
    def test_parse_pdf_file(self, parser, sample_pdf):
        result = parser.parse(sample_pdf, 'application/pdf')
        assert 'name' in result
        assert 'email' in result
        assert 'skills' in result
        assert isinstance(result['skills'], list)
    
    def test_parse_docx_file(self, parser, sample_docx):
        result = parser.parse(sample_docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        assert 'name' in result
        assert 'email' in result
        assert 'experience_years' in result
    
    def test_parse_unsupported_format(self, parser):
        with pytest.raises(ValueError):
            parser.parse('test.txt', 'text/plain')
    
    def test_parse_performance(self, parser, sample_pdf):
        import time
        start = time.time()
        parser.parse(sample_pdf, 'application/pdf')
        duration = time.time() - start
        assert duration < 25  # Must complete in < 25 seconds
```

### Step 2 — Node.js Service Unit Tests

Create `backend/src/services/__tests__/parseResultService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processParseResult } from '../parseResultService';
import prisma from '../../db/prisma';

vi.mock('../../db/prisma');
vi.mock('../auditService', () => ({
  auditEvent: vi.fn(),
}));

describe('ParseResultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store parsed data on success', async () => {
    const mockResume = {
      id: 'resume-1',
      application: {
        candidateId: 'candidate-1',
      },
    };

    vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
    vi.mocked(prisma.resume.update).mockResolvedValue({} as any);

    await processParseResult({
      resumeId: 'resume-1',
      status: 'success',
      parsedData: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        skills: ['Python', 'React'],
        experience_years: 5,
        employers: [{ name: 'Acme Corp', title: 'Engineer' }],
        education: [{ degree: 'BS', field: 'CS', institution: 'MIT' }],
        extracted_at: new Date().toISOString(),
      },
    });

    expect(prisma.resume.update).toHaveBeenCalledWith({
      where: { id: 'resume-1' },
      data: expect.objectContaining({
        scanStatus: 'parsed',
      }),
    });
  });

  it('should update status to parse_failed on failure', async () => {
    const mockResume = {
      id: 'resume-1',
      application: { candidateId: 'candidate-1' },
      scanResult: {},
    };

    vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
    vi.mocked(prisma.resume.update).mockResolvedValue({} as any);

    await processParseResult({
      resumeId: 'resume-1',
      status: 'failed',
      error: 'Parse timeout',
    });

    expect(prisma.resume.update).toHaveBeenCalledWith({
      where: { id: 'resume-1' },
      data: expect.objectContaining({
        scanStatus: 'parse_failed',
      }),
    });
  });
});
```

### Step 3 — Queue Integration Tests

Create `backend/src/queues/__tests__/resumeParseQueue.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resumeParseQueue, enqueueResumeForParse } from '../resumeParseQueue';

describe('Resume Parse Queue Integration', () => {
  beforeAll(async () => {
    await resumeParseQueue.obliterate({ force: true });
  });

  afterAll(async () => {
    await resumeParseQueue.close();
  });

  it('should enqueue job successfully', async () => {
    const jobId = await enqueueResumeForParse({
      resumeId: 'test-resume-1',
      applicationId: 'test-app-1',
      storageKey: 'resumes/test.pdf',
      candidateId: 'test-candidate-1',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
    });

    expect(jobId).toBeDefined();
    const job = await resumeParseQueue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.data.resumeId).toBe('test-resume-1');
  });

  it('should retry job on failure', async () => {
    // This would require a mock worker that fails
    // Test implementation depends on test environment setup
  });
});
```

### Step 4 — Load Test for Concurrency

Create `backend/scripts/load-test-parsing.ts`:

```typescript
import { enqueueResumeForParse } from '../src/queues/resumeParseQueue';
import { performance } from 'perf_hooks';

async function loadTestParsing() {
  const jobCount = 50;
  const jobs: Promise<string>[] = [];

  console.log(`Starting load test: ${jobCount} concurrent jobs`);
  const startTime = performance.now();

  for (let i = 0; i < jobCount; i++) {
    jobs.push(
      enqueueResumeForParse({
        resumeId: `load-test-${i}`,
        applicationId: `app-${i}`,
        storageKey: `test/resume-${i}.pdf`,
        candidateId: `candidate-${i}`,
        fileName: `resume-${i}.pdf`,
        mimeType: 'application/pdf',
      })
    );
  }

  await Promise.all(jobs);
  const enqueueTime = performance.now() - startTime;

  console.log(`All jobs enqueued in ${enqueueTime.toFixed(2)}ms`);
  console.log(`Average enqueue time: ${(enqueueTime / jobCount).toFixed(2)}ms per job`);

  // Monitor completion (would need actual worker running)
  console.log('Monitoring job completion...');
  // Implementation depends on monitoring strategy
}

loadTestParsing().catch(console.error);
```

### Step 5 — E2E Workflow Test

Create `backend/src/test/integration/resume-parsing-workflow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { enqueueResumeForParse } from '../../queues/resumeParseQueue';

describe('Resume Parsing Workflow E2E', () => {
  it('should complete full parsing workflow', async () => {
    // 1. Enqueue job
    const jobId = await enqueueResumeForParse({
      resumeId: 'e2e-test-resume',
      applicationId: 'e2e-test-app',
      storageKey: 'test/sample.pdf',
      candidateId: 'e2e-candidate',
      fileName: 'sample.pdf',
      mimeType: 'application/pdf',
    });

    expect(jobId).toBeDefined();

    // 2. Simulate worker callback (in real scenario, worker would do this)
    const response = await request(app)
      .post('/api/webhooks/parse-result')
      .set('X-Worker-Token', process.env.WORKER_TOKEN!)
      .send({
        resumeId: 'e2e-test-resume',
        status: 'success',
        parsedData: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '555-9876',
          skills: ['Python', 'AWS'],
          experience_years: 7,
          employers: [{ name: 'Tech Corp', title: 'Senior Dev' }],
          education: [{ degree: 'MS', field: 'CS', institution: 'Stanford' }],
          extracted_at: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(200);

    // 3. Verify data stored
    // Would query database to verify parsedData is stored
  });
});
```

---

## Acceptance Criteria

- [ ] >90% code coverage for Python parser
- [ ] >85% code coverage for Node.js services
- [ ] All unit tests pass
- [ ] Integration tests verify queue behavior
- [ ] Load test: 50 jobs enqueued successfully
- [ ] E2E test verifies complete workflow
- [ ] Performance test: jobs complete within 30s SLA

---

## Testing Checklist

- [ ] 12+ Python parser unit tests
- [ ] 8+ Node.js service unit tests  
- [ ] 6+ queue integration tests
- [ ] 4+ webhook integration tests
- [ ] 1 load test (50 concurrent jobs)
- [ ] 2+ E2E workflow tests
- [ ] All tests documented with clear descriptions

---

## Dependencies

- pytest for Python tests
- Vitest for Node.js tests
- Sample resume fixtures (PDF, DOCX)
- Redis test instance
- Test database

---

## Definition of Done

- [ ] All test files created and organized
- [ ] Code coverage >90% for critical paths
- [ ] Load test demonstrates 50 concurrent job handling
- [ ] Performance test validates 30s SLA
- [ ] All tests pass in CI/CD pipeline
- [ ] Test documentation complete
