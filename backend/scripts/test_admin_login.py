
import asyncio
import sys
import httpx
from pathlib import Path

async def test_login():
    url = "http://localhost:8000/api/v1/admin/auth/login"
    data = {
        "username": "admin",
        "password": "admin123456"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=data)
            print(f"Status Code: {response.status_code}")
            print(f"Response Body: {response.text}")
            if response.status_code == 200:
                print("✅ Login successful")
            else:
                print("❌ Login failed")
        except Exception as e:
            print(f"❌ Error connecting to server: {e}")

if __name__ == "__main__":
    asyncio.run(test_login())
