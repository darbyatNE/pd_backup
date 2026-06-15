"""Configuration management for connectors."""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


class Config:
    """Centralized configuration from .env file."""
    
    def __init__(self, env_path: Optional[Path] = None):
        """Load configuration from .env file.
        
        Args:
            env_path: Path to .env file. Auto-detected if not provided.
        """
        if env_path is None:
            # Find .env in project root (2 levels up from connectors/)
            current_dir = Path(__file__).resolve().parent
            env_path = current_dir.parents[2] / '.env'
        
        load_dotenv(dotenv_path=env_path, override=True)
        
        # Validate required env vars
        self._validate()
    
    def _validate(self):
        """Validate that required configuration is present."""
        required = []
        
        # Check ISO API configs
        if not self.pjm_api_key:
            required.append('PJM_API_KEY')
        
        # Check DB configs  
        if not self.db_host or not self.db_name:
            required.extend(['DB_HOST', 'DB_NAME'])
        
        if required:
            raise ValueError(f"Missing required environment variables: {', '.join(required)}")
    
    # ISO API Credentials
    @property
    def pjm_api_key(self) -> Optional[str]:
        return os.getenv('PJM_API_KEY')
    
    @property
    def ercot_api_key(self) -> Optional[str]:
        return os.getenv('ERCOT_API_KEY')
    
    @property
    def miso_api_key(self) -> Optional[str]:
        return os.getenv('MISO_API_KEY')
    
    # Database Credentials (AWS RDS)
    @property
    def db_host(self) -> Optional[str]:
        return os.getenv('DB_HOST')
    
    @property
    def db_port(self) -> int:
        return int(os.getenv('DB_PORT', '5432'))
    
    @property
    def db_name(self) -> Optional[str]:
        return os.getenv('DB_NAME')
    
    @property
    def db_user(self) -> Optional[str]:
        return os.getenv('DB_USER')
    
    @property
    def db_password(self) -> Optional[str]:
        return os.getenv('DB_PASSWORD')
    
    # SSH Tunnel Config (EC2 Jump Host)
    @property
    def ssh_host(self) -> Optional[str]:
        """EC2 instance hostname or IP for SSH tunnel."""
        return os.getenv('EC2_HOST') or os.getenv('SSH_HOST')
    
    @property
    def ssh_user(self) -> Optional[str]:
        """SSH username for EC2 instance."""
        return os.getenv('EC2_USER') or os.getenv('SSH_USER')
    
    @property
    def ssh_key_path(self) -> Optional[str]:
        """Path to SSH private key (.pem file)."""
        key_path = os.getenv('EC2_SSH_KEY_PATH') or os.getenv('SSH_KEY_PATH')
        if key_path:
            return os.path.expanduser(key_path)
        return None
    
    @property
    def ssh_port(self) -> int:
        return int(os.getenv('SSH_PORT', '22'))
    
    @property
    def tunnel_local_port(self) -> int:
        """Local port for SSH tunnel forwarding."""
        return int(os.getenv('TUNNEL_LOCAL_PORT', '5433'))
    
    @property
    def use_ssh_tunnel(self) -> bool:
        """Whether to use SSH tunnel for database connection."""
        return all([self.ssh_host, self.ssh_user, self.ssh_key_path])
    
    # Legacy Supabase (for migration)
    @property
    def supabase_url(self) -> Optional[str]:
        return os.getenv('SUPABASE_URL')
    
    @property
    def supabase_key(self) -> Optional[str]:
        return os.getenv('SUPABASE_SECRET_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
