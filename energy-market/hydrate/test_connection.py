import os
import mysql.connector
from dotenv import load_dotenv

# a test to make a connection to our cloud db

load_dotenv()

connection = mysql.connector.connect(
    host=os.getenv.DB_HOST,
    port=os.getenv.DB_PORT,
    user=os.getenv.DB_USER,
    password=os.getenv.DB_PASSWORD,
    database=os.getenv.DB_NAME
)
print("Local connection successful!")
