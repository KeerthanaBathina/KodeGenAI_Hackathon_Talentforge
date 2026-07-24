---
id: task_003
us_id: us_002
epic: EP-003
title: "Implement spaCy NER Resume Parser with Field Extraction"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Implement spaCy NER Resume Parser with Field Extraction

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 2 (extract fields matching resume content)

Implement the core resume parsing logic using spaCy Named Entity Recognition (NER) to extract structured data from PDF and DOCX files.

---

## Objective

Create resume parser that extracts:
1. **Personal Info**: name, email, phone
2. **Skills**: programming languages, frameworks, tools
3. **Experience**: years of experience, employers, job titles, dates
4. **Education**: degrees, institutions, graduation years

---

## Implementation Steps

### Step 1 — Create Resume Parser Class

Create `backend/workers/python/parsers/resume_parser.py`:

```python
import spacy
import re
from typing import Dict, List, Any
from datetime import datetime
import pdfplumber
from docx import Document

class ResumeParser:
    def __init__(self, model_name='en_core_web_sm'):
        """Initialize spaCy NER model"""
        self.nlp = spacy.load(model_name)
        
        # Skill keywords (can be extended or loaded from database)
        self.skill_keywords = {
            'languages': ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 
                         'Ruby', 'Go', 'Rust', 'PHP', 'Swift', 'Kotlin'],
            'frameworks': ['React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 
                          'Flask', 'Spring', 'Next.js', 'Nest.js', '.NET'],
            'databases': ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
                         'DynamoDB', 'Cassandra', 'Oracle', 'SQL Server'],
            'cloud': ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform'],
            'tools': ['Git', 'Jenkins', 'GitHub Actions', 'CircleCI', 'Jest', 'Pytest']
        }
    
    def parse(self, file_path: str, mime_type: str) -> Dict[str, Any]:
        """Parse resume file and extract structured data"""
        
        # Extract text based on file type
        if mime_type == 'application/pdf':
            text = self._extract_from_pdf(file_path)
        elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            text = self._extract_from_docx(file_path)
        else:
            raise ValueError(f"Unsupported file type: {mime_type}")
        
        # Process with spaCy
        doc = self.nlp(text)
        
        # Extract structured data
        parsed_data = {
            'name': self._extract_name(doc),
            'email': self._extract_email(text),
            'phone': self._extract_phone(text),
            'skills': self._extract_skills(text),
            'experience_years': self._calculate_experience(doc, text),
            'employers': self._extract_employers(doc, text),
            'education': self._extract_education(doc, text),
            'raw_text': text[:1000],  # Store first 1000 chars for debugging
            'extracted_at': datetime.utcnow().isoformat()
        }
        
        return parsed_data
    
    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF"""
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
        return text
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    
    def _extract_name(self, doc) -> str:
        """Extract candidate name using NER"""
        for ent in doc.ents:
            if ent.label_ == 'PERSON':
                return ent.text
        return "Unknown"
    
    def _extract_email(self, text: str) -> str:
        """Extract email using regex"""
        pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        matches = re.findall(pattern, text)
        return matches[0] if matches else ""
    
    def _extract_phone(self, text: str) -> str:
        """Extract phone number using regex"""
        pattern = r'\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b'
        matches = re.findall(pattern, text)
        if matches:
            return f"({matches[0][0]}) {matches[0][1]}-{matches[0][2]}"
        return ""
    
    def _extract_skills(self, text: str) -> List[str]:
        """Extract skills by matching keywords"""
        skills = []
        text_lower = text.lower()
        
        for category, keywords in self.skill_keywords.items():
            for skill in keywords:
                if skill.lower() in text_lower:
                    skills.append(skill)
        
        return list(set(skills))  # Remove duplicates
    
    def _calculate_experience(self, doc, text: str) -> int:
        """Calculate years of experience from dates and keywords"""
        # Extract year mentions
        years = re.findall(r'\b(19|20)\d{2}\b', text)
        if len(years) >= 2:
            years_int = [int(y) for y in years]
            return max(years_int) - min(years_int)
        
        # Look for explicit mentions like "5 years" or "5+ years"
        experience_pattern = r'(\d+)\+?\s*(?:years?|yrs?)'
        matches = re.findall(experience_pattern, text.lower())
        if matches:
            return max([int(m) for m in matches])
        
        return 0
    
    def _extract_employers(self, doc, text: str) -> List[Dict[str, Any]]:
        """Extract employment history"""
        employers = []
        
        # Look for organization entities
        for ent in doc.ents:
            if ent.label_ == 'ORG':
                employers.append({
                    'name': ent.text,
                    'title': 'Unknown',  # Would need more sophisticated parsing
                    'duration': None
                })
        
        return employers[:5]  # Limit to top 5
    
    def _extract_education(self, doc, text: str) -> List[Dict[str, Any]]:
        """Extract education history"""
        education = []
        
        # Common degree keywords
        degree_patterns = [
            r'(Bachelor|B\.S\.|B\.A\.|BS|BA)\s+(?:of\s+)?(?:Science|Arts)?\s+in\s+([A-Za-z\s]+)',
            r'(Master|M\.S\.|M\.A\.|MS|MA)\s+(?:of\s+)?(?:Science|Arts)?\s+in\s+([A-Za-z\s]+)',
            r'(PhD|Ph\.D\.|Doctorate)\s+in\s+([A-Za-z\s]+)'
        ]
        
        for pattern in degree_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                education.append({
                    'degree': match[0],
                    'field': match[1].strip() if len(match) > 1 else 'Unknown',
                    'institution': 'Unknown'  # Would need more sophisticated parsing
                })
        
        return education
```

### Step 2 — Create Skills Database (Optional Enhancement)

Create `backend/workers/python/data/skills.json`:

```json
{
  "languages": ["Python", "JavaScript", "TypeScript", "Java", "..."],
  "frameworks": ["React", "Angular", "Vue", "..."],
  "databases": ["PostgreSQL", "MySQL", "MongoDB", "..."],
  "cloud": ["AWS", "Azure", "GCP", "..."],
  "tools": ["Git", "Docker", "Kubernetes", "..."]
}
```

### Step 3 — Add Unit Tests

Create `backend/workers/python/tests/test_resume_parser.py`:

```python
import pytest
from parsers.resume_parser import ResumeParser

@pytest.fixture
def parser():
    return ResumeParser()

def test_extract_email(parser):
    text = "Contact me at john.doe@example.com for details"
    email = parser._extract_email(text)
    assert email == "john.doe@example.com"

def test_extract_phone(parser):
    text = "Call me at (555) 123-4567 anytime"
    phone = parser._extract_phone(text)
    assert "(555) 123-4567" in phone

def test_extract_skills(parser):
    text = "Experienced in Python, React, PostgreSQL, and AWS"
    skills = parser._extract_skills(text)
    assert "Python" in skills
    assert "React" in skills
    assert "PostgreSQL" in skills
    assert "AWS" in skills

def test_calculate_experience(parser):
    doc = parser.nlp("Worked from 2018 to 2023")
    text = "Worked from 2018 to 2023"
    years = parser._calculate_experience(doc, text)
    assert years == 5
```

---

## Acceptance Criteria

- [ ] Parser extracts name, email, phone from test resume
- [ ] Skills extraction includes at least 10 common tech skills
- [ ] Experience calculation accurate within ±1 year
- [ ] Employer extraction finds organization names
- [ ] Education extraction finds degree types
- [ ] Parser handles both PDF and DOCX formats
- [ ] Processing time < 25 seconds per resume

---

## Testing Checklist

- [ ] Unit test: Email extraction with various formats
- [ ] Unit test: Phone extraction with various formats
- [ ] Unit test: Skills matching finds all keywords
- [ ] Unit test: Experience calculation from years
- [ ] Integration test: Full parse of sample PDF resume
- [ ] Integration test: Full parse of sample DOCX resume
- [ ] Performance test: Parse completes in < 25s

---

## Dependencies

- spaCy model downloaded: `python -m spacy download en_core_web_sm`
- pdfplumber library installed
- python-docx library installed
- Sample resume files for testing

---

## Definition of Done

- [ ] Parser class implemented with all extraction methods
- [ ] PDF and DOCX extraction working
- [ ] All extraction methods have unit tests
- [ ] Integration tests with real resume files pass
- [ ] Extraction accuracy validated manually with 3+ resumes
- [ ] Performance meets 25s requirement
