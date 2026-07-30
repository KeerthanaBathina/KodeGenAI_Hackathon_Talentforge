"""Utility functions for downloading files from Supabase Storage"""
import os
import requests
from config import config

def download_from_supabase(storage_key: str, filename: str) -> str:
    """
    Download file from Supabase Storage
    
    Args:
        storage_key: Storage key in Supabase (e.g., 'resumes/candidate-1/file.pdf')
        filename: Original filename
        
    Returns:
        Local file path where file was saved
    """
    # Generate download URL
    url = f"{config.SUPABASE_URL}/storage/v1/object/resumes/{storage_key}"
    headers = {
        'Authorization': f'Bearer {config.SUPABASE_SERVICE_KEY}'
    }
    
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    
    # Ensure temp directory exists
    os.makedirs(config.TEMP_DIR, exist_ok=True)
    
    # Save to temp directory with unique name
    file_path = os.path.join(config.TEMP_DIR, filename)
    with open(file_path, 'wb') as f:
        f.write(response.content)
    
    return file_path


def cleanup_temp_file(file_path: str) -> None:
    """Delete temporary file"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Warning: Failed to cleanup temp file {file_path}: {e}")
