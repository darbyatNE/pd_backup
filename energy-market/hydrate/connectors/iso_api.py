"""ISO API Clients for PJM, ERCOT, and MISO."""

import time
import requests
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Iterator
from datetime import date, timedelta
from .config import Config


class ISOClient(ABC):
    """Abstract base class for ISO API clients."""
    
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self._last_request_time = 0
    
    @property
    @abstractmethod
    def api_key(self) -> Optional[str]:
        """API key for authentication."""
        pass
    
    @property
    @abstractmethod
    def base_url(self) -> str:
        """Base URL for API endpoints."""
        pass
    
    @property
    @abstractmethod
    def rate_limit_delay(self) -> float:
        """Seconds to wait between requests."""
        return 1.0
    
    def _rate_limit(self):
        """Enforce rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.rate_limit_delay:
            sleep_time = self.rate_limit_delay - elapsed
            time.sleep(sleep_time)
        self._last_request_time = time.time()
    
    def _request(self, method: str, endpoint: str, 
                 params: Optional[Dict] = None,
                 headers: Optional[Dict] = None,
                 retries: int = 3,
                 timeout: int = 60) -> Dict[str, Any]:
        """Make a rate-limited API request with retry logic.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path (e.g., 'da_hrl_lmps')
            params: Query parameters
            headers: Additional headers
            retries: Number of retry attempts for 429/5xx errors
            timeout: Request timeout in seconds
            
        Returns:
            Parsed JSON response
            
        Raises:
            requests.HTTPError: On non-retryable errors
        """
        url = f"{self.base_url}/{endpoint}"
        request_headers = self._get_headers()
        if headers:
            request_headers.update(headers)
        
        for attempt in range(retries):
            self._rate_limit()
            
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    headers=request_headers,
                    timeout=timeout
                )
                
                # Handle rate limiting
                if response.status_code == 429:
                    if attempt < retries - 1:
                        wait_time = 30 if attempt == 0 else 60
                        print(f"   [429 Rate limited. Waiting {wait_time}s...]")
                        time.sleep(wait_time)
                        continue
                    else:
                        response.raise_for_status()
                
                response.raise_for_status()
                return response.json()
                
            except requests.exceptions.RequestException as e:
                if attempt < retries - 1:
                    wait_time = 5 * (attempt + 1)
                    print(f"   [Request failed. Retrying in {wait_time}s... Error: {e}]")
                    time.sleep(wait_time)
                else:
                    raise
        
        raise requests.HTTPError(f"Max retries exceeded for {url}")
    
    @abstractmethod
    def _get_headers(self) -> Dict[str, str]:
        """Get authentication headers for API requests."""
        pass
    
    def get(self, endpoint: str, params: Optional[Dict] = None, 
            **kwargs) -> Dict[str, Any]:
        """Make a GET request to the API."""
        return self._request('GET', endpoint, params=params, **kwargs)


class PJMClient(ISOClient):
    """PJM ISO API Client.
    
    Supports endpoints:
    - da_hrl_lmps: Day-ahead hourly LMPs
    - rt_hrl_lmps: Real-time hourly LMPs  
    - rt_5min_lmps: Real-time 5-minute LMPs
    - rt_constraints: Real-time transmission constraints
    """
    
    BASE_URL = 'https://api.pjm.com/api/v1'
    RATE_LIMIT = 12  # PJM requires 12s between requests
    
    @property
    def api_key(self) -> Optional[str]:
        return self.config.pjm_api_key
    
    @property
    def base_url(self) -> str:
        return self.BASE_URL
    
    @property
    def rate_limit_delay(self) -> float:
        return self.RATE_LIMIT
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            'Ocp-Apim-Subscription-Key': self.api_key,
            'Accept': 'application/json'
        }
    
    def query_lmp_day_ahead(self, query_date: date, 
                            start_row: int = 1,
                            row_count: int = 50000) -> Dict[str, Any]:
        """Query day-ahead hourly LMPs for a specific date.
        
        Args:
            query_date: Date to query
            start_row: Starting row for pagination
            row_count: Number of rows to fetch (max 50000)
            
        Returns:
            API response with 'items' array
        """
        date_str = query_date.strftime('%Y-%m-%d')
        datetime_filter = f"{date_str} 00:00:00 to {date_str} 23:59:00"
        
        params = {
            'rowCount': row_count,
            'startRow': start_row,
            'datetime_beginning_ept': datetime_filter
        }
        
        return self.get('da_hrl_lmps', params=params)
    
    def query_lmp_realtime(self, query_date: date,
                           start_row: int = 1,
                           row_count: int = 50000) -> Dict[str, Any]:
        """Query real-time hourly LMPs for a specific date."""
        date_str = query_date.strftime('%Y-%m-%d')
        datetime_filter = f"{date_str} 00:00:00 to {date_str} 23:59:00"
        
        params = {
            'rowCount': row_count,
            'startRow': start_row,
            'datetime_beginning_ept': datetime_filter
        }
        
        return self.get('rt_hrl_lmps', params=params)
    
    def query_lmp_5min(self, query_date: date,
                      start_row: int = 1,
                      row_count: int = 50000) -> Dict[str, Any]:
        """Query real-time 5-minute LMPs for a specific date."""
        date_str = query_date.strftime('%Y-%m-%d')
        datetime_filter = f"{date_str} 00:00:00 to {date_str} 23:59:00"
        
        params = {
            'rowCount': row_count,
            'startRow': start_row,
            'datetime_beginning_ept': datetime_filter
        }
        
        return self.get('rt_5min_lmps', params=params)
    
    def fetch_date_range(self, start_date: date, end_date: date,
                        endpoint: str = 'da_hrl_lmps') -> Iterator[Dict[str, Any]]:
        """Iterate through a date range and fetch LMP data.
        
        Yields individual items from paginated responses.
        
        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            endpoint: API endpoint to use
        """
        current = start_date
        while current <= end_date:
            start_row = 1
            has_more = True
            
            while has_more:
                response = self._request(
                    'GET', endpoint,
                    params={
                        'rowCount': 50000,
                        'startRow': start_row,
                        'datetime_beginning_ept': (
                            f"{current.strftime('%Y-%m-%d')} 00:00:00 to "
                            f"{current.strftime('%Y-%m-%d')} 23:59:00"
                        )
                    }
                )
                
                items = response.get('items', [])
                yield from items
                
                # Check for more pages
                if len(items) < 50000:
                    has_more = False
                else:
                    start_row += 50000
            
            current += timedelta(days=1)


class ERCOTClient(ISOClient):
    """ERCOT ISO API Client (placeholder - implement based on ERCOT API docs)."""
    
    @property
    def api_key(self) -> Optional[str]:
        return self.config.ercot_api_key
    
    @property
    def base_url(self) -> str:
        return 'https://api.ercot.com/api/public-reports'
    
    @property
    def rate_limit_delay(self) -> float:
        return 1.0  # ERCOT rate limit
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json'
        }


class MISOClient(ISOClient):
    """MISO ISO API Client (placeholder - implement based on MISO API docs)."""
    
    @property
    def api_key(self) -> Optional[str]:
        return self.config.miso_api_key
    
    @property
    def base_url(self) -> str:
        return 'https://api.misoenergy.com/MISORTWDDataBroker'
    
    @property
    def rate_limit_delay(self) -> float:
        return 2.0  # MISO rate limit
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            'Ocp-Apim-Subscription-Key': self.api_key,
            'Accept': 'application/json'
        }
