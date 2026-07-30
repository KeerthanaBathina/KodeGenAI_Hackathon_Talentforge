"""BullMQ worker for processing resume parsing jobs"""
import asyncio
import logging
import time
from bullmq import Worker, Job
from config import config
from parsers.resume_parser import ResumeParser
from utils.storage import download_from_supabase, cleanup_temp_file
import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize parser
parser = ResumeParser(model_name=config.SPACY_MODEL)
logger.info(f"Initialized spaCy parser with model: {config.SPACY_MODEL}")


async def process_resume_job(job: Job):
    """Process a single resume parsing job"""
    data = job.data
    resume_id = data['resumeId']
    storage_key = data['storageKey']
    file_name = data['fileName']
    mime_type = data['mimeType']
    
    logger.info(f"Processing resume {resume_id} (job {job.id})")
    start_time = time.time()
    
    file_path = None
    
    try:
        # Download file from Supabase
        logger.info(f"Downloading file from Supabase: {storage_key}")
        file_path = download_from_supabase(storage_key, file_name)
        
        # Parse resume with spaCy
        logger.info(f"Parsing resume with spaCy")
        parsed_data = parser.parse(file_path, mime_type)
        
        # Send result to Node.js backend
        response = requests.post(
            f"{config.BACKEND_API_URL}/api/webhooks/parse-result",
            json={
                'resumeId': resume_id,
                'status': 'success',
                'parsedData': parsed_data,
            },
            headers={'X-Worker-Token': config.WORKER_TOKEN},
            timeout=10
        )
        response.raise_for_status()
        
        elapsed = time.time() - start_time
        logger.info(
            f"Resume {resume_id} parsed successfully in {elapsed:.2f}s "
            f"(skills: {len(parsed_data['skills'])}, "
            f"experience: {parsed_data['experience_years']} years)"
        )
        
        return {'success': True, 'resumeId': resume_id, 'elapsed': elapsed}
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"Failed to parse resume {resume_id} after {elapsed:.2f}s: {str(e)}")
        
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
        except Exception as callback_error:
            logger.error(f"Failed to send error callback: {callback_error}")
        
        # Re-raise for BullMQ retry
        raise
    
    finally:
        # Cleanup temp file
        if file_path:
            cleanup_temp_file(file_path)


async def main():
    """Start the worker"""
    logger.info(f"Starting resume parse worker")
    logger.info(f"Redis: {config.REDIS_HOST}:{config.REDIS_PORT}")
    logger.info(f"Backend API: {config.BACKEND_API_URL}")
    logger.info(f"Concurrency: {config.WORKER_CONCURRENCY}")
    
    worker = Worker(
        'resume-parse',
        process_resume_job,
        {
            'connection': {
                'host': config.REDIS_HOST,
                'port': config.REDIS_PORT,
                'password': config.REDIS_PASSWORD,
            },
            'concurrency': config.WORKER_CONCURRENCY,
        }
    )
    
    logger.info(f"Worker started successfully")
    
    # Keep worker running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down worker...")
        await worker.close()
        logger.info("Worker shut down successfully")


if __name__ == '__main__':
    asyncio.run(main())
