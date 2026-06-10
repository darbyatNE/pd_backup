import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sshtunnel import SSHTunnelForwarder

# Load your .env file
load_dotenv()

# Database connection details
DB_HOST = os.getenv('DB_HOST')
DB_PORT = int(os.getenv('DB_PORT', 5432))
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

# SSH tunnel details
SSH_HOST = os.getenv('EC2_HOST')
SSH_USER = os.getenv('EC2_USER')
SSH_KEY_PATH = os.path.expanduser(os.getenv('EC2_SSH_KEY_PATH'))

# Local port for tunnel
LOCAL_PORT = 5433

print(f"Setting up SSH tunnel to {SSH_HOST} for database at {DB_HOST}:{DB_PORT}")

# Set up SSH tunnel
tunnel = SSHTunnelForwarder(
    (SSH_HOST, 22),
    ssh_username=SSH_USER,
    ssh_pkey=SSH_KEY_PATH,
    remote_bind_address=('localhost', DB_PORT),
    local_bind_address=('localhost', LOCAL_PORT)
)

tunnel.start()
print(f"Tunnel established. Local port: {LOCAL_PORT}")

# Database URL using the tunnel
if DB_PASSWORD:
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@localhost:{LOCAL_PORT}/{DB_NAME}"
else:
    DATABASE_URL = f"postgresql://{DB_USER}@localhost:{LOCAL_PORT}/{DB_NAME}"

print(f"Attempting to connect to: {DATABASE_URL}")

try:
    # Create engine
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        print("\n✅ SUCCESS: Database connection established!\n")
        
        # List of tables to inspect
        tables_to_check = [
            "pjm_da_hrl_lmps", 
            "pjm_rt_hrl_lmps", 
            "pjm_lat_long"
        ]

        for table in tables_to_check:
            try:
                # Get column names efficiently
                result = conn.execute(text(f"SELECT * FROM {table} LIMIT 0"))
                columns = list(result.keys())
                
                print(f"--- Columns in '{table}' ---")
                print(columns)
                print("")
                
            except Exception as table_error:
                print(f"⚠️  Could not read table '{table}': {table_error}\n")

        print("---------------------------------------------------")
        print("Copy the list above and paste it in the chat.")
        print("---------------------------------------------------\n")

except Exception as e:
    print("\n❌ ERROR: Connection failed.")
    print(e)

finally:
    tunnel.stop()
    print("SSH tunnel closed.")