"""Resume parser using spaCy NER and pattern matching"""
import spacy
import re
from typing import Dict, List, Any
from datetime import datetime
import pdfplumber
from docx import Document


class ResumeParser:
    """Parse resumes using spaCy NER to extract structured data"""
    
    def __init__(self, model_name='en_core_web_sm'):
        """Initialize spaCy NER model"""
        self.nlp = spacy.load(model_name)
        
        # Skill keywords database
        self.skill_keywords = {
            'languages': [
                'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 
                'Ruby', 'Go', 'Rust', 'PHP', 'Swift', 'Kotlin', 'Scala',
                'R', 'MATLAB', 'Perl', 'Shell', 'Bash'
            ],
            'frameworks': [
                'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 
                'Flask', 'Spring', 'Next.js', 'Nest.js', '.NET', 'ASP.NET',
                'FastAPI', 'Rails', 'Laravel', 'Symfony', 'jQuery'
            ],
            'databases': [
                'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
                'DynamoDB', 'Cassandra', 'Oracle', 'SQL Server', 'SQLite',
                'MariaDB', 'CouchDB', 'Neo4j', 'Firebase'
            ],
            'cloud': [
                'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
                'CloudFormation', 'Ansible', 'Jenkins', 'CircleCI', 'Travis CI',
                'GitHub Actions', 'GitLab CI', 'Heroku', 'Vercel', 'Netlify'
            ],
            'tools': [
                'Git', 'GitHub', 'GitLab', 'Bitbucket', 'JIRA', 'Confluence',
                'Slack', 'VS Code', 'IntelliJ', 'Eclipse', 'Vim', 'Emacs',
                'Postman', 'Swagger', 'GraphQL', 'REST API', 'gRPC'
            ]
        }
    
    def parse(self, file_path: str, mime_type: str) -> Dict[str, Any]:
        """
        Parse resume file and extract structured data
        
        Args:
            file_path: Path to resume file
            mime_type: MIME type of the file
            
        Returns:
            Dictionary with extracted data
        """
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
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    
    def _extract_name(self, doc) -> str:
        """Extract candidate name using NER"""
        # Look for PERSON entities in first few sentences
        for ent in doc.ents:
            if ent.label_ == 'PERSON':
                # Filter out common false positives
                name = ent.text.strip()
                if len(name.split()) >= 2 and len(name) > 4:
                    return name
        return "Unknown"
    
    def _extract_email(self, text: str) -> str:
        """Extract email using regex"""
        pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        matches = re.findall(pattern, text)
        return matches[0] if matches else ""
    
    def _extract_phone(self, text: str) -> str:
        """Extract phone number using regex"""
        # Match various phone formats
        patterns = [
            r'\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b',
            r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                if isinstance(matches[0], tuple):
                    return f"({matches[0][0]}) {matches[0][1]}-{matches[0][2]}"
                return matches[0]
        return ""
    
    def _extract_skills(self, text: str) -> List[str]:
        """Extract skills by matching keywords"""
        skills = []
        text_lower = text.lower()
        
        for category, keywords in self.skill_keywords.items():
            for skill in keywords:
                # Use word boundaries to avoid partial matches
                pattern = r'\b' + re.escape(skill.lower()) + r'\b'
                if re.search(pattern, text_lower):
                    skills.append(skill)
        
        return list(set(skills))  # Remove duplicates
    
    def _calculate_experience(self, doc, text: str) -> int:
        """Calculate years of experience from dates and keywords"""
        # Method 1: Extract year mentions and calculate range
        years = re.findall(r'\b(19|20)\d{2}\b', text)
        if len(years) >= 2:
            years_int = sorted([int(y) for y in years])
            # Take the difference between oldest and newest year
            experience = years_int[-1] - years_int[0]
            if 0 < experience <= 50:  # Sanity check
                return experience
        
        # Method 2: Look for explicit mentions like "5 years" or "5+ years"
        experience_patterns = [
            r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience',
            r'experience[:\s]+(\d+)\+?\s*(?:years?|yrs?)',
        ]
        
        for pattern in experience_patterns:
            matches = re.findall(pattern, text.lower())
            if matches:
                return max([int(m) for m in matches])
        
        return 0
    
    def _extract_employers(self, doc, text: str) -> List[Dict[str, Any]]:
        """Extract employment history"""
        employers = []
        
        # Look for organization entities
        for ent in doc.ents:
            if ent.label_ == 'ORG':
                # Filter out common false positives
                org_name = ent.text.strip()
                if len(org_name) > 2 and not org_name.isdigit():
                    employers.append({
                        'name': org_name,
                        'title': 'Unknown',
                        'duration': None
                    })
        
        # Remove duplicates while preserving order
        seen = set()
        unique_employers = []
        for emp in employers:
            if emp['name'] not in seen:
                seen.add(emp['name'])
                unique_employers.append(emp)
        
        return unique_employers[:5]  # Limit to top 5
    
    def _extract_education(self, doc, text: str) -> List[Dict[str, Any]]:
        """Extract education history"""
        education = []
        
        # Common degree patterns
        degree_patterns = [
            (r'(Bachelor|B\.S\.|B\.A\.|BS|BA)\s+(?:of\s+)?(?:Science|Arts)?\s+in\s+([A-Za-z\s]+)', 'Bachelor'),
            (r'(Master|M\.S\.|M\.A\.|MS|MA)\s+(?:of\s+)?(?:Science|Arts)?\s+in\s+([A-Za-z\s]+)', 'Master'),
            (r'(PhD|Ph\.D\.|Doctorate)\s+in\s+([A-Za-z\s]+)', 'PhD'),
        ]
        
        for pattern, degree_type in degree_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                field = match[1].strip() if len(match) > 1 else 'Unknown'
                # Clean up field (remove trailing words like "from", "at")
                field = re.sub(r'\s+(from|at).*$', '', field, flags=re.IGNORECASE)
                education.append({
                    'degree': degree_type,
                    'field': field[:50],  # Limit field length
                    'institution': 'Unknown'
                })
        
        # Look for university/college mentions
        for ent in doc.ents:
            if ent.label_ == 'ORG' and any(word in ent.text.lower() for word in ['university', 'college', 'institute']):
                # Try to match with existing education entries
                for edu in education:
                    if edu['institution'] == 'Unknown':
                        edu['institution'] = ent.text
                        break
        
        return education
