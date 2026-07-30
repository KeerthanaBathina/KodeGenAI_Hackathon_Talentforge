"""Unit tests for resume parser"""
import pytest
import os
from parsers.resume_parser import ResumeParser


@pytest.fixture
def parser():
    return ResumeParser()


class TestEmailExtraction:
    def test_extract_single_email(self, parser):
        text = "Contact me at john.doe@example.com for details"
        email = parser._extract_email(text)
        assert email == "john.doe@example.com"
    
    def test_extract_first_email_from_multiple(self, parser):
        text = "john@example.com and jane@example.com"
        email = parser._extract_email(text)
        assert "@example.com" in email
    
    def test_extract_email_with_plus(self, parser):
        text = "Email: john+work@company.co.uk"
        email = parser._extract_email(text)
        assert email == "john+work@company.co.uk"
    
    def test_no_email_found(self, parser):
        text = "No email address in this text"
        email = parser._extract_email(text)
        assert email == ""


class TestPhoneExtraction:
    def test_extract_phone_with_parens(self, parser):
        text = "Phone: (555) 123-4567"
        phone = parser._extract_phone(text)
        assert "555" in phone
        assert "123" in phone
        assert "4567" in phone
    
    def test_extract_phone_with_dashes(self, parser):
        text = "Call 555-123-4567"
        phone = parser._extract_phone(text)
        assert "555" in phone or "5551234567" in phone
    
    def test_extract_phone_with_spaces(self, parser):
        text = "Mobile: 555 123 4567"
        phone = parser._extract_phone(text)
        assert len(phone) > 0
    
    def test_no_phone_found(self, parser):
        text = "No phone number here"
        phone = parser._extract_phone(text)
        assert phone == ""


class TestSkillsExtraction:
    def test_extract_programming_languages(self, parser):
        text = "Proficient in Python, Java, and C++"
        skills = parser._extract_skills(text)
        assert "Python" in skills
        assert "Java" in skills
        assert "C++" in skills
    
    def test_extract_frameworks(self, parser):
        text = "Experience with React, Node.js, and Django"
        skills = parser._extract_skills(text)
        assert "React" in skills
        assert "Node.js" in skills
        assert "Django" in skills
    
    def test_extract_databases(self, parser):
        text = "Worked with PostgreSQL, MongoDB, and Redis"
        skills = parser._extract_skills(text)
        assert "PostgreSQL" in skills
        assert "MongoDB" in skills
        assert "Redis" in skills
    
    def test_extract_cloud_technologies(self, parser):
        text = "Cloud platforms: AWS, Azure, Docker, Kubernetes"
        skills = parser._extract_skills(text)
        assert "AWS" in skills
        assert "Azure" in skills
        assert "Docker" in skills
        assert "Kubernetes" in skills
    
    def test_no_duplicate_skills(self, parser):
        text = "Python Python Python"
        skills = parser._extract_skills(text)
        assert skills.count("Python") == 1
    
    def test_case_insensitive_matching(self, parser):
        text = "Experience in python, REACT, and nodejs"
        skills = parser._extract_skills(text)
        assert "Python" in skills or "python" in skills


class TestExperienceCalculation:
    def test_calculate_from_year_range(self, parser):
        doc = parser.nlp("Worked from 2018 to 2024")
        text = "Worked from 2018 to 2024"
        years = parser._calculate_experience(doc, text)
        assert years == 6
    
    def test_calculate_from_explicit_mention(self, parser):
        doc = parser.nlp("8 years of experience")
        text = "8 years of experience"
        years = parser._calculate_experience(doc, text)
        assert years == 8
    
    def test_calculate_from_plus_notation(self, parser):
        doc = parser.nlp("5+ years experience")
        text = "5+ years experience"
        years = parser._calculate_experience(doc, text)
        assert years == 5
    
    def test_no_experience_found(self, parser):
        doc = parser.nlp("Just graduated")
        text = "Just graduated"
        years = parser._calculate_experience(doc, text)
        assert years == 0


class TestEmployerExtraction:
    def test_extract_organization_entities(self, parser):
        doc = parser.nlp("Worked at Google and Microsoft")
        text = "Worked at Google and Microsoft"
        employers = parser._extract_employers(doc, text)
        assert len(employers) > 0
    
    def test_filter_short_organizations(self, parser):
        doc = parser.nlp("Worked at AB and Company Name Inc")
        text = "Worked at AB and Company Name Inc"
        employers = parser._extract_employers(doc, text)
        # Should filter out "AB" (too short)
        assert all(len(emp['name']) > 2 for emp in employers)
    
    def test_limit_to_five_employers(self, parser):
        text = "Worked at " + ", ".join([f"Company{i}" for i in range(10)])
        doc = parser.nlp(text)
        employers = parser._extract_employers(doc, text)
        assert len(employers) <= 5


class TestEducationExtraction:
    def test_extract_bachelor_degree(self, parser):
        text = "Bachelor of Science in Computer Science from MIT"
        doc = parser.nlp(text)
        education = parser._extract_education(doc, text)
        assert len(education) > 0
        assert any("Bachelor" in edu['degree'] for edu in education)
    
    def test_extract_master_degree(self, parser):
        text = "Master of Science in Artificial Intelligence"
        doc = parser.nlp(text)
        education = parser._extract_education(doc, text)
        assert len(education) > 0
        assert any("Master" in edu['degree'] for edu in education)
    
    def test_extract_phd(self, parser):
        text = "PhD in Machine Learning"
        doc = parser.nlp(text)
        education = parser._extract_education(doc, text)
        assert len(education) > 0
        assert any("PhD" in edu['degree'] for edu in education)
    
    def test_extract_field_of_study(self, parser):
        text = "B.S. in Computer Science"
        doc = parser.nlp(text)
        education = parser._extract_education(doc, text)
        assert len(education) > 0
        assert any("Computer Science" in edu['field'] for edu in education)


class TestFullParsing:
    def test_unsupported_file_type(self, parser):
        with pytest.raises(ValueError, match="Unsupported file type"):
            parser.parse("test.txt", "text/plain")
    
    def test_parse_returns_all_fields(self, parser):
        # Would need actual PDF/DOCX files for full integration test
        # This is a structure test
        text = """
        John Doe
        john.doe@example.com
        (555) 123-4567
        
        Experience: 5 years
        Skills: Python, React, PostgreSQL
        
        Worked at Acme Corp as Senior Engineer
        
        Bachelor of Science in Computer Science
        """
        
        # Mock the file extraction
        parser._extract_from_pdf = lambda x: text
        
        result = parser.parse("dummy.pdf", "application/pdf")
        
        assert "name" in result
        assert "email" in result
        assert "phone" in result
        assert "skills" in result
        assert "experience_years" in result
        assert "employers" in result
        assert "education" in result
        assert "extracted_at" in result
        assert isinstance(result["skills"], list)
