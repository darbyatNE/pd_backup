import os
import requests
import mysql.connector
from mysql.connector import Error
from datetime import date, timedelta
from dotenv import load_dotenv

# Test to retieve data "daily instantaneous load" from the PJM API and store it in the MySQL database.

load_dotenv() # .env hidden variables

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "port": int(os.getenv("DB_PORT", 3306))
}
PJM_API_KEY = os.getenv("PJM_API_KEY")

TARGET_DATE = date.today() - timedelta(days=1)

def fetch_pjm_inst_load(api_key, target_date):
    """Fetches instantaneous load data from the PJM API for a specific day."""
    print(f"Fetching data from PJM for {target_date.strftime('%Y-%m-%d')}...")

    if not api_key:
        print("Error: PJM_API_KEY is not set. Please check your .env file.")
        return None

    api_url = "https://api.pjm.com/api/v1/inst_load"
    
    start_datetime = f"{target_date.strftime('%Y-%m-%d')}T00:00:00"
    end_datetime = f"{target_date.strftime('%Y-%m-%d')}T23:59:59"

    headers = {'Ocp-Apim-Subscription-Key': api_key}
    params = {
        'startRow': 1,
        'rowCount': 50500,
        'datetime_beginning_ept': f'{start_datetime}to{end_datetime}',
        'format': 'json'
    }

    try:
        response = requests.get(api_url, headers=headers, params=params, timeout=30)
        print(f"API Response Status Code: {response.status_code}")
        
        response.raise_for_status()  
        data = response.json()
        print("API Response:", data)

        if 'items' in data:
            print(f"Successfully decoded JSON. Found {len(data['items'])} items.")
            return data['items']
        else:
            print("The expected key 'items' is not present in the response.")
            return None

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error occurred: {e}")
        print(f"Response Body: {response.text[:500]}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"A network-level error occurred: {e}")
        return None
    except requests.exceptions.JSONDecodeError:
        print("Failed to decode JSON. The API response may not be valid JSON.")
        print(f"Response Text: {response.text[:500]}")
        return None

def insert_load_data(db_params, pjm_data):
    """
    Inserts or updates PJM load data into the MySQL database using a batch operation.
    """
    if not pjm_data:
        print("No valid PJM data to insert.")
        return
        
    conn = None
    try:
        print("Connecting to the database...")
        conn = mysql.connector.connect(**db_params)
        if conn.is_connected():
            print("Database connection successful.")
            cursor = conn.cursor()

            sql = """
                INSERT INTO inst_load (datetime_beginning_ept, area, instantaneous_load)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    instantaneous_load = VALUES(instantaneous_load);
            """
            
            data_to_insert = [
                (item['datetime_beginning_ept'], item['area'], item['instantaneous_load'])
                for item in pjm_data
            ]
            
            print(f"Upserting {len(data_to_insert)} rows...")
            cursor.executemany(sql, data_to_insert)
            conn.commit()
            print(f"Operation completed. Affected rows: {cursor.rowcount}")
            cursor.close()

    except Error as e:
        print(f"Database error: {e}")
    finally:
        if conn and conn.is_connected():
            conn.close()
            print("Database connection closed.")

def main():
    """Main function to run the script."""
    print("--- Script Starting ---")
    pjm_data = fetch_pjm_inst_load(PJM_API_KEY, TARGET_DATE)
    
    if pjm_data:
        insert_load_data(DB_CONFIG, pjm_data)
    else:
        print("No data received from PJM. Exiting.")
    
    print("--- Script Finished ---")

if __name__ == "__main__":
    main()
