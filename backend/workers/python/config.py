import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Redis Configuration
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
    REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
    
    # Supabase Configuration
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    # Backend API Configuration
    BACKEND_API_URL = os.getenv('BACKEND_API_URL', 'http://localhost:3001')
    WORKER_TOKEN = os.getenv('WORKER_TOKEN')
    
    # Worker Configuration
    WORKER_CONCURRENCY = int(os.getenv('WORKER_CONCURRENCY', '5'))
    SPACY_MODEL = os.getenv('SPACY_MODEL', 'en_core_web_sm')
    
    # Temp Directory
    TEMP_DIR = os.getenv('TEMP_DIR', '/tmp/resumes')

config = Config()
