import os
import requests
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()
ERCOT_API_KEY = os.getenv("ERCOT_API_KEY")

def test_ercot_connection():
    print("📡 Pinging ERCOT API...")
    
    # This is a common endpoint for Settlement Point Prices (Report ID: NP6-845-CD)
    # If your ERCOT developer portal gave you a different URL, swap it here!
    url = "https://api.ercot.com/api/public-reports/np6-845-cd/recent" 
    
    headers = {
        "Ocp-Apim-Subscription-Key": ERCOT_API_KEY,
        "Accept": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status() # Will throw an error if your key is invalid
        
        data = response.json()
        
        print("✅ Connection Successful! Here is the shape of one record:")
        # Print just the first item beautifully formatted
        if 'data' in data and len(data['data']) > 0:
            print(json.dumps(data['data'][0], indent=2))
        else:
            print("⚠️ Connected, but the data array is empty. Let's check the endpoint.")
            
    except requests.exceptions.HTTPError as e:
        print(f"❌ HTTP Error: {e}")
        print("Check your API Key or endpoint URL.")

if __name__ == "__main__":
    test_ercot_connection()
