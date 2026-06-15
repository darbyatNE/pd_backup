"""Database connector with SSH tunnel support for AWS RDS."""

import os
import sys
import time
from typing import Optional, List, Dict, Any, Tuple
from contextlib import contextmanager

import psycopg2
from psycopg2 import sql, extras
from sshtunnel import SSHTunnelForwarder
from sqlalchemy import create_engine, text, Engine
from sqlalchemy.pool import NullPool

from .config import Config


class DatabaseConnection:
    """PostgreSQL database connection with optional SSH tunnel.
    
    Supports both psycopg2 (for bulk operations) and SQLAlchemy (for ORM/queries).
    Automatically establishes SSH tunnel to EC2 when configured.
    
    Example:
        # With SSH tunnel (AWS RDS via EC2 jump host)
        db = DatabaseConnection(Config())
        with db.tunnel() as tunnel:
            conn = db.connect()
            results = conn.execute("SELECT * FROM pjm_da_hrl_lmps LIMIT 10")
        
        # Direct connection (local or VPN)
        db = DatabaseConnection(Config())
        conn = db.connect()
        results = conn.execute("SELECT * FROM pjm_da_hrl_lmps LIMIT 10")
        conn.close()
    """
    
    def __init__(self, config: Config):
        self.config = config
        self._tunnel: Optional[SSHTunnelForwarder] = None
        self._connection: Optional[psycopg2.extensions.connection] = None
        self._engine: Optional[Engine] = None
        
    @property
    def is_tunneled(self) -> bool:
        """Whether SSH tunnel is configured."""
        return self.config.use_ssh_tunnel
    
    @property
    def effective_host(self) -> str:
        """Database host to use (localhost if tunneled, else direct)."""
        if self.is_tunneled and self._tunnel:
            return 'localhost'
        return self.config.db_host
    
    @property
    def effective_port(self) -> int:
        """Database port to use (tunnel local port if tunneled, else direct)."""
        if self.is_tunneled and self._tunnel:
            return self.config.tunnel_local_port
        return self.config.db_port
    
    def start_tunnel(self) -> SSHTunnelForwarder:
        """Start SSH tunnel to EC2 instance.
        
        Returns:
            SSHTunnelForwarder instance
            
        Raises:
            ValueError: If SSH configuration is missing
            Exception: If tunnel fails to start
        """
        if not self.is_tunneled:
            raise ValueError(
                "SSH tunnel not configured. Set EC2_HOST, EC2_USER, and EC2_SSH_KEY_PATH in .env"
            )
        
        if self._tunnel and self._tunnel.is_active:
            return self._tunnel
        
        print(f"🔐 Setting up SSH tunnel to {self.config.ssh_host}...")
        print(f"   Remote: {self.config.db_host}:{self.config.db_port}")
        print(f"   Local: localhost:{self.config.tunnel_local_port}")
        
        # Verify SSH key exists
        key_path = self.config.ssh_key_path
        if not key_path or not os.path.exists(key_path):
            raise FileNotFoundError(f"SSH key not found: {key_path}")
        
        self._tunnel = SSHTunnelForwarder(
            (self.config.ssh_host, self.config.ssh_port),
            ssh_username=self.config.ssh_user,
            ssh_pkey=key_path,
            remote_bind_address=(self.config.db_host, self.config.db_port),
            local_bind_address=('localhost', self.config.tunnel_local_port),
            host_key_policy=None  # Consider adding host key verification for production
        )
        
        try:
            self._tunnel.start()
            print(f"   ✅ Tunnel established. Local port: {self.config.tunnel_local_port}")
            return self._tunnel
        except Exception as e:
            print(f"   ❌ Failed to start tunnel: {e}")
            raise
    
    def stop_tunnel(self):
        """Stop SSH tunnel if active."""
        if self._tunnel and self._tunnel.is_active:
            self._tunnel.stop()
            print("🔐 SSH tunnel closed.")
        self._tunnel = None
    
    @contextmanager
    def tunnel(self):
        """Context manager for SSH tunnel lifecycle.
        
        Example:
            with db.tunnel():
                conn = db.connect()
                # use connection
                conn.close()
        """
        if not self.is_tunneled:
            yield None
            return
        
        try:
            self.start_tunnel()
            yield self._tunnel
        finally:
            self.stop_tunnel()
    
    def get_connection_string(self, include_password: bool = True) -> str:
        """Build PostgreSQL connection string.
        
        Args:
            include_password: Whether to include password in string
            
        Returns:
            PostgreSQL connection URI
        """
        host = self.effective_host
        port = self.effective_port
        db = self.config.db_name
        user = self.config.db_user
        password = self.config.db_password
        
        if include_password and password:
            return f"postgresql://{user}:{password}@{host}:{port}/{db}"
        else:
            return f"postgresql://{user}@{host}:{port}/{db}"
    
    def connect(self, autocommit: bool = True, 
                statement_timeout: int = 30000) -> psycopg2.extensions.connection:
        """Create psycopg2 connection.
        
        Args:
            autocommit: Enable autocommit mode
            statement_timeout: Query timeout in milliseconds
            
        Returns:
            psycopg2 connection object
        """
        if self.is_tunneled and not (self._tunnel and self._tunnel.is_active):
            raise RuntimeError(
                "SSH tunnel not started. Use db.tunnel() context manager or db.start_tunnel()"
            )
        
        conn_str = (
            f"host={self.effective_host} "
            f"port={self.effective_port} "
            f"dbname={self.config.db_name} "
            f"user={self.config.db_user}"
        )
        
        if self.config.db_password:
            conn_str += f" password={self.config.db_password}"
        
        try:
            self._connection = psycopg2.connect(conn_str, options=f"-c statement_timeout={statement_timeout}")
            self._connection.autocommit = autocommit
            return self._connection
        except psycopg2.Error as e:
            print(f"   ❌ Database connection failed: {e}")
            raise
    
    def get_sqlalchemy_engine(self, poolclass=NullPool) -> Engine:
        """Create SQLAlchemy engine.
        
        Args:
            poolclass: Connection pool class (default NullPool for short-lived connections)
            
        Returns:
            SQLAlchemy Engine instance
        """
        if self._engine:
            return self._engine
        
        conn_string = self.get_connection_string()
        self._engine = create_engine(conn_string, poolclass=poolclass)
        return self._engine
    
    def close(self):
        """Close database connection and tunnel."""
        if self._connection:
            self._connection.close()
            self._connection = None
        
        if self._engine:
            self._engine.dispose()
            self._engine = None
        
        self.stop_tunnel()
    
    def __enter__(self):
        """Context manager entry."""
        if self.is_tunneled:
            self.start_tunnel()
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
        return False
    
    # Convenience methods for common operations
    
    def execute(self, query: str, params: Optional[Tuple] = None,
                fetch: bool = False) -> Optional[List[Tuple]]:
        """Execute a SQL query.
        
        Args:
            query: SQL query string
            params: Query parameters (for parameterized queries)
            fetch: Whether to fetch and return results
            
        Returns:
            Query results if fetch=True, else None
        """
        cursor = self._connection.cursor()
        try:
            cursor.execute(query, params)
            if fetch:
                return cursor.fetchall()
            return None
        finally:
            cursor.close()
    
    def upsert_batch(self, table: str, data: List[Dict[str, Any]],
                     conflict_keys: List[str],
                     update_cols: Optional[List[str]] = None,
                     batch_size: int = 1000) -> int:
        """Perform batched upsert (INSERT ... ON CONFLICT UPDATE).
        
        Args:
            table: Target table name
            data: List of dict rows to insert
            conflict_keys: Columns for conflict detection (e.g., ['iso_id', 'pnode_id'])
            update_cols: Columns to update on conflict (None = no update, just skip)
            batch_size: Rows per batch
            
        Returns:
            Total rows affected
        """
        if not data:
            return 0
        
        # Deduplicate within batch
        seen = set()
        unique_data = []
        for row in data:
            key = tuple(row.get(k) for k in conflict_keys)
            if key not in seen:
                seen.add(key)
                unique_data.append(row)
        
        if len(unique_data) < len(data):
            print(f"   🧹 Deduplicated: {len(data)} → {len(unique_data)} rows")
        
        columns = list(unique_data[0].keys())
        table_ident = sql.Identifier(table)
        cols_ident = sql.SQL(', ').join(map(sql.Identifier, columns))
        
        # Build base INSERT
        query = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(table_ident, cols_ident)
        
        # Add ON CONFLICT clause if specified
        if conflict_keys:
            conflict_ident = sql.SQL(', ').join(map(sql.Identifier, conflict_keys))
            
            if update_cols:
                # Update specified columns
                update_sql = sql.SQL(', ').join([
                    sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(col), sql.Identifier(col))
                    for col in update_cols
                ])
                query = sql.SQL("{} ON CONFLICT ({}) DO UPDATE SET {}").format(
                    query, conflict_ident, update_sql
                )
            else:
                # Skip on conflict (do nothing)
                query = sql.SQL("{} ON CONFLICT ({}) DO NOTHING").format(query, conflict_ident)
        
        total = 0
        cursor = self._connection.cursor()
        try:
            for i in range(0, len(unique_data), batch_size):
                batch = unique_data[i:i + batch_size]
                values = [[row.get(col) for col in columns] for row in batch]
                
                extras.execute_values(cursor, query.as_string(self._connection), values)
                total += cursor.rowcount
                
                # Brief pause to avoid overwhelming DB
                time.sleep(0.01)
        finally:
            cursor.close()
        
        return total
    
    def query_to_dict(self, query: str, params: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Execute query and return results as list of dicts.
        
        Args:
            query: SQL query string
            params: Named parameters for query
            
        Returns:
            Query results as list of dictionaries
        """
        cursor = self._connection.cursor()
        try:
            cursor.execute(query, params)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            cursor.close()
